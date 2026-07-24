import {
  normalizeWizardTaxRate,
  squareConnectSchema,
} from "../../src/lib/onboardingWizard";
import { resolveTenantTaxRate } from "../../src/lib/tenantTax";

describe("squareConnect Step 4", () => {
  it("normalizes percent and decimal tax inputs", () => {
    expect(normalizeWizardTaxRate(7)).toBe(0.07);
    expect(normalizeWizardTaxRate(6.5)).toBe(0.065);
    expect(normalizeWizardTaxRate(0.06)).toBe(0.06);
    expect(normalizeWizardTaxRate(null)).toBeNull();
    expect(normalizeWizardTaxRate(50)).toBeNull();
  });

  it("requires taxConfirmed", () => {
    const bad = squareConnectSchema.safeParse({
      locationId: "LOC1",
      taxRate: 0.07,
      taxConfirmed: false,
    });
    expect(bad.success).toBe(false);

    const ok = squareConnectSchema.safeParse({
      locationId: "LOC1",
      taxRate: 0.07,
      taxConfirmed: true,
    });
    expect(ok.success).toBe(true);
  });

  it("keeps checkout fail-closed when taxRate missing", () => {
    expect(resolveTenantTaxRate({ taxRate: null })).toBeNull();
    expect(resolveTenantTaxRate({ taxRate: 0.07 })).toBe(0.07);
  });
});
