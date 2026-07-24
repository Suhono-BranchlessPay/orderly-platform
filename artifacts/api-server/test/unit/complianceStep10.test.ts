import { complianceSchema } from "../../src/lib/onboardingWizard";

describe("compliance Step 10", () => {
  it("allows Health Dept cleared", () => {
    const ok = complianceSchema.safeParse({
      healthDeptCleared: true,
      healthDeptNotes: "Greene County — cleared 2026-07",
    });
    expect(ok.success).toBe(true);
  });

  it("requires Health Dept checkbox", () => {
    const bad = complianceSchema.safeParse({
      healthDeptCleared: false,
    });
    expect(bad.success).toBe(false);

    const missing = complianceSchema.safeParse({});
    expect(missing.success).toBe(false);
  });
});
