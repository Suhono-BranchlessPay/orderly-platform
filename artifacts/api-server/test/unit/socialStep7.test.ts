import { socialSchema } from "../../src/lib/onboardingWizard";

describe("social Step 7", () => {
  it("requires contact-us acknowledgement", () => {
    const bad = socialSchema.safeParse({
      path: "contact_us",
      contactUsAcknowledged: false,
    });
    expect(bad.success).toBe(false);

    const ok = socialSchema.safeParse({
      path: "contact_us",
      contactUsAcknowledged: true,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects oauth without server-verified flags", () => {
    const bad = socialSchema.safeParse({
      path: "oauth",
      oauthConnected: false,
      ibaVerified: false,
    });
    expect(bad.success).toBe(false);

    const ok = socialSchema.safeParse({
      path: "oauth",
      oauthConnected: true,
      ibaVerified: true,
      pageId: "123",
      pageName: "Test Page",
    });
    expect(ok.success).toBe(true);
  });
});
