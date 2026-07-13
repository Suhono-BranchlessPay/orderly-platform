/**
 * DoorDash delivery — STUB for the FulfillmentProvider seam only.
 *
 * Real DoorDash Drive integration already exists and is untouched at
 * ../../integrations/doordash.ts + ../../routes/delivery.ts. This stub is
 * NOT wired to that code and is not called from anywhere; it exists purely
 * so `mode: "delivery"` has a documented, safe placeholder that throws
 * instead of silently doing nothing if something reaches for it before a
 * real seam→integration bridge is built.
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

export class DoordashFulfillmentProvider implements FulfillmentProvider {
  readonly mode = "delivery" as const;

  isConfigured(_tenant: TenantContext): boolean {
    // Real config check lives in integrations/doordash.ts (isDoordashConfigured).
    // This stub always reports "not configured" — use the existing
    // /delivery routes for real DoorDash quoting/dispatch today.
    return false;
  }

  async quote(_input: FulfillmentQuoteInput): Promise<FulfillmentQuoteResult> {
    throw new FulfillmentNotImplementedError("delivery");
  }

  async dispatch(
    _input: FulfillmentDispatchInput,
  ): Promise<FulfillmentDispatchResult> {
    throw new FulfillmentNotImplementedError("delivery");
  }
}

export const doordashFulfillmentProvider = new DoordashFulfillmentProvider();
