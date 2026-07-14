import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Square Gift Cards — Square is the compliance issuer; Orderly stores
 * purchase/redeem audit + UX state only. Non-Square POS tenants stay disabled.
 *
 * Spec Part 3. Lawyer + CPA consultation required before go-live.
 * Owner.com card migration is separate and gated (no CrustnRoll until ready).
 */

export const giftCardProgramsTable = pgTable("gift_card_programs", {
  tenantId: text("tenant_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** draft | active | paused */
  status: text("status").notNull().default("draft"),
  /** Allowed purchase amounts in cents, e.g. [2500,5000,10000]. Empty = any. */
  allowedAmountsCents: jsonb("allowed_amounts_cents")
    .$type<number[]>()
    .notNull()
    .default([2500, 5000, 10000, 25000]),
  minAmountCents: integer("min_amount_cents").notNull().default(1000),
  maxAmountCents: integer("max_amount_cents").notNull().default(50000),
  /** Show buy UI on storefront when engine + program active. */
  sellOnline: boolean("sell_online").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const giftCardsTable = pgTable(
  "gift_cards",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    /** Square gift card id (gftc:…). */
    squareGiftCardId: text("square_gift_card_id").notNull(),
    /** GAN — gift account number (shown to customer; treat as secret-ish). */
    gan: text("gan"),
    state: text("state").notNull().default("PENDING"),
    balanceCents: integer("balance_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    purchaserCustomerId: text("purchaser_customer_id"),
    purchaserEmail: text("purchaser_email"),
    recipientEmail: text("recipient_email"),
    recipientName: text("recipient_name"),
    /** Import provenance for Owner.com migrate (append-only). */
    externalRef: text("external_ref"),
    source: text("source").notNull().default("orderly"), // orderly | migrate | square_pos
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gift_cards_tenant_square_id_idx").on(
      t.tenantId,
      t.squareGiftCardId,
    ),
  ],
);

/** purchase | activate | load | redeem | adjust | migrate */
export const giftCardTransactionsTable = pgTable("gift_card_transactions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  giftCardId: text("gift_card_id").notNull(),
  type: text("type").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  orderId: text("order_id"),
  squarePaymentId: text("square_payment_id"),
  squareActivityId: text("square_activity_id"),
  reason: text("reason"),
  externalRef: text("external_ref"),
  bpAnchorId: text("bp_anchor_id"),
  bpAnchorStatus: text("bp_anchor_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type GiftCardProgram = typeof giftCardProgramsTable.$inferSelect;
export type GiftCard = typeof giftCardsTable.$inferSelect;
export type GiftCardTransaction = typeof giftCardTransactionsTable.$inferSelect;
