-- Square Gift Cards foundation (Part 3).
-- Additive only. Engine stays OFF until ORDERLY_GIFT_CARDS_ENABLED=1
-- and program status=active. No Owner.com import in this migration.

CREATE TABLE IF NOT EXISTS gift_card_programs (
  tenant_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  allowed_amounts_cents jsonb NOT NULL DEFAULT '[2500,5000,10000,25000]'::jsonb,
  min_amount_cents integer NOT NULL DEFAULT 1000,
  max_amount_cents integer NOT NULL DEFAULT 50000,
  sell_online boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_cards (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  square_gift_card_id text NOT NULL,
  gan text,
  state text NOT NULL DEFAULT 'PENDING',
  balance_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  purchaser_customer_id text,
  purchaser_email text,
  recipient_email text,
  recipient_name text,
  external_ref text,
  source text NOT NULL DEFAULT 'orderly',
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_tenant_square_id_idx
  ON gift_cards (tenant_id, square_gift_card_id);

CREATE INDEX IF NOT EXISTS gift_cards_tenant_gan_idx
  ON gift_cards (tenant_id, gan);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  gift_card_id text NOT NULL,
  type text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  order_id text,
  square_payment_id text,
  square_activity_id text,
  reason text,
  external_ref text,
  bp_anchor_id text,
  bp_anchor_status text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_card_txn_tenant_card_idx
  ON gift_card_transactions (tenant_id, gift_card_id, created_at DESC);
