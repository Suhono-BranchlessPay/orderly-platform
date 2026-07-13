/**
 * Pickup fulfillment provider — the only FulfillmentProvider with real
 * behavior in Block 5. This mirrors what every existing tenant already
 * does today (walk-in / counter pickup, zero delivery fee, no external
 * dispatch), just exposed behind the FulfillmentProvider seam.
 */

import type { TenantContext } from "../tenant";
import type {
  FulfillmentDispatchInput,
  FulfillmentDispatchResult,
  FulfillmentProvider,
  FulfillmentQuoteInput,
  FulfillmentQuoteResult,
} from "./types";

export class PickupFulfillmentProvider implements FulfillmentProvider {
  readonly mode = "pickup" as const;

  isConfigured(_tenant: TenantContext): boolean {
    return true;
  }

  async quote(input: FulfillmentQuoteInput): Promise<FulfillmentQuoteResult> {
    return {
      mode: "pickup",
      feeCents: 0,
      estimatedReadyMinutes: 20,
      quoteRef: null,
    };
  }

  async dispatch(
    input: FulfillmentDispatchInput,
  ): Promise<FulfillmentDispatchResult> {
    return {
      mode: "pickup",
      externalRef: null,
      trackingUrl: null,
      status: "ready_for_pickup",
    };
  }
}

export const pickupFulfillmentProvider = new PickupFulfillmentProvider();
