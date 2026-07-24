import {
  hoursSchema,
  hoursToTenantJson,
  isValidIanaTimeZone,
  WEEKDAYS,
} from "../../src/lib/onboardingWizard";
import {
  parseHoursFromTenant,
  TIMEZONE_MISSING,
} from "../../src/lib/tenantHours";

const fullWeekly = WEEKDAYS.map((day) => ({
  day,
  hours: day === "Monday" ? "Closed" : "11:00 AM – 9:00 PM",
}));

describe("tenantHours Step 3", () => {
  it("accepts IANA zones", () => {
    expect(isValidIanaTimeZone("America/Chicago")).toBe(true);
    expect(isValidIanaTimeZone("America/Indiana/Indianapolis")).toBe(true);
    expect(isValidIanaTimeZone("Not/AZone")).toBe(false);
  });

  it("requires timezoneConfirmed and all 7 days", () => {
    const bad = hoursSchema.safeParse({
      timezone: "America/Chicago",
      timezoneConfirmed: false,
      weekly: fullWeekly,
    });
    expect(bad.success).toBe(false);

    const missingDay = hoursSchema.safeParse({
      timezone: "America/Chicago",
      timezoneConfirmed: true,
      weekly: fullWeekly.slice(0, 6),
    });
    expect(missingDay.success).toBe(false);

    const ok = hoursSchema.safeParse({
      timezone: "America/Chicago",
      timezoneConfirmed: true,
      weekly: fullWeekly,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects TBD hours lines", () => {
    const parsed = hoursSchema.safeParse({
      timezone: "America/Chicago",
      timezoneConfirmed: true,
      weekly: WEEKDAYS.map((day) => ({ day, hours: "TBD" })),
    });
    expect(parsed.success).toBe(false);
  });

  it("maps to tenants.hours shape", () => {
    const json = hoursToTenantJson({
      timezone: "America/Chicago",
      timezoneConfirmed: true,
      weekly: fullWeekly,
    });
    expect(json.timezone).toBe("America/Chicago");
    expect((json.weekly as unknown[]).length).toBe(7);
  });

  it("parses live Kirin-style hours", () => {
    const style = parseHoursFromTenant({
      timezone: "America/Chicago",
      weekly: fullWeekly,
    });
    expect(style?.timezone).toBe("America/Chicago");
    expect(style?.weekly[0].hours).toBe("Closed");
  });

  it("exports stable gate code", () => {
    expect(TIMEZONE_MISSING).toBe("timezone_required");
  });
});
