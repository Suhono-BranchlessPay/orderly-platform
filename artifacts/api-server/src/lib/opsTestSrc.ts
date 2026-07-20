/**
 * Ops / QA / probe src tags — must not train Content Engine or clutter ROI views.
 * Shared by order create auto-flag, SQL exclusion, and QR dashboard filters.
 */

const EXPLICIT = new Set([
  "test",
  "test-manual",
  "probe",
  "probe-redirect",
]);

/**
 * True when src looks like a deliberate test/probe (not a real campaign).
 * Examples: test-manual, tiktok-test, fb-test, fb-src-probe-…, probe-redirect.
 */
export function isOpsTestSrc(src: unknown): boolean {
  const s = String(src ?? "")
    .toLowerCase()
    .trim();
  if (!s) return false;
  if (EXPLICIT.has(s)) return true;
  if (s.startsWith("test-") || s.startsWith("probe-")) return true;
  if (s.includes("probe")) return true;
  // tiktok-test, fb-test, xxx-test-yyy
  if (/(^|-)test($|-)/.test(s)) return true;
  return false;
}

/** Merge is_test into source_detail when src matches ops-test patterns. */
export function withOpsTestSourceDetail(
  detail: Record<string, unknown>,
): Record<string, unknown> {
  if (!isOpsTestSrc(detail.src)) return detail;
  if (detail.is_test === true) return detail;
  return {
    ...detail,
    is_test: true,
    test_reason:
      typeof detail.test_reason === "string" && detail.test_reason.trim()
        ? detail.test_reason
        : "auto_src_test_pattern",
  };
}

/**
 * Exclude from daily-report attribution / learning views.
 * Honors manual is_test (e.g. ig-bio smoke) and auto src patterns (tiktok-test).
 */
export function isOpsTestOrderDetail(
  detail: Record<string, unknown> | null | undefined,
): boolean {
  if (!detail || typeof detail !== "object") return false;
  if (detail.is_test === true) return true;
  return isOpsTestSrc(detail.src);
}
