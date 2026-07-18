/**
 * Kitchen state machine + pickup estimate (KDS). The transition guard prevents
 * regressions (e.g. ready -> preparing) and protects terminal states; the
 * estimate is what the customer is told at order time.
 */
import {
  shouldApplyKitchenStatus,
  mapSquareFulfillmentToKitchen,
  isKitchenStatus,
  KITCHEN_STATUSES,
} from "../../src/lib/kitchenStatus";
import {
  computePickupEstimate,
  PREP_TIME_OPTIONS,
  DEFAULT_KITCHEN_SETTINGS,
} from "../../src/lib/kitchenSettings";
import { toSquarePrepTimeDuration } from "../../src/integrations/square";

describe("kitchen: shouldApplyKitchenStatus (forward-only, cancel allowed)", () => {
  it("advances forward through the pipeline", () => {
    expect(shouldApplyKitchenStatus("pending", "preparing")).toBe(true);
    expect(shouldApplyKitchenStatus("preparing", "ready")).toBe(true);
    expect(shouldApplyKitchenStatus("ready", "completed")).toBe(true);
  });

  it("never regresses to an earlier state", () => {
    expect(shouldApplyKitchenStatus("ready", "preparing")).toBe(false);
    expect(shouldApplyKitchenStatus("completed", "ready")).toBe(false);
  });

  it("allows cancelling an active order but not a finished/cancelled one", () => {
    expect(shouldApplyKitchenStatus("preparing", "cancelled")).toBe(true);
    expect(shouldApplyKitchenStatus("completed", "cancelled")).toBe(false);
    expect(shouldApplyKitchenStatus("cancelled", "cancelled")).toBe(false);
  });

  it("is a no-op when status is unchanged", () => {
    expect(shouldApplyKitchenStatus("preparing", "preparing")).toBe(false);
  });

  it("treats null/undefined current as pending", () => {
    expect(shouldApplyKitchenStatus(null, "preparing")).toBe(true);
    expect(shouldApplyKitchenStatus(undefined, "ready")).toBe(true);
  });
});

describe("kitchen: mapSquareFulfillmentToKitchen", () => {
  it("maps known Square fulfillment states", () => {
    expect(mapSquareFulfillmentToKitchen("PROPOSED")).toBe("pending");
    expect(mapSquareFulfillmentToKitchen("RESERVED")).toBe("preparing");
    expect(mapSquareFulfillmentToKitchen("PREPARED")).toBe("ready");
    expect(mapSquareFulfillmentToKitchen("COMPLETED")).toBe("completed");
    expect(mapSquareFulfillmentToKitchen("CANCELED")).toBe("cancelled");
    expect(mapSquareFulfillmentToKitchen("CANCELLED")).toBe("cancelled");
    expect(mapSquareFulfillmentToKitchen("FAILED")).toBe("cancelled");
  });

  it("returns null for unknown states", () => {
    expect(mapSquareFulfillmentToKitchen("WHATEVER")).toBeNull();
    expect(mapSquareFulfillmentToKitchen("")).toBeNull();
    expect(mapSquareFulfillmentToKitchen(null)).toBeNull();
  });
});

describe("kitchen: isKitchenStatus", () => {
  it("accepts only known statuses", () => {
    for (const s of KITCHEN_STATUSES) expect(isKitchenStatus(s)).toBe(true);
    expect(isKitchenStatus("foo")).toBe(false);
    expect(isKitchenStatus(123)).toBe(false);
    expect(isKitchenStatus(null)).toBe(false);
  });
});

describe("kitchen: computePickupEstimate", () => {
  it("uses prep time as a +/-5 range", () => {
    expect(
      computePickupEstimate({
        prep_time_minutes: 15,
        busy_mode: false,
        busy_extra_minutes: 10,
      }),
    ).toEqual({ min_minutes: 10, max_minutes: 20, label: "10–20 min" });
  });

  it("adds busy_extra_minutes when busy mode is on", () => {
    const e = computePickupEstimate({
      prep_time_minutes: 15,
      busy_mode: true,
      busy_extra_minutes: 10,
    });
    expect(e.min_minutes).toBe(20);
    expect(e.max_minutes).toBe(30);
  });

  it("never shows a min below 1 minute", () => {
    const e = computePickupEstimate({
      prep_time_minutes: 3,
      busy_mode: false,
      busy_extra_minutes: 0,
    });
    expect(e.min_minutes).toBeGreaterThanOrEqual(1);
  });
});

describe("kitchen: settings presets", () => {
  it("exposes the allowed prep-time presets", () => {
    expect([...PREP_TIME_OPTIONS]).toEqual([10, 15, 20, 25, 30]);
  });

  it("has sane defaults (not paused, 15 min)", () => {
    expect(DEFAULT_KITCHEN_SETTINGS.prepTimeMinutes).toBe(15);
    expect(DEFAULT_KITCHEN_SETTINGS.ordersPaused).toBe(false);
    expect(DEFAULT_KITCHEN_SETTINGS.busyMode).toBe(false);
  });
});

describe("kitchen: toSquarePrepTimeDuration", () => {
  it("formats minutes as ISO-8601 duration", () => {
    expect(toSquarePrepTimeDuration(15)).toBe("PT15M");
    expect(toSquarePrepTimeDuration(25)).toBe("PT25M");
  });

  it("falls back to 20 minutes when unset", () => {
    expect(toSquarePrepTimeDuration(undefined)).toBe("PT20M");
    expect(toSquarePrepTimeDuration(null)).toBe("PT20M");
  });
});
