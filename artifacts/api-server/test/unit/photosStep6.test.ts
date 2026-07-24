import { photosSchema } from "../../src/lib/onboardingWizard";

describe("photos Step 6", () => {
  it("requires coverage acknowledgement", () => {
    const bad = photosSchema.safeParse({
      coverageAcknowledged: false,
      missingPhotoCount: 0,
    });
    expect(bad.success).toBe(false);
  });

  it("allows continue with full coverage and no plan", () => {
    const ok = photosSchema.safeParse({
      coverageAcknowledged: true,
      brandAssetsConfirmed: true,
      missingPhotoCount: 0,
      withPhotoCount: 12,
      itemCount: 12,
    });
    expect(ok.success).toBe(true);
  });

  it("requires needs-photo plan when missing photos", () => {
    const bad = photosSchema.safeParse({
      coverageAcknowledged: true,
      missingPhotoCount: 4,
      needsPhotoPlan: "soon",
    });
    expect(bad.success).toBe(false);

    const ok = photosSchema.safeParse({
      coverageAcknowledged: true,
      missingPhotoCount: 4,
      needsPhotoPlan: "Shoot remaining hibachi plates next Tuesday",
    });
    expect(ok.success).toBe(true);
  });

  it("allows acknowledge without counts (preview skipped)", () => {
    const ok = photosSchema.safeParse({
      coverageAcknowledged: true,
    });
    expect(ok.success).toBe(true);
  });
});
