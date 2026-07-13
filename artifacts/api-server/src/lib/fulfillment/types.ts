/**
 * Block 5 seam — FulfillmentProvider.
 *
 * Purpose: give the order flow one interface for "how does this order get
 * to the customer" so the platform is not architecturally locked to
 * restaurant pickup/delivery. This is a SEAM ONLY:
 *   - Pickup is the only implementation wired to real behavior.
 *   - DoorDash / Shipping are stubs that throw "not implemented" — the
 *     existing DoorDash integration (src/integrations/doordash.ts) and
 *     /delivery routes are untouched and remain the real delivery path.
 *   - Nothing here is called from any existing route yet. Wiring a
 *     provider into the order-create/checkout flow is a separate, later
 *     change — not part of Block 5.
 *
 * Money stays in integer cents (see ../money.ts). Providers must not
 * introduce a second source of truth for order totals.
 */

import type { TenantContext } from "../tenant";
import type { StructuredAddress } from "../address";

/** Matches tenants.fulfillment_modes seam values. */
export type FulfillmentMode = "pickup" | "delivery" | "shipping";

export interface FulfillmentQuoteInput {
  tenant: TenantContext;
  orderValueCents: number;
  /** Required for delivery/shipping providers; ignored by pickup. */
  address?: StructuredAddress | null;
}

export interface FulfillmentQuoteResult {
  mode: FulfillmentMode;
  /** Fee for this fulfillment mode, in integer cents (0 for pickup). */
  feeCents: number;
  estimatedReadyMinutes?: number | null;
  /** Opaque token a provider may need again at dispatch time (e.g. a DoorDash quote id). */
  quoteRef?: string | null;
}

export interface FulfillmentDispatchInput {
  tenant: TenantContext;
  orderId: string;
  orderValueCents: number;
  address?: StructuredAddress | null;
  quoteRef?: string | null;
  items: Array<{ name: string; quantity: number }>;
  specialInstructions?: string | null;
}

export interface FulfillmentDispatchResult {
  mode: FulfillmentMode;
  /** Provider-side reference for tracking (null for pickup — nothing to track). */
  externalRef: string | null;
  trackingUrl?: string | null;
  status: string;
}

/**
 * Every fulfillment provider (pickup today; delivery/shipping later)
 * implements this shape. Keep it minimal — do not grow this into a
 * grocery/shipping feature; that is explicitly out of scope for Block 5.
 */
export interface FulfillmentProvider {
  readonly mode: FulfillmentMode;
  /** Whether this provider is usable for the given tenant right now. */
  isConfigured(tenant: TenantContext): boolean;
  quote(input: FulfillmentQuoteInput): Promise<FulfillmentQuoteResult>;
  dispatch(input: FulfillmentDispatchInput): Promise<FulfillmentDispatchResult>;
}

export class FulfillmentNotImplementedError extends Error {
  constructor(mode: FulfillmentMode) {
    super(`Fulfillment provider "${mode}" is not implemented.`);
    this.name = "FulfillmentNotImplementedError";
  }
}
