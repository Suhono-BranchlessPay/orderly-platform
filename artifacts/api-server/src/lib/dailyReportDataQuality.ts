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

export function attributionDataQualityFlags(
  reportDate: string,
  lang: DailyReportLang = "en",
): DataQualityFlag[] {
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
    return [
      {
        code: ATTRIBUTION_INCOMPLETE_WINDOW.code,
        severity: "warn",
        message,
      },
    ];
  }
  return [];
}

export function hasIncompleteAttributionWindow(
  flags: DataQualityFlag[] | undefined,
): boolean {
  return Boolean(
    flags?.some((f) => f.code === ATTRIBUTION_INCOMPLETE_WINDOW.code),
  );
}
