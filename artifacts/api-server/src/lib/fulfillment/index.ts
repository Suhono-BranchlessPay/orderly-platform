/**
 * Fulfillment provider registry — Block 5 seam.
 * NOT imported by any existing route. See ./types.ts for scope notes.
 */

import type { FulfillmentMode, FulfillmentProvider } from "./types";
import { pickupFulfillmentProvider } from "./pickup";
import { doordashFulfillmentProvider } from "./doordash";
import { shippingFulfillmentProvider } from "./shipping";

export * from "./types";
export { pickupFulfillmentProvider } from "./pickup";
export { doordashFulfillmentProvider } from "./doordash";
export { shippingFulfillmentProvider } from "./shipping";

const providers: Record<FulfillmentMode, FulfillmentProvider> = {
  pickup: pickupFulfillmentProvider,
  delivery: doordashFulfillmentProvider,
  shipping: shippingFulfillmentProvider,
};

export function getFulfillmentProvider(mode: FulfillmentMode): FulfillmentProvider {
  return providers[mode];
}
