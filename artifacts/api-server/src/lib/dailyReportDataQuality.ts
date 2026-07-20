import type { DailyReportLang } from "./dailyReportI18n";

export type DataQualityFlag = {
  code: string;
  severity: "info" | "warn";
  message: string;
};

/**
 * Window where closed-loop attribution / click→order was not trustworthy:
 * bare Facebook CTAs (no ?src=), first-touch bare-homepage bug,
 * fbclid→src fallback (~18 Jul afternoon), WebView checkout (#86 ~18 Jul night),
 * and category-chip empty menu until PR #96 (~20 Jul morning ET).
 * Reports must not treat click→order gaps as "campaign failed".
 */
export const ATTRIBUTION_INCOMPLETE_WINDOW = {
  start: "2026-07-16",
  end: "2026-07-20",
  code: "attribution_incomplete_20260716_20",
} as const;

/**
 * Facebook iOS WebView broke Square Pay until PR #86 (~18 Jul night ET);
 * category chips still emptied the menu until PR #96 (~20 Jul morning ET).
 * Content Engine must not learn "FB posts don't convert" from campaigns posted
 * on or before this UTC date.
 */
export const FB_WEBVIEW_LEARNING_CUTOFF = {
  endInclusive: "2026-07-20",
  code: "fb_webview_checkout_broken_pre_pr86",
} as const;

/**
 * Until tagged/visitor mentions were ingested (2026-07-20), daily-report
 * reputation only saw comments on the Page's own posts. Visitor praise (and
 * allergy claims) on personal posts that tagged the Page were invisible.
 * Historical praise/question counts are undercounts — not comparable to
 * post-fix reports.
 */
export const REPUTATION_MENTIONS_GAP = {
  endInclusive: "2026-07-20",
  code: "reputation_missing_tagged_mentions_pre_20260720",
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
        ? "Kualitas data atribusi tidak lengkap (16–20 Jul): link Facebook tanpa ?src=, first-touch, fallback fbclid (~18 Jul sore), WebView checkout (#86), dan chip kategori kosong sampai PR #96 (~20 Jul pagi). Jangan simpulkan kampanye gagal dari gap klik→order di jendela ini."
        : lang === "es"
          ? "Calidad de datos de atribución incompleta (16–20 jul): enlaces de Facebook sin ?src=, first-touch, fallback fbclid (~tarde del 18 jul), checkout WebView (#86) y chips de categoría vacíos hasta el PR #96 (~mañana del 20 jul). No concluya que la campaña falló por brechas clic→pedido en esta ventana."
          : "Attribution data quality incomplete (Jul 16–20): bare Facebook links (no ?src=), first-touch gaps, fbclid fallback (~Jul 18 afternoon), WebView checkout (#86), and empty category chips until PR #96 (~Jul 20 morning). Do not conclude the campaign failed from click→order gaps in this window.";
    flags.push({
      code: ATTRIBUTION_INCOMPLETE_WINDOW.code,
      severity: "warn",
      message,
    });
  }
  if (reportDate <= FB_WEBVIEW_LEARNING_CUTOFF.endInclusive) {
    const message =
      lang === "id"
        ? "Checkout Facebook iOS WebView rusak sampai PR #86 (~18 Jul malam); chip kategori masih mengosongkan menu sampai PR #96 (~20 Jul pagi). Post FB sebelum/pada tanggal itu dikecualikan dari pembelajaran Content Engine (klik tanpa order bukan sinyal produk)."
        : lang === "es"
          ? "El checkout de Facebook iOS WebView falló hasta el PR #86 (~noche del 18 jul); los chips de categoría vaciaban el menú hasta el PR #96 (~mañana del 20 jul). Las publicaciones de FB hasta esa fecha se excluyen del aprendizaje del Content Engine."
          : "Facebook iOS WebView checkout was broken until PR #86 (~Jul 18 night); category chips still emptied the menu until PR #96 (~Jul 20 morning). Facebook campaign posts on/before that date are excluded from Content Engine learning (clicks without orders are not a product signal).";
    flags.push({
      code: FB_WEBVIEW_LEARNING_CUTOFF.code,
      severity: "warn",
      message,
    });
    const cold =
      lang === "id"
        ? "Content Engine memulai dari nol untuk Facebook: hampir seluruh klik→order FB 16–20 Jul tidak bisa dipakai belajar. Ini bukan berarti Facebook tidak pernah menghasilkan order — artinya belum pernah diukur dengan adil."
        : lang === "es"
          ? "El Content Engine empieza de cero en Facebook: casi todos los clic→pedido de FB del 16–20 jul no sirven para aprender. Eso no significa que Facebook nunca generó pedidos — significa que aún no se midió con justicia."
          : "Content Engine starts from zero on Facebook: nearly all FB click→order data from Jul 16–20 is unusable for learning. That does not mean Facebook never drove orders — it means Facebook was never measured fairly.";
    flags.push({
      code: "fb_content_engine_cold_start",
      severity: "info",
      message: cold,
    });
  }
  if (reportDate <= REPUTATION_MENTIONS_GAP.endInclusive) {
    const message =
      lang === "id"
        ? "Angka reputasi sebelum 20 Jul kurang hitung: inbox hanya melihat komentar di post Halaman, bukan post pengunjung/mention yang menandai restoran. Praise/pertanyaan historis tidak sebanding dengan laporan setelah mention di-ingest."
        : lang === "es"
          ? "Las cifras de reputación antes del 20 jul están incompletas: el inbox solo veía comentarios en publicaciones de la Página, no menciones/posts de visitantes. Los elogios históricos no son comparables con los informes posteriores."
          : "Reputation counts before Jul 20 are undercounts: inbox only saw comments on the Page's own posts, not visitor posts/mentions that tagged the restaurant. Historical praise/questions are not comparable to reports after mention ingest.";
    flags.push({
      code: REPUTATION_MENTIONS_GAP.code,
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
