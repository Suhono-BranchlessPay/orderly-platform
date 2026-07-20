/**
 * Per-tenant sales tax — fail-closed.
 * Missing / invalid rate → checkout must refuse (not invent 7% from Samurai).
 */

export type TaxRateSource = {
  taxRate?: number | null;
};

/**
 * Returns a finite rate in (0, 0.25], or null if the tenant must not charge.
 * 0 is allowed only if explicitly stored (tax-exempt edge); null = not configured.
 */
export function resolveTenantTaxRate(
  tenant: TaxRateSource | null | undefined,
): number | null {
  const r = tenant?.taxRate;
  if (r == null || Number.isNaN(Number(r))) return null;
  const n = Number(r);
  if (!Number.isFinite(n) || n < 0 || n > 0.25) return null;
  return n;
}

export function taxRateLabel(rate: number): string {
  const pct = rate * 100;
  const rounded = Math.round(pct * 1000) / 1000;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

/**
 * Square Orders API `taxes[].percentage` string (e.g. "6", "6.5", "7").
 * Never hardcode Indiana 7% — multi-tenant rates differ (Kirin KY = 6%).
 */
export function taxRateToSquarePercentage(rate: number): string {
  const resolved = resolveTenantTaxRate({ taxRate: rate });
  if (resolved == null) {
    throw new Error("tax_rate_unconfigured");
  }
  const pct = Math.round(resolved * 100 * 1000) / 1000;
  return Number.isInteger(pct) ? String(pct) : String(pct);
}

export type SquareTaxReconcileInput = {
  /** Orderly-computed tax (integer cents). */
  expectedTaxCents: number;
  /** Square CreateOrder `total_tax_money.amount` (integer cents). */
  squareTaxCents: number | null | undefined;
  tenantSlug?: string;
  orderId?: string;
};

export type SquareTaxReconcileResult =
  | { ok: true; expectedTaxCents: number; squareTaxCents: number }
  | {
      ok: false;
      code: "square_tax_mismatch" | "square_tax_missing";
      expectedTaxCents: number;
      squareTaxCents: number | null;
      deltaCents: number | null;
      message: string;
    };

/**
 * Dual source of tax truth (Orderly tenants.tax_rate vs Square order/catalog)
 * must never diverge silently. Compare after CreateOrder, before charge.
 */
export function reconcileSquareTax(
  input: SquareTaxReconcileInput,
): SquareTaxReconcileResult {
  const expectedTaxCents = Math.round(Number(input.expectedTaxCents));
  if (!Number.isFinite(expectedTaxCents) || expectedTaxCents < 0) {
    return {
      ok: false,
      code: "square_tax_missing",
      expectedTaxCents,
      squareTaxCents: null,
      deltaCents: null,
      message: "Orderly expected tax is invalid",
    };
  }
  if (
    input.squareTaxCents == null ||
    !Number.isFinite(Number(input.squareTaxCents))
  ) {
    return {
      ok: false,
      code: "square_tax_missing",
      expectedTaxCents,
      squareTaxCents: null,
      deltaCents: null,
      message: "Square CreateOrder returned no total_tax_money",
    };
  }
  const squareTaxCents = Math.round(Number(input.squareTaxCents));
  if (squareTaxCents !== expectedTaxCents) {
    const deltaCents = squareTaxCents - expectedTaxCents;
    return {
      ok: false,
      code: "square_tax_mismatch",
      expectedTaxCents,
      squareTaxCents,
      deltaCents,
      message: `Square tax ${squareTaxCents}¢ ≠ Orderly tax ${expectedTaxCents}¢ (Δ ${deltaCents}¢)`,
    };
  }
  return { ok: true, expectedTaxCents, squareTaxCents };
}
