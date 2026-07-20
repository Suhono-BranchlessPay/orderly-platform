import type { DailyReportLang } from "./dailyReportI18n";

export type DataQualityFlag = {
  code: string;
  severity: "info" | "warn";
  message: string;
};

/**
 * PR #96 (category chips filter by name) merged — last funnel blocker closed.
 * Attribution / CE learning is trustworthy at and after this instant, not
 * "end of calendar day Jul 20".
 * @see https://github.com/Suhono-BranchlessPay/orderly-platform/pull/96
 */
export const PR96_CHIP_FIX_AT = "2026-07-20T06:17:38.000Z";

/**
 * Window where closed-loop attribution / click→order was not trustworthy:
 * bare Facebook CTAs (no ?src=), first-touch bare-homepage bug,
 * fbclid→src fallback (~18 Jul afternoon), WebView checkout (#86 ~18 Jul night),
 * and category-chip empty menu until PR #96 (merged 2026-07-20T06:17:38Z).
 * Reports must not treat click→order gaps as "campaign failed".
 */
export const ATTRIBUTION_INCOMPLETE_WINDOW = {
  startInclusive: "2026-07-16T00:00:00.000Z",
  /** Exclusive — data at/after this instant is clean. */
  endExclusive: PR96_CHIP_FIX_AT,
  /** Calendar day of start (report-date helpers). */
  startDate: "2026-07-16",
  /** Calendar day that contains the cutoff (partial day). */
  endDate: "2026-07-20",
  code: "attribution_incomplete_20260716_20",
} as const;

/**
 * Facebook iOS WebView broke Square Pay until PR #86 (~18 Jul night ET);
 * category chips still emptied the menu until PR #96 (timestamp above).
 * Content Engine must not learn "FB posts don't convert" from campaigns
 * posted strictly before the cutoff instant.
 */
export const FB_WEBVIEW_LEARNING_CUTOFF = {
  endExclusive: PR96_CHIP_FIX_AT,
  endDate: "2026-07-20",
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

function parseInstant(
  isoDateOrPostedAt: string | Date | null | undefined,
): Date | null {
  if (isoDateOrPostedAt == null) return null;
  if (isoDateOrPostedAt instanceof Date) {
    return Number.isNaN(isoDateOrPostedAt.getTime()) ? null : isoDateOrPostedAt;
  }
  const raw = String(isoDateOrPostedAt).trim();
  if (!raw) return null;
  // Date-only → start of that UTC day (conservative for CE post rows).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function attributionDataQualityFlags(
  reportDate: string,
  lang: DailyReportLang = "en",
): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];
  const inPartialOrFullWindow =
    reportDate >= ATTRIBUTION_INCOMPLETE_WINDOW.startDate &&
    reportDate <= ATTRIBUTION_INCOMPLETE_WINDOW.endDate;

  if (inPartialOrFullWindow) {
    const message =
      lang === "id"
        ? "Kualitas data atribusi tidak lengkap (16 Jul → deploy PR #96 ~20 Jul 02:17 ET / 06:17 UTC): link Facebook tanpa ?src=, first-touch, fallback fbclid (~18 Jul sore), WebView checkout (#86), dan chip kategori kosong. Setelah stempel PR #96 data bersih — jangan buang order/sinyal sesudahnya. Jangan simpulkan kampanye gagal dari gap klik→order di jendela rusak."
        : lang === "es"
          ? "Calidad de datos de atribución incompleta (16 jul → deploy PR #96 ~20 jul 02:17 ET / 06:17 UTC): enlaces de Facebook sin ?src=, first-touch, fallback fbclid, checkout WebView (#86) y chips de categoría vacíos. Después de ese instante los datos son limpios — no descarte pedidos posteriores. No concluya fracaso de campaña por brechas en la ventana rota."
          : "Attribution data quality incomplete (Jul 16 → PR #96 deploy ~Jul 20 02:17 ET / 06:17 UTC): bare Facebook links (no ?src=), first-touch gaps, fbclid fallback, WebView checkout (#86), and empty category chips. After that instant data is clean — do not discard later orders/signals. Do not conclude the campaign failed from click→order gaps in the broken window.";
    flags.push({
      code: ATTRIBUTION_INCOMPLETE_WINDOW.code,
      severity: "warn",
      message,
    });
  }
  if (reportDate <= FB_WEBVIEW_LEARNING_CUTOFF.endDate) {
    const message =
      lang === "id"
        ? "Checkout Facebook iOS WebView rusak sampai PR #86 (~18 Jul malam); chip kategori mengosongkan menu sampai PR #96 (merge 2026-07-20T06:17:38Z). Post/kampanye FB sebelum stempel itu dikecualikan dari pembelajaran Content Engine; setelahnya boleh dipelajari."
        : lang === "es"
          ? "El checkout de Facebook iOS WebView falló hasta el PR #86 (~noche del 18 jul); los chips vaciaban el menú hasta el PR #96 (merge 2026-07-20T06:17:38Z). Las campañas de FB anteriores a ese instante se excluyen del aprendizaje del Content Engine; después sí cuentan."
          : "Facebook iOS WebView checkout was broken until PR #86 (~Jul 18 night); category chips emptied the menu until PR #96 (merged 2026-07-20T06:17:38Z). Facebook campaigns before that instant are excluded from Content Engine learning; after it, signals are usable.";
    flags.push({
      code: FB_WEBVIEW_LEARNING_CUTOFF.code,
      severity: "warn",
      message,
    });
    const cold =
      lang === "id"
        ? "Content Engine memulai dari nol untuk Facebook: hampir seluruh klik→order FB sebelum deploy PR #96 tidak bisa dipakai belajar. Ini bukan berarti Facebook tidak pernah menghasilkan order — artinya belum pernah diukur dengan adil sampai corong dibuka."
        : lang === "es"
          ? "El Content Engine empieza de cero en Facebook: casi todos los clic→pedido de FB anteriores al deploy del PR #96 no sirven para aprender. Eso no significa que Facebook nunca generó pedidos — significa que aún no se midió con justicia hasta abrir el embudo."
          : "Content Engine starts from zero on Facebook: nearly all FB click→order data before the PR #96 deploy is unusable for learning. That does not mean Facebook never drove orders — it means Facebook was never measured fairly until the funnel opened.";
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
          ? "Las cifras de reputación antes del 20 jul son incompletas: el inbox solo veía comentarios en publicaciones de la Página, no menciones/posts de visitantes. Los elogios históricos no son comparables con los informes posteriores."
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

/**
 * True when the instant falls in the broken-attribution window
 * [startInclusive, endExclusive). Date-only strings use 00:00 UTC that day
 * (conservative — a bare "2026-07-20" stays excluded; a timed Jul 20 after
 * PR #96 is included).
 */
export function isInAttributionIncompleteWindow(
  isoDateOrPostedAt: string | Date | null | undefined,
): boolean {
  const t = parseInstant(isoDateOrPostedAt);
  if (!t) return false;
  const start = new Date(ATTRIBUTION_INCOMPLETE_WINDOW.startInclusive).getTime();
  const end = new Date(ATTRIBUTION_INCOMPLETE_WINDOW.endExclusive).getTime();
  const ms = t.getTime();
  return ms >= start && ms < end;
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

/**
 * Facebook campaign performance from before the funnel was trustworthy
 * must not train CE. Cutoff is PR #96 merge instant (not end of Jul 20).
 */
export function isPreWebviewFacebookPerformance(row: {
  postedAt?: string | Date | null;
  src?: string | null;
  platform?: string | null;
}): boolean {
  const t = parseInstant(row.postedAt ?? null);
  if (!t) return false;
  const end = new Date(FB_WEBVIEW_LEARNING_CUTOFF.endExclusive).getTime();
  if (t.getTime() >= end) return false;
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
