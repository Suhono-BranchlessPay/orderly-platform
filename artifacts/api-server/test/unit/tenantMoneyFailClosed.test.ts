import { resolveSquareCredsFromEnv } from "../../src/integrations/square";
import {
  reconcileSquareTax,
  resolveTenantTaxRate,
  taxRateLabel,
  taxRateToSquarePercentage,
} from "../../src/lib/tenantTax";

describe("Square env credentials fail-closed (no global SQUARE_* borrow)", () => {
  const keys = [
    "TENANT_KIRIN_SQUARE_ACCESS_TOKEN",
    "TENANT_KIRIN_SQUARE_LOCATION_ID",
    "TENANT_KIRIN_SQUARE_APPLICATION_ID",
    "TENANT_KIRIN_SQUARE_ENVIRONMENT",
    "TENANT_SAMURAI_SQUARE_ACCESS_TOKEN",
    "TENANT_SAMURAI_SQUARE_LOCATION_ID",
    "TENANT_SAMURAI_SQUARE_APPLICATION_ID",
    "TENANT_SAMURAI_SQUARE_ENVIRONMENT",
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_LOCATION_ID",
    "SQUARE_APPLICATION_ID",
    "SQUARE_ENVIRONMENT",
  ] as const;

  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  test("Kirin does not inherit global Samurai SQUARE_*", () => {
    process.env.SQUARE_ACCESS_TOKEN = "samurai-token";
    process.env.SQUARE_LOCATION_ID = "L_SAMURAI";
    process.env.SQUARE_APPLICATION_ID = "sq0idp-samurai";
    process.env.SQUARE_ENVIRONMENT = "production";
    expect(resolveSquareCredsFromEnv("kirin")).toBeNull();
  });

  test("prefixed TENANT_KIRIN_SQUARE_* resolves", () => {
    process.env.TENANT_KIRIN_SQUARE_ACCESS_TOKEN = "kirin-token";
    process.env.TENANT_KIRIN_SQUARE_LOCATION_ID = "LRKJ8G89JNNTR";
    process.env.TENANT_KIRIN_SQUARE_APPLICATION_ID = "sq0idp-kirin";
    process.env.TENANT_KIRIN_SQUARE_ENVIRONMENT = "production";
    const c = resolveSquareCredsFromEnv("kirin");
    expect(c).not.toBeNull();
    expect(c!.locationId).toBe("LRKJ8G89JNNTR");
    expect(c!.accessToken).toBe("kirin-token");
  });

  test("Samurai also requires TENANT_SAMURAI_SQUARE_* (global alone insufficient)", () => {
    process.env.SQUARE_ACCESS_TOKEN = "samurai-token";
    process.env.SQUARE_LOCATION_ID = "L_SAMURAI";
    process.env.SQUARE_APPLICATION_ID = "sq0idp-samurai";
    process.env.SQUARE_ENVIRONMENT = "production";
    expect(resolveSquareCredsFromEnv("samurai")).toBeNull();

    process.env.TENANT_SAMURAI_SQUARE_ACCESS_TOKEN = "samurai-token";
    process.env.TENANT_SAMURAI_SQUARE_LOCATION_ID = "L_SAMURAI";
    process.env.TENANT_SAMURAI_SQUARE_APPLICATION_ID = "sq0idp-samurai";
    process.env.TENANT_SAMURAI_SQUARE_ENVIRONMENT = "production";
    expect(resolveSquareCredsFromEnv("samurai")?.locationId).toBe("L_SAMURAI");
  });
});

describe("tenant tax rate fail-closed", () => {
  test("null / missing → null (refuse checkout)", () => {
    expect(resolveTenantTaxRate(null)).toBeNull();
    expect(resolveTenantTaxRate({})).toBeNull();
    expect(resolveTenantTaxRate({ taxRate: null })).toBeNull();
  });

  test("Samurai 7% and invalid rejected", () => {
    expect(resolveTenantTaxRate({ taxRate: 0.07 })).toBe(0.07);
    expect(resolveTenantTaxRate({ taxRate: 0.06 })).toBe(0.06);
    expect(resolveTenantTaxRate({ taxRate: -0.01 })).toBeNull();
    expect(resolveTenantTaxRate({ taxRate: 0.5 })).toBeNull();
  });

  test("label", () => {
    expect(taxRateLabel(0.07)).toBe("7%");
    expect(taxRateLabel(0.06)).toBe("6%");
  });

  test("Square percentage string follows tenant rate (never hardcode 7)", () => {
    expect(taxRateToSquarePercentage(0.06)).toBe("6");
    expect(taxRateToSquarePercentage(0.07)).toBe("7");
    expect(taxRateToSquarePercentage(0.065)).toBe("6.5");
    expect(() => taxRateToSquarePercentage(Number.NaN)).toThrow(
      "tax_rate_unconfigured",
    );
  });

  test("reconcileSquareTax alarms on Orderly≠Square (Kirin 18¢ vs 21¢)", () => {
    expect(
      reconcileSquareTax({ expectedTaxCents: 18, squareTaxCents: 18 }),
    ).toEqual({ ok: true, expectedTaxCents: 18, squareTaxCents: 18 });

    const mismatch = reconcileSquareTax({
      expectedTaxCents: 18,
      squareTaxCents: 21,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.code).toBe("square_tax_mismatch");
      expect(mismatch.deltaCents).toBe(3);
    }

    const missing = reconcileSquareTax({
      expectedTaxCents: 18,
      squareTaxCents: null,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("square_tax_missing");
  });
});
