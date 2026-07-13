/**
 * Shipping (carrier ship-to-address) — STUB for the FulfillmentProvider
 * seam only. No carrier is integrated. This exists so the schema/interface
 * are not locked to "pickup or DoorDash delivery" — nothing more. Building
 * real shipping (rates, labels, tracking) is explicitly OUT OF SCOPE for
 * Block 5.
 */

import type { TenantContext } from "../tenant";
import {
  FulfillmentNotImplementedError,
  type FulfillmentDispatchInput,
  type FulfillmentDispatchResult,
  type FulfillmentProvider,
  type FulfillmentQuoteInput,
  type FulfillmentQuoteResult,
} from "./types";

export class ShippingFulfillmentProvider implements FulfillmentProvider {
  readonly mode = "shipping" as const;

  isConfigured(_tenant: TenantContext): boolean {
    return false;
  }

  async quote(_input: FulfillmentQuoteInput): Promise<FulfillmentQuoteResult> {
    throw new FulfillmentNotImplementedError("shipping");
  }

  async dispatch(
    _input: FulfillmentDispatchInput,
  ): Promise<FulfillmentDispatchResult> {
    throw new FulfillmentNotImplementedError("shipping");
  }
}

export const shippingFulfillmentProvider = new ShippingFulfillmentProvider();
