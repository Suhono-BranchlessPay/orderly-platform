import {
  catalogSchema,
  normalizeSkuPrefix,
  RESERVED_SKU_PREFIXES,
} from "../../src/lib/onboardingWizard";
import { findAmbiguousMenuNamePairs } from "../../src/lib/onboardingCatalog";

describe("catalog Step 5", () => {
  it("normalizes SKU prefix", () => {
    expect(normalizeSkuPrefix(" ltn- ")).toBe("LTN");
    expect(normalizeSkuPrefix("Kirin!")).toBe("KIRIN");
  });

  it("reserves known prefixes", () => {
    expect(RESERVED_SKU_PREFIXES).toContain("KRN");
    expect(RESERVED_SKU_PREFIXES).toContain("SAM");
  });

  it("requires catalog confirm gates", () => {
    const bad = catalogSchema.safeParse({
      skuPrefix: "LTN",
      skuPrefixUniqueConfirmed: false,
      ambiguousReviewed: true,
      pricesCheckedInSquare: true,
      modifiersInSquareConfirmed: true,
    });
    expect(bad.success).toBe(false);

    const ok = catalogSchema.safeParse({
      skuPrefix: "LTN",
      skuPrefixUniqueConfirmed: true,
      ambiguousReviewed: true,
      pricesCheckedInSquare: true,
      modifiersInSquareConfirmed: true,
    });
    expect(ok.success).toBe(true);
  });

  it("always blocks KRN; SAM only with samurai exempt", () => {
    const krn = catalogSchema.safeParse({
      skuPrefix: "KRN",
      skuPrefixUniqueConfirmed: true,
      ambiguousReviewed: true,
      pricesCheckedInSquare: true,
      modifiersInSquareConfirmed: true,
      samuraiLegacySkuExempt: true,
    });
    expect(krn.success).toBe(false);

    const samBlocked = catalogSchema.safeParse({
      skuPrefix: "SAM",
      skuPrefixUniqueConfirmed: true,
      ambiguousReviewed: true,
      pricesCheckedInSquare: true,
      modifiersInSquareConfirmed: true,
    });
    expect(samBlocked.success).toBe(false);

    const samOk = catalogSchema.safeParse({
      skuPrefix: "SAM",
      skuPrefixUniqueConfirmed: true,
      ambiguousReviewed: true,
      pricesCheckedInSquare: true,
      modifiersInSquareConfirmed: true,
      samuraiLegacySkuExempt: true,
    });
    expect(samOk.success).toBe(true);
  });

  it("flags shared base menu names", () => {
    const pairs = findAmbiguousMenuNamePairs([
      "Hibachi Chicken",
      "Hibachi Chicken & Scallop",
      "Fried Rice",
    ]);
    expect(pairs.some((p) => p.reason === "shared_base_name")).toBe(true);
  });
});
