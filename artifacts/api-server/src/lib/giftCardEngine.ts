/**
 * Gift card engine — Square issues & holds liability; Orderly sells/redeems UX.
 * Gated by ORDERLY_GIFT_CARDS_ENABLED + program active + tenant posType=square.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  giftCardProgramsTable,
  giftCardsTable,
  giftCardTransactionsTable,
  tenantsTable,
  type GiftCardProgram,
} from "@workspace/db";
import {
  activateGiftCard,
  createDigitalGiftCard,
  redeemGiftCardActivity,
  retrieveGiftCard,
  retrieveGiftCardFromGan,
} from "../integrations/squareGiftCards";
import { createSquarePaymentOnly } from "../integrations/square";
import { logger } from "./logger";

export function isGiftCardEngineEnabled(): boolean {
  const v = process.env.ORDERLY_GIFT_CARDS_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function getGiftCardProgram(
  tenantId: string,
): Promise<GiftCardProgram | null> {
  const rows = await db
    .select()
    .from(giftCardProgramsTable)
    .where(eq(giftCardProgramsTable.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertGiftCardProgram(input: {
  tenantId: string;
  enabled?: boolean;
  status?: string;
  allowedAmountsCents?: number[];
  minAmountCents?: number;
  maxAmountCents?: number;
  sellOnline?: boolean;
}): Promise<GiftCardProgram> {
  const existing = await getGiftCardProgram(input.tenantId);
  const now = new Date();
  if (!existing) {
    await db.insert(giftCardProgramsTable).values({
      tenantId: input.tenantId,
      enabled: input.enabled ?? false,
      status: input.status ?? "draft",
      allowedAmountsCents: input.allowedAmountsCents ?? [
        2500, 5000, 10000, 25000,
      ],
      minAmountCents: input.minAmountCents ?? 1000,
      maxAmountCents: input.maxAmountCents ?? 50000,
      sellOnline: input.sellOnline ?? true,
      updatedAt: now,
      createdAt: now,
    });
  } else {
    await db
      .update(giftCardProgramsTable)
      .set({
        enabled: input.enabled ?? existing.enabled,
        status: input.status ?? existing.status,
        allowedAmountsCents:
          input.allowedAmountsCents ?? existing.allowedAmountsCents,
        minAmountCents: input.minAmountCents ?? existing.minAmountCents,
        maxAmountCents: input.maxAmountCents ?? existing.maxAmountCents,
        sellOnline: input.sellOnline ?? existing.sellOnline,
        updatedAt: now,
      })
      .where(eq(giftCardProgramsTable.tenantId, input.tenantId));
  }
  const row = await getGiftCardProgram(input.tenantId);
  if (!row) throw new Error("gift card program upsert failed");
  return row;
}

async function assertSquareTenant(tenantId: string): Promise<{
  slug: string;
  posType: string;
}> {
  const rows = await db
    .select({
      slug: tenantsTable.slug,
      posType: tenantsTable.posType,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Tenant not found");
  if (row.posType !== "square") {
    throw new Error("Gift cards require Square POS (non-Square deferred)");
  }
  return row;
}

function maskGan(gan: string | null | undefined): string | null {
  if (!gan) return null;
  const g = gan.replace(/\s+/g, "");
  if (g.length <= 4) return "••••";
  return `••••${g.slice(-4)}`;
}

export async function getGiftCardBalanceByGan(input: {
  tenantId: string;
  gan: string;
}): Promise<{
  found: boolean;
  balanceCents: number;
  state: string | null;
  ganMasked: string | null;
  squareGiftCardId?: string;
}> {
  const { slug } = await assertSquareTenant(input.tenantId);
  let card;
  try {
    card = await retrieveGiftCardFromGan({
      tenantSlug: slug,
      gan: input.gan,
    });
  } catch {
    return {
      found: false,
      balanceCents: 0,
      state: null,
      ganMasked: maskGan(input.gan),
    };
  }
  const balanceCents = Number(card.balance_money?.amount ?? 0);
  // Upsert local mirror
  const localId = `gc_${card.id.replace(/[^a-zA-Z0-9]/g, "").slice(-20)}`;
  const existing = await db
    .select()
    .from(giftCardsTable)
    .where(
      and(
        eq(giftCardsTable.tenantId, input.tenantId),
        eq(giftCardsTable.squareGiftCardId, card.id),
      ),
    )
    .limit(1);
  const now = new Date();
  if (!existing[0]) {
    await db.insert(giftCardsTable).values({
      id: localId,
      tenantId: input.tenantId,
      squareGiftCardId: card.id,
      gan: card.gan ?? input.gan.trim(),
      state: card.state ?? "ACTIVE",
      balanceCents,
      currency: card.balance_money?.currency ?? "USD",
      source: "square_pos",
      updatedAt: now,
      createdAt: now,
    });
  } else {
    await db
      .update(giftCardsTable)
      .set({
        gan: card.gan ?? existing[0].gan,
        state: card.state ?? existing[0].state,
        balanceCents,
        updatedAt: now,
      })
      .where(eq(giftCardsTable.id, existing[0].id));
  }
  return {
    found: true,
    balanceCents,
    state: card.state ?? null,
    ganMasked: maskGan(card.gan ?? input.gan),
    squareGiftCardId: card.id,
  };
}

/**
 * Purchase digital gift card:
 * 1) Charge buyer card via existing Square Payments path
 * 2) Create DIGITAL gift card
 * 3) ACTIVATE with paid amount
 *
 * Legal: do not enable in production without counsel/CPA sign-off.
 */
export async function purchaseGiftCard(input: {
  tenantId: string;
  amountCents: number;
  squarePaymentSourceId: string;
  purchaserEmail?: string;
  purchaserCustomerId?: string;
  recipientEmail?: string;
  recipientName?: string;
  buyerName?: string;
}): Promise<{
  ok: true;
  giftCardId: string;
  ganMasked: string | null;
  balanceCents: number;
  squarePaymentId: string;
}> {
  if (!isGiftCardEngineEnabled()) {
    throw new Error("Gift card engine disabled (ORDERLY_GIFT_CARDS_ENABLED)");
  }
  const program = await getGiftCardProgram(input.tenantId);
  if (!program?.enabled || program.status !== "active") {
    throw new Error("Gift card program not active");
  }
  const { slug } = await assertSquareTenant(input.tenantId);

  const amount = Math.round(input.amountCents);
  if (amount < program.minAmountCents || amount > program.maxAmountCents) {
    throw new Error(
      `Amount must be between $${(program.minAmountCents / 100).toFixed(2)} and $${(program.maxAmountCents / 100).toFixed(2)}`,
    );
  }
  const allowed = program.allowedAmountsCents ?? [];
  if (allowed.length > 0 && !allowed.includes(amount)) {
    throw new Error("Amount not in allowed preset list");
  }

  // Charge buyer first — never activate an unpaid card
  const payment = await createSquarePaymentOnly({
    tenantSlug: slug,
    sourceId: input.squarePaymentSourceId,
    amountCents: amount,
    note: `Orderly gift card $${(amount / 100).toFixed(2)}`,
    buyerEmail: input.purchaserEmail,
    buyerName: input.buyerName,
  });

  const created = await createDigitalGiftCard({ tenantSlug: slug });
  const activated = await activateGiftCard({
    tenantSlug: slug,
    giftCardId: created.id,
    amountCents: amount,
    referenceId: payment.paymentId,
    buyerPaymentInstrumentIds: [input.squarePaymentSourceId],
  });

  const balanceCents = Number(
    activated.giftCard.balance_money?.amount ?? amount,
  );
  const localId = `gc_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const now = new Date();
  await db.insert(giftCardsTable).values({
    id: localId,
    tenantId: input.tenantId,
    squareGiftCardId: activated.giftCard.id,
    gan: activated.giftCard.gan ?? created.gan ?? null,
    state: activated.giftCard.state ?? "ACTIVE",
    balanceCents,
    currency: "USD",
    purchaserCustomerId: input.purchaserCustomerId ?? null,
    purchaserEmail: input.purchaserEmail ?? null,
    recipientEmail: input.recipientEmail ?? null,
    recipientName: input.recipientName ?? null,
    source: "orderly",
    updatedAt: now,
    createdAt: now,
  });

  const txnId = `gct_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  await db.insert(giftCardTransactionsTable).values({
    id: txnId,
    tenantId: input.tenantId,
    giftCardId: localId,
    type: "purchase",
    amountCents: amount,
    squarePaymentId: payment.paymentId,
    squareActivityId: activated.activityId ?? null,
    reason: "Online gift card purchase",
    bpAnchorStatus: "skipped",
  });
  await db.insert(giftCardTransactionsTable).values({
    id: `gct_${randomUUID().replace(/-/g, "").slice(0, 22)}`,
    tenantId: input.tenantId,
    giftCardId: localId,
    type: "activate",
    amountCents: amount,
    squarePaymentId: payment.paymentId,
    squareActivityId: activated.activityId ?? null,
    reason: "Square ACTIVATE",
    bpAnchorStatus: "skipped",
  });

  return {
    ok: true,
    giftCardId: localId,
    ganMasked: maskGan(activated.giftCard.gan ?? created.gan),
    balanceCents,
    squarePaymentId: payment.paymentId,
  };
}

export async function redeemGiftCardForOrder(input: {
  tenantId: string;
  gan: string;
  amountCents: number;
  orderId?: string;
}): Promise<{
  ok: true;
  amountCents: number;
  balanceCents: number;
  squareGiftCardId: string;
}> {
  if (!isGiftCardEngineEnabled()) {
    throw new Error("Gift card engine disabled");
  }
  const program = await getGiftCardProgram(input.tenantId);
  if (!program?.enabled || program.status !== "active") {
    throw new Error("Gift card program not active");
  }
  const { slug } = await assertSquareTenant(input.tenantId);
  const card = await retrieveGiftCardFromGan({
    tenantSlug: slug,
    gan: input.gan,
  });
  const balance = Number(card.balance_money?.amount ?? 0);
  const amount = Math.round(input.amountCents);
  if (amount <= 0) throw new Error("Redeem amount must be positive");
  if (amount > balance) throw new Error("Insufficient gift card balance");

  const redeemed = await redeemGiftCardActivity({
    tenantSlug: slug,
    giftCardId: card.id,
    amountCents: amount,
    referenceId: input.orderId,
  });
  const newBalance = Number(
    redeemed.giftCard.balance_money?.amount ?? balance - amount,
  );

  const local = await db
    .select()
    .from(giftCardsTable)
    .where(
      and(
        eq(giftCardsTable.tenantId, input.tenantId),
        eq(giftCardsTable.squareGiftCardId, card.id),
      ),
    )
    .limit(1);
  const localId = local[0]?.id;
  if (localId) {
    await db
      .update(giftCardsTable)
      .set({
        balanceCents: newBalance,
        state: redeemed.giftCard.state ?? local[0]!.state,
        updatedAt: new Date(),
      })
      .where(eq(giftCardsTable.id, localId));
    await db.insert(giftCardTransactionsTable).values({
      id: `gct_${randomUUID().replace(/-/g, "").slice(0, 22)}`,
      tenantId: input.tenantId,
      giftCardId: localId,
      type: "redeem",
      amountCents: -amount,
      orderId: input.orderId ?? null,
      squareActivityId: redeemed.activityId ?? null,
      reason: "Checkout redeem",
      bpAnchorStatus: "skipped",
    });
  }

  return {
    ok: true,
    amountCents: amount,
    balanceCents: newBalance,
    squareGiftCardId: card.id,
  };
}

/** Append-only migrate stub — does not pull Owner.com. Master-only via dashboard. */
export async function recordMigratedGiftCard(input: {
  tenantId: string;
  squareGiftCardId: string;
  gan?: string;
  balanceCents: number;
  externalRef: string;
  reason: string;
}): Promise<{ ok: true; giftCardId: string }> {
  const { slug } = await assertSquareTenant(input.tenantId);
  // Prefer live Square balance when id known
  let balance = input.balanceCents;
  let state = "ACTIVE";
  let gan = input.gan ?? null;
  try {
    const live = await retrieveGiftCard({
      tenantSlug: slug,
      giftCardId: input.squareGiftCardId,
    });
    balance = Number(live.balance_money?.amount ?? balance);
    state = live.state ?? state;
    gan = live.gan ?? gan;
  } catch (err) {
    logger.warn({ err }, "Migrate gift card: Square retrieve failed, using provided balance");
  }
  const localId = `gc_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const now = new Date();
  await db.insert(giftCardsTable).values({
    id: localId,
    tenantId: input.tenantId,
    squareGiftCardId: input.squareGiftCardId,
    gan,
    state,
    balanceCents: balance,
    currency: "USD",
    externalRef: input.externalRef,
    source: "migrate",
    updatedAt: now,
    createdAt: now,
  });
  await db.insert(giftCardTransactionsTable).values({
    id: `gct_${randomUUID().replace(/-/g, "").slice(0, 22)}`,
    tenantId: input.tenantId,
    giftCardId: localId,
    type: "migrate",
    amountCents: balance,
    reason: input.reason,
    externalRef: input.externalRef,
    bpAnchorStatus: "skipped",
  });
  return { ok: true, giftCardId: localId };
}

export async function listGiftCardsForTenant(tenantId: string, limit = 50) {
  const rows = await db
    .select({
      id: giftCardsTable.id,
      state: giftCardsTable.state,
      balanceCents: giftCardsTable.balanceCents,
      gan: giftCardsTable.gan,
      source: giftCardsTable.source,
      recipientEmail: giftCardsTable.recipientEmail,
      createdAt: giftCardsTable.createdAt,
    })
    .from(giftCardsTable)
    .where(eq(giftCardsTable.tenantId, tenantId))
    .orderBy(desc(giftCardsTable.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    balanceCents: r.balanceCents,
    ganMasked: maskGan(r.gan),
    source: r.source,
    recipientEmail: r.recipientEmail,
    createdAt: r.createdAt,
  }));
}

/** Quote redeem — does not commit. Caps to balance and optional order total. */
export async function quoteGiftCardRedeem(input: {
  tenantId: string;
  gan: string;
  amountCents: number;
  orderTotalCents?: number;
}): Promise<{
  found: boolean;
  balanceCents: number;
  redeemableCents: number;
  ganMasked: string | null;
}> {
  const bal = await getGiftCardBalanceByGan({
    tenantId: input.tenantId,
    gan: input.gan,
  });
  if (!bal.found) {
    return {
      found: false,
      balanceCents: 0,
      redeemableCents: 0,
      ganMasked: bal.ganMasked,
    };
  }
  let want = Math.max(0, Math.round(input.amountCents));
  if (
    input.orderTotalCents != null &&
    Number.isFinite(input.orderTotalCents)
  ) {
    want = Math.min(want, Math.max(0, Math.round(input.orderTotalCents)));
  }
  return {
    found: true,
    balanceCents: bal.balanceCents,
    redeemableCents: Math.min(want, bal.balanceCents),
    ganMasked: bal.ganMasked,
  };
}

export { maskGan };
