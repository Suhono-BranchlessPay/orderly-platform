import { opsSchema } from "../../src/lib/onboardingWizard";

describe("ops Step 9", () => {
  it("allows owner email + local hour + timezone + ack", () => {
    const ok = opsSchema.safeParse({
      ownerEmail: "owner@example.com",
      sendHourLocal: 4,
      timezone: "America/Indiana/Indianapolis",
      opsAck: true,
    });
    expect(ok.success).toBe(true);
  });

  it("requires ops acknowledgement", () => {
    const bad = opsSchema.safeParse({
      ownerEmail: "owner@example.com",
      sendHourLocal: 4,
      timezone: "America/Indiana/Indianapolis",
      opsAck: false,
    });
    expect(bad.success).toBe(false);
  });

  it("requires timezone from Step 3", () => {
    const bad = opsSchema.safeParse({
      ownerEmail: "owner@example.com",
      sendHourLocal: 4,
      opsAck: true,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid email and out-of-range hour", () => {
    const badEmail = opsSchema.safeParse({
      ownerEmail: "not-an-email",
      sendHourLocal: 4,
      timezone: "America/Indiana/Indianapolis",
      opsAck: true,
    });
    expect(badEmail.success).toBe(false);

    const badHour = opsSchema.safeParse({
      ownerEmail: "owner@example.com",
      sendHourLocal: 24,
      timezone: "America/Indiana/Indianapolis",
      opsAck: true,
    });
    expect(badHour.success).toBe(false);
  });
});
