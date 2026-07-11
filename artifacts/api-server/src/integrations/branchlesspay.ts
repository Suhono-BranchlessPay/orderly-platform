/**
 * BranchlessPay integrations:
 * 1) Optional pre-pay Audit Shield fraud check (legacy soft gate)
 * 2) Post-pay blockchain anchor via POST /api/v1/anchor (mode=platform only)
 * 3) Pos-native: receive/store proof from BP webhook or pull-by-reference
 *
 * Secrets (per tenant, then global fallback):
 *   BRANCHLESSPAY_LICENSE_KEY  — Bearer for /api/v1/anchor (platform mode)
 *   BRANCHLESSPAY_WEBHOOK_SECRET — auth for POST /api/anchor-callback
 *   BRANCHLESSPAY_API_KEY + BRANCHLESSPAY_MERCHANT_ID — optional shield pre-check
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { tenantSecret } from "../lib/tenant";

const BP_ANCHOR_URL =
  process.env.BRANCHLESSPAY_ANCHOR_URL?.replace(/\/$/, "") ||
  "https://branchlesspay.com/api/v1/anchor";

const BP_API_BASE =
  process.env.BRANCHLESSPAY_API_BASE?.replace(/\/$/, "") ||
  "https://branchlesspay.com/api/v1";

const BRANCHLESSPAY_ENVIRONMENT =
  process.env.BRANCHLESSPAY_ENVIRONMENT ?? "sandbox";

const BRANCHLESSPAY_SHIELD_BASE =
  BRANCHLESSPAY_ENVIRONMENT === "production"
    ? "https://api.branchlesspay.com"
    : "https://sandbox-api.branchlesspay.com";

const MONAD_EXPLORER_TX =
  process.env.BRANCHLESSPAY_EXPLORER_TX_BASE?.replace(/\/$/, "") ||
  "https://testnet.monadexplorer.com/tx";

export type AnchorMode = "platform" | "pos-native";

export interface AuditEventInput {
  orderId: string;
  customerName: string;
  customerPhone: string;
  orderType: "pickup" | "delivery";
  total: number;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  ipAddress?: string;
  userAgent?: string;
  tenantSlug: string;
}

export interface AuditEventResult {
  auditId: string;
  riskScore: number;
  approved: boolean;
  message: string;
}

export interface AnchorPaidOrderInput {
  orderId: string;
  tenantSlug: string;
  tenantName: string;
  orderType: "pickup" | "delivery";
  total: number;
  currency?: string;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  customerName: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
}

export interface AnchorPaidOrderResult {
  ok: boolean;
  anchorId?: string;
  contentHash?: string;
  txHash?: string | null;
  explorerUrl?: string | null;
  verifyUrl?: string | null;
  status?: string;
  error?: string;
}

export interface AnchorProof {
  anchorId: string | null;
  contentHash: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  status: string;
  referenceId: string | null;
}

function licenseKey(slug: string): string | undefined {
  // Platform-first: one Orderly key for all restaurants (tenant_id distinguishes).
  // Optional per-tenant override only if TENANT_{SLUG}_BRANCHLESSPAY_LICENSE_KEY is set
  // and no global platform key exists — or set both; tenant override wins when present.
  const perTenant =
    process.env[`TENANT_${slug.toUpperCase()}_BRANCHLESSPAY_LICENSE_KEY`]?.trim() ||
    process.env[`TENANT_${slug.toUpperCase()}_BP_LICENSE_KEY`]?.trim();
  const platform =
    process.env.BRANCHLESSPAY_LICENSE_KEY?.trim() ||
    process.env.BP_LICENSE_KEY?.trim();
  // Prefer platform key when present (scalable multi-tenant). Per-tenant only if no platform key.
  return platform || perTenant || undefined;
}

export function webhookSecret(slug?: string): string | undefined {
  if (slug) {
    const perTenant = tenantSecret(slug, "BRANCHLESSPAY_WEBHOOK_SECRET");
    if (perTenant) return perTenant;
  }
  return (
    process.env.BRANCHLESSPAY_WEBHOOK_SECRET?.trim() ||
    process.env.BP_WEBHOOK_SECRET?.trim() ||
    undefined
  );
}

export function isBranchlesspayConfigured(slug?: string): boolean {
  const s = slug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  return Boolean(
    tenantSecret(s, "BRANCHLESSPAY_API_KEY") &&
      tenantSecret(s, "BRANCHLESSPAY_MERCHANT_ID"),
  );
}

export function isBpAnchorConfigured(slug?: string): boolean {
  const s = slug ?? process.env.TENANT_ID?.trim() ?? "samurai";
  return Boolean(licenseKey(s));
}

/** Website may POST /api/v1/anchor only in platform mode. */
export function shouldWebsiteAnchor(mode: AnchorMode | string | undefined): boolean {
  return String(mode ?? "platform").toLowerCase() !== "pos-native";
}

export function explorerUrlForTx(txHash: string | null | undefined): string | null {
  if (!txHash) return null;
  if (txHash.startsWith("http")) return txHash;
  return `${MONAD_EXPLORER_TX}/${txHash}`;
}

/** Legacy SHA-256 of JSON payload (matches branchlesspay_core legacy_content_hash). */
function legacyContentHash(payload: Record<string, unknown>): string {
  const data = { ...payload };
  delete data.content_hash;
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify BP webhook authenticity.
 * Accepts Bearer token, X-BP-Webhook-Secret, or HMAC sha256 signature header.
 */
export function verifyBpWebhookRequest(options: {
  authorization?: string;
  signatureHeader?: string;
  webhookSecretHeader?: string;
  rawBody?: string;
  tenantSlug?: string;
}): boolean {
  const secret = webhookSecret(options.tenantSlug);
  if (!secret) {
    // Fail closed in production-like deploys; allow only if explicitly opted out
    return process.env.BRANCHLESSPAY_WEBHOOK_ALLOW_INSECURE === "1";
  }

  const auth = options.authorization?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && safeEqual(token, secret)) return true;
  }

  const headerSecret = options.webhookSecretHeader?.trim();
  if (headerSecret && safeEqual(headerSecret, secret)) return true;

  const sig = options.signatureHeader?.trim() ?? "";
  if (sig && options.rawBody != null) {
    const expected = createHmac("sha256", secret)
      .update(options.rawBody)
      .digest("hex");
    const provided = sig.replace(/^sha256=/i, "").trim();
    if (provided && safeEqual(provided, expected)) return true;
  }

  return false;
}

/**
 * Optional pre-pay fraud check. Failures should not block checkout unless approved=false.
 */
export async function auditOrderWithBpShield(
  input: AuditEventInput,
): Promise<AuditEventResult> {
  const apiKey = tenantSecret(input.tenantSlug, "BRANCHLESSPAY_API_KEY");
  const merchantId = tenantSecret(input.tenantSlug, "BRANCHLESSPAY_MERCHANT_ID");
  if (!apiKey || !merchantId) {
    throw new Error(
      "Branchlesspay shield not configured. Set BRANCHLESSPAY_API_KEY and BRANCHLESSPAY_MERCHANT_ID.",
    );
  }

  const body = {
    merchant_id: merchantId,
    event_type: "order_created",
    transaction: {
      reference_id: input.orderId,
      amount: Math.round(input.total * 100),
      currency: "USD",
      order_type: input.orderType,
    },
    customer: {
      name: input.customerName,
      phone: input.customerPhone,
    },
    items: input.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_price: Math.round(item.unitPrice * 100),
    })),
    context: {
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      source: "orderly-website",
      tenant: input.tenantSlug,
    },
  };

  const response = await fetch(`${BRANCHLESSPAY_SHIELD_BASE}/v1/audit/shield`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Branchlesspay API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    audit_id: string;
    risk_score: number;
    approved: boolean;
    message: string;
  };

  return {
    auditId: data.audit_id,
    riskScore: data.risk_score,
    approved: data.approved,
    message: data.message,
  };
}

/**
 * Post-pay immutable anchor — ONLY for anchor_mode=platform.
 * Non-blocking for order success: caller should log failures and continue.
 */
export async function anchorPaidOrder(
  input: AnchorPaidOrderInput,
): Promise<AnchorPaidOrderResult> {
  const key = licenseKey(input.tenantSlug);
  if (!key) {
    return { ok: false, error: "BRANCHLESSPAY_LICENSE_KEY not configured" };
  }

  const payload: Record<string, unknown> = {
    event_type: "orderly_order_paid",
    reference_id: input.squarePaymentId || input.orderId,
    amount: input.total,
    currency: input.currency ?? "USD",
    timestamp: new Date().toISOString(),
    metadata: {
      erp: "orderly",
      tenant: input.tenantSlug,
      restaurant: input.tenantName,
      order_type: input.orderType,
      orderly_order_id: input.orderId,
      square_payment_id: input.squarePaymentId ?? undefined,
      square_order_id: input.squareOrderId ?? undefined,
      customer_name: input.customerName,
      item_count: input.items.length,
      items: input.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unitPrice,
      })),
    },
  };
  payload.content_hash = legacyContentHash(payload);

  try {
    const response = await fetch(BP_ANCHOR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (response.status !== 200 && response.status !== 202) {
      return { ok: false, error: `BP anchor ${response.status}: ${text}` };
    }
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const txHash =
      typeof data.chain_tx_hash === "string"
        ? data.chain_tx_hash
        : typeof data.tx_hash === "string"
          ? data.tx_hash
          : null;
    const explorer =
      typeof data.monad_explorer_url === "string"
        ? data.monad_explorer_url
        : explorerUrlForTx(txHash);
    return {
      ok: data.ok !== false,
      anchorId: typeof data.anchor_id === "string" ? data.anchor_id : undefined,
      contentHash:
        typeof data.content_hash === "string"
          ? data.content_hash
          : String(payload.content_hash),
      txHash,
      explorerUrl: explorer,
      status: typeof data.status === "string" ? data.status : "queued",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "BP anchor request failed",
    };
  }
}

export function parseAnchorProofPayload(
  body: Record<string, unknown>,
): AnchorProof | null {
  const display =
    body.display && typeof body.display === "object"
      ? (body.display as Record<string, unknown>)
      : null;

  const referenceId = String(
    body.reference_id ??
      body.referenceId ??
      display?.reference_id ??
      "",
  ).trim();

  const anchorIdRaw = body.anchor_id ?? body.anchorId;
  const contentHashRaw = body.content_hash ?? body.contentHash;
  const txHashRaw =
    body.chain_tx_hash ?? body.tx_hash ?? body.txHash ?? body.chainTxHash;
  const explorerRaw =
    body.monad_explorer_url ??
    body.explorer_url ??
    body.explorerUrl ??
    body.monadExplorerUrl;
  const statusRaw = body.status ?? body.anchor_status ?? body.anchorStatus;

  const anchorId =
    typeof anchorIdRaw === "string" && anchorIdRaw.trim()
      ? anchorIdRaw.trim()
      : null;
  const contentHash =
    typeof contentHashRaw === "string" && contentHashRaw.trim()
      ? contentHashRaw.trim()
      : null;
  const txHash =
    typeof txHashRaw === "string" && txHashRaw.trim()
      ? txHashRaw.trim()
      : null;
  const explorerUrl =
    typeof explorerRaw === "string" && explorerRaw.trim()
      ? explorerRaw.trim()
      : explorerUrlForTx(txHash);
  const status =
    typeof statusRaw === "string" && statusRaw.trim()
      ? statusRaw.trim().toLowerCase()
      : txHash
        ? "anchored"
        : "pending";

  if (!referenceId && !anchorId && !txHash) return null;

  return {
    anchorId,
    contentHash,
    txHash,
    explorerUrl,
    status,
    referenceId: referenceId || null,
  };
}

/**
 * Pull anchor proof from BP by Square/payment reference_id (pos-native fallback).
 */
export async function pullAnchorByReference(options: {
  referenceId: string;
  tenantSlug: string;
}): Promise<AnchorProof | null> {
  const key = licenseKey(options.tenantSlug);
  if (!key) return null;

  const url = new URL(`${BP_API_BASE}/anchor`);
  url.searchParams.set("reference_id", options.referenceId);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    // Some APIs wrap in { items: [...] } or return the anchor object directly
    const candidate =
      Array.isArray(data.items) && data.items[0]
        ? (data.items[0] as Record<string, unknown>)
        : Array.isArray(data.anchors) && data.anchors[0]
          ? (data.anchors[0] as Record<string, unknown>)
          : data;
    return parseAnchorProofPayload(candidate);
  } catch {
    return null;
  }
}
