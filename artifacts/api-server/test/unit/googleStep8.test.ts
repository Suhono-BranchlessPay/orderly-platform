import { googleSchema } from "../../src/lib/onboardingWizard";

describe("google Step 8", () => {
  it("allows GBP manual + GSC contact-us with ack", () => {
    const ok = googleSchema.safeParse({
      gbpStatus: "manual",
      gscPath: "contact_us",
      contactUsAcknowledged: true,
    });
    expect(ok.success).toBe(true);
  });

  it("requires GSC contact-us ack", () => {
    const bad = googleSchema.safeParse({
      gbpStatus: "pending",
      gscPath: "contact_us",
      contactUsAcknowledged: false,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects claiming GBP connected without server flag", () => {
    const bad = googleSchema.safeParse({
      gbpStatus: "connected",
      gbpConnected: false,
      gscPath: "contact_us",
      contactUsAcknowledged: true,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects claiming GSC verified without server flag", () => {
    const bad = googleSchema.safeParse({
      gbpStatus: "manual",
      gscPath: "verified",
      gscConnected: false,
    });
    expect(bad.success).toBe(false);

    const ok = googleSchema.safeParse({
      gbpStatus: "manual",
      gscPath: "verified",
      gscConnected: true,
      gscSiteUrl: "https://example.com/",
    });
    expect(ok.success).toBe(true);
  });
});
