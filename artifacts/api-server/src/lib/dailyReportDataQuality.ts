import type { DailyReportLang } from "./dailyReportI18n";

export type DataQualityFlag = {
  code: string;
  severity: "info" | "warn";
  message: string;
};

/**
 * Window where closed-loop attribution was incomplete:
 * bare Facebook CTAs (no ?src=), first-touch bare-homepage bug,
 * and fbclid→src fallback only live from 2026-07-18 afternoon ET.
 * Reports must not treat click→order gaps as "campaign failed".
 */
export const ATTRIBUTION_INCOMPLETE_WINDOW = {
  start: "2026-07-16",
  end: "2026-07-18",
  code: "attribution_incomplete_20260716_18",
} as const;

/**
 * Facebook iOS WebView broke Square Pay until PR #86 (live ~18 Jul night ET).
 * Content Engine must not learn "FB posts don't convert" from campaigns posted
 * on or before this UTC date (covers fb-crabmeatbento-20260714, fb-beefbento, …).
 */
export const FB_WEBVIEW_LEARNING_CUTOFF = {
  endInclusive: "2026-07-18",
  code: "fb_webview_checkout_broken_pre_pr86",
} as const;

export function attributionDataQualityFlags(
  reportDate: string,
  lang: DailyReportLang = "en",
): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];
  if (
    reportDate >= ATTRIBUTION_INCOMPLETE_WINDOW.start &&
    reportDate <= ATTRIBUTION_INCOMPLETE_WINDOW.end
  ) {
    const message =
      lang === "id"
        ? "Kualitas data atribusi tidak lengkap (16–18 Jul): banyak link Facebook tanpa ?src=, first-touch belum upgrade, dan fallback fbclid baru live 18 Jul sore. Jangan simpulkan kampanye gagal dari gap klik→order di jendela ini."
        : lang === "es"
          ? "Calidad de datos de atribución incompleta (16–18 jul): muchos enlaces de Facebook sin ?src=, first-touch sin upgrade, y el fallback fbclid solo en vivo desde la tarde del 18 jul. No concluya que la campaña falló por brechas clic→pedido en esta ventana."
          : "Attribution data quality incomplete (Jul 16–18): bare Facebook links (no ?src=), first-touch upgrade gap, and fbclid fallback only live from Jul 18 afternoon. Do not conclude the campaign failed from click→order gaps in this window.";
    flags.push({
      code: ATTRIBUTION_INCOMPLETE_WINDOW.code,
      severity: "warn",
      message,
    });
  }
  if (reportDate <= FB_WEBVIEW_LEARNING_CUTOFF.endInclusive) {
    const message =
      lang === "id"
        ? "Checkout Facebook iOS WebView rusak sampai PR #86 (~18 Jul malam). Post FB sebelum/pada tanggal itu dikecualikan dari pembelajaran Content Engine (klik tanpa order bukan sinyal produk)."
        : lang === "es"
          ? "El checkout de Facebook iOS WebView falló hasta el PR #86 (~noche del 18 jul). Las publicaciones de FB hasta esa fecha se excluyen del aprendizaje del Content Engine."
          : "Facebook iOS WebView checkout was broken until PR #86 (~Jul 18 night). Facebook campaign posts on/before that date are excluded from Content Engine learning (clicks without orders are not a product signal).";
    flags.push({
      code: FB_WEBVIEW_LEARNING_CUTOFF.code,
      severity: "warn",
      message,
    });
  }
  return flags;
}

export function hasIncompleteAttributionWindow(
  flags: DataQualityFlag[] | undefined,
): boolean {
  return Boolean(
    flags?.some((f) => f.code === ATTRIBUTION_INCOMPLETE_WINDOW.code),
  );
}

/** YYYY-MM-DD (UTC date slice) inside the incomplete-attribution window. */
export function isInAttributionIncompleteWindow(
  isoDateOrPostedAt: string | Date | null | undefined,
): boolean {
  if (isoDateOrPostedAt == null) return false;
  const day =
    typeof isoDateOrPostedAt === "string"
      ? isoDateOrPostedAt.slice(0, 10)
      : isoDateOrPostedAt.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return (
    day >= ATTRIBUTION_INCOMPLETE_WINDOW.start &&
    day <= ATTRIBUTION_INCOMPLETE_WINDOW.end
  );
}

export function isFacebookCampaignSrc(src: string | null | undefined): boolean {
  const s = (src || "").toLowerCase().trim();
  if (!s) return false;
  return (
    s === "facebook" ||
    s === "fb" ||
    s.startsWith("fb-") ||
    s.startsWith("fb_") ||
    s.startsWith("facebook-")
  );
}

function toUtcDay(isoDateOrPostedAt: string | Date | null | undefined): string | null {
  if (isoDateOrPostedAt == null) return null;
  const day =
    typeof isoDateOrPostedAt === "string"
      ? isoDateOrPostedAt.slice(0, 10)
      : isoDateOrPostedAt.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Facebook campaign performance from before WebView handoff must not train CE.
 * Matches src fb-* / platform facebook with postedAt on/before cutoff.
 */
export function isPreWebviewFacebookPerformance(row: {
  postedAt?: string | Date | null;
  src?: string | null;
  platform?: string | null;
}): boolean {
  const day = toUtcDay(row.postedAt ?? null);
  if (!day || day > FB_WEBVIEW_LEARNING_CUTOFF.endInclusive) return false;
  const plat = String(row.platform ?? "").toLowerCase();
  if (plat === "facebook" || plat === "fb") return true;
  return isFacebookCampaignSrc(row.src);
}

/** Drop misleading click→order rows from Content Engine / learning inputs. */
export function filterPastPerformanceForContentEngine<
  T extends {
    postedAt?: string | Date | null;
    src?: string | null;
    platform?: string | null;
  },
>(rows: T[]): T[] {
  return rows.filter(
    (r) =>
      !isInAttributionIncompleteWindow(r.postedAt ?? null) &&
      !isPreWebviewFacebookPerformance(r),
  );
}
