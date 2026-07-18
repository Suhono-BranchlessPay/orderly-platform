/**
 * Daily report UI + fact-string locales (en / id / es).
 * Narrative body still comes from AI in the requested language.
 */

export type DailyReportLang = "en" | "id" | "es";

export function normalizeDailyReportLang(raw?: string | null): DailyReportLang {
  const v = String(raw || "en")
    .trim()
    .toLowerCase();
  if (v === "id" || v === "in" || v === "indonesian" || v === "indonesia") {
    return "id";
  }
  if (v === "es" || v === "spa" || v === "spanish" || v === "español" || v === "espanol") {
    return "es";
  }
  return "en";
}

export function langLocale(lang: DailyReportLang): string {
  if (lang === "id") return "id-ID";
  if (lang === "es") return "es-ES";
  return "en-US";
}

export function langLabel(lang: DailyReportLang): string {
  if (lang === "id") return "Bahasa Indonesia";
  if (lang === "es") return "Español";
  return "English";
}

export type DailyReportUi = {
  verified: string;
  needsAttention: string;
  salesYesterday: string;
  trend7d: string;
  busiestHours: string;
  peakNote: string;
  topProducts: string;
  onlineAttribution: string;
  subsetWarning: string;
  channel: string;
  orders: string;
  dollars: string;
  clickOrderGap: string;
  clickOrderGapNote: string;
  reputation: string;
  praise: string;
  questions: string;
  unansweredParen: (n: number) => string;
  complaints: string;
  healthAllergy: string;
  menuSuggestions: string;
  noPraise: string;
  insights: string;
  managerNote: string;
  oneIdea: string;
  supplyTitle: string;
  supplyLevelNote: string;
  totalSales: string;
  customers: string;
  avgTicket: string;
  tipsTax: (tips: string, tax: string) => string;
  squareUnavailable: string;
  noSquareRow: (date: string) => string;
  noProductMix: string;
  noOnlineOrders: string;
  gscTitle: string;
  squareWindowNote: (label: string) => string;
  noHourData: string;
  trendNeedsSquare: string;
  foodDrinkNote: string;
  noMarketplaceFee: string;
  narrativeAi: string;
  narrativeFacts: string;
  disclaimer: string;
};

const EN: DailyReportUi = {
  verified: "Verified",
  needsAttention: "⚠ NEEDS ATTENTION",
  salesYesterday: "Sales yesterday (all channels)",
  trend7d: "7-day trend",
  busiestHours: "Busiest hours (last 7 days)",
  peakNote:
    "Peak marked in red · staff before the rush; schedule posts 1–2h earlier.",
  topProducts: "Top products (last 7 days)",
  onlineAttribution: "Online attribution (Orderly)",
  subsetWarning: "Subset of Square — do not add these dollars to the totals above.",
  channel: "Channel / src",
  orders: "Orders",
  dollars: "$",
  clickOrderGap: "CLICK → ORDER GAP",
  clickOrderGapNote:
    "Interest without checkout — promote what already sells. Some clicks may be influencer/share traffic (separate tracking later).",
  reputation: "Reputation",
  praise: "Praise",
  questions: "Questions",
  unansweredParen: (n) => `(${n} unanswered)`,
  complaints: "Complaints",
  healthAllergy: "Health/allergy",
  menuSuggestions: "Menu asks",
  noPraise: "No new praise quotes to show today.",
  insights: "⭐ Insights",
  managerNote: "MANAGER NOTE",
  oneIdea: "💡 ONE IDEA FOR TODAY",
  supplyTitle: "SUPPLY REMINDER (from sales)",
  supplyLevelNote:
    "Level 1 — usage from weekly sales only. Not a prediction of days remaining.",
  totalSales: "Total sales",
  customers: "Customers",
  avgTicket: "Avg ticket",
  tipsTax: (tips, tax) => `Tips ${tips} · Tax ${tax} · Source: Square (all channels)`,
  squareUnavailable:
    "Square data unavailable. Showing Orderly attribution / reputation only — totals may be incomplete.",
  noSquareRow: (date) => `No Square daily row for ${date}.`,
  noProductMix: "No product mix data.",
  noOnlineOrders:
    "No paid Orderly-tracked online orders yesterday (Square dine-in/POS can still be busy).",
  gscTitle: "Search visibility (Google Search Console)",
  squareWindowNote: (label: string) => `Rolling window: ${label} (live Square query — not a frozen cache).`,
  noHourData: "No hour data",
  trendNeedsSquare: "Trend needs Square data.",
  foodDrinkNote:
    "Food vs drink breakdown needs Square menu categories (most items are Uncategorized today).",
  noMarketplaceFee: "no marketplace fee",
  narrativeAi: "Narrative by AI Gateway (facts only).",
  narrativeFacts: "Narrative from structured facts (AI unavailable).",
  disclaimer:
    "Totals = Square (all channels). Online channel $ = Orderly attribution only — never added to Square. Narrative & insights use actual data only; no forecasts. Supply reminder = usage from sales (Level 1), not inventory prediction.",
};

const ID: DailyReportUi = {
  verified: "Terverifikasi",
  needsAttention: "⚠ PERLU PERHATIAN",
  salesYesterday: "Penjualan kemarin (semua channel)",
  trend7d: "Tren 7 hari",
  busiestHours: "Jam tersibuk (7 hari terakhir)",
  peakNote:
    "Puncak ditandai merah · siapkan staf sebelum ramai; jadwalkan post 1–2 jam lebih awal.",
  topProducts: "Produk terlaris (7 hari terakhir)",
  onlineAttribution: "Atribusi online (Orderly)",
  subsetWarning:
    "Subset dari Square — jangan jumlahkan dolar ini ke total di atas.",
  channel: "Channel / src",
  orders: "Order",
  dollars: "$",
  clickOrderGap: "KLIK → ORDER (GAP)",
  clickOrderGapNote:
    "Banyak yang lihat tapi belum pesan — promosikan yang sudah terbukti laku. Sebagian klik mungkin dari influencer/share (pelacakan terpisah nanti).",
  reputation: "Reputasi",
  praise: "Pujian",
  questions: "Pertanyaan",
  unansweredParen: (n) => `(${n} belum dijawab)`,
  complaints: "Komplain",
  healthAllergy: "Kesehatan/alergi",
  menuSuggestions: "Permintaan menu",
  noPraise: "Belum ada kutipan pujian baru hari ini.",
  insights: "⭐ Insight",
  managerNote: "CATATAN MANAJER",
  oneIdea: "💡 SATU IDE UNTUK HARI INI",
  supplyTitle: "PENGINGAT STOK SUPPLY (dari penjualan)",
  supplyLevelNote:
    "Level 1 — pemakaian dari penjualan minggu ini saja. Bukan prediksi hari sampai habis.",
  totalSales: "Total penjualan",
  customers: "Pelanggan",
  avgTicket: "Rata-rata tiket",
  tipsTax: (tips, tax) => `Tip ${tips} · Pajak ${tax} · Sumber: Square (semua channel)`,
  squareUnavailable:
    "Data Square tidak tersedia. Menampilkan atribusi/reputasi Orderly saja — total mungkin tidak lengkap.",
  noSquareRow: (date) => `Tidak ada baris harian Square untuk ${date}.`,
  noProductMix: "Tidak ada data product mix.",
  noOnlineOrders:
    "Tidak ada order online berbayar terlacak Orderly kemarin (dine-in/POS Square bisa tetap ramai).",
  gscTitle: "Visibilitas pencarian (Google Search Console)",
  squareWindowNote: (label) =>
    `Jendela bergulir: ${label} (query Square live — bukan cache beku).`,
  noHourData: "Tidak ada data jam",
  trendNeedsSquare: "Tren membutuhkan data Square.",
  foodDrinkNote:
    "Pisah makanan vs minuman membutuhkan kategori menu di Square (sebagian besar masih Uncategorized).",
  noMarketplaceFee: "tanpa komisi marketplace",
  narrativeAi: "Naratif oleh AI Gateway (hanya fakta).",
  narrativeFacts: "Naratif dari fakta terstruktur (AI tidak tersedia).",
  disclaimer:
    "Total = Square (semua channel). $ channel online = atribusi Orderly saja — jangan dijumlahkan ke Square. Naratif & insight hanya dari data aktual; tanpa prediksi. Pengingat stok = pemakaian dari penjualan (Level 1), bukan prediksi inventori.",
};

const ES: DailyReportUi = {
  verified: "Verificado",
  needsAttention: "⚠ REQUIERE ATENCIÓN",
  salesYesterday: "Ventas de ayer (todos los canales)",
  trend7d: "Tendencia de 7 días",
  busiestHours: "Horas más ocupadas (últimos 7 días)",
  peakNote:
    "Pico marcado en rojo · prepare personal antes del rush; programe publicaciones 1–2 h antes.",
  topProducts: "Productos más vendidos (últimos 7 días)",
  onlineAttribution: "Atribución online (Orderly)",
  subsetWarning:
    "Subconjunto de Square — no sume estos dólares a los totales de arriba.",
  channel: "Canal / src",
  orders: "Pedidos",
  dollars: "$",
  clickOrderGap: "CLICS → PEDIDOS (BRECHA)",
  clickOrderGapNote:
    "Interés sin compra — promueva lo que ya se vende. Algunos clics pueden ser de influencer/compartidos (seguimiento aparte después).",
  reputation: "Reputación",
  praise: "Elogios",
  questions: "Preguntas",
  unansweredParen: (n) => `(${n} sin responder)`,
  complaints: "Quejas",
  healthAllergy: "Salud/alergia",
  menuSuggestions: "Pedidos de menú",
  noPraise: "No hay citas de elogio nuevas hoy.",
  insights: "⭐ Insights",
  managerNote: "NOTA DEL GERENTE",
  oneIdea: "💡 UNA IDEA PARA HOY",
  supplyTitle: "RECORDATORIO DE SUMINISTROS (por ventas)",
  supplyLevelNote:
    "Nivel 1 — uso según ventas de la semana. No es predicción de días restantes.",
  totalSales: "Ventas totales",
  customers: "Clientes",
  avgTicket: "Ticket promedio",
  tipsTax: (tips, tax) => `Propinas ${tips} · Impuestos ${tax} · Fuente: Square (todos los canales)`,
  squareUnavailable:
    "Datos de Square no disponibles. Solo atribución/reputación de Orderly — totales pueden estar incompletos.",
  noSquareRow: (date) => `No hay fila diaria de Square para ${date}.`,
  noProductMix: "Sin datos de mezcla de productos.",
  noOnlineOrders:
    "No hay pedidos online pagados rastreados por Orderly ayer (el POS/dine-in de Square puede seguir activo).",
  gscTitle: "Visibilidad de búsqueda (Google Search Console)",
  squareWindowNote: (label) =>
    `Ventana móvil: ${label} (consulta Square en vivo — no es caché congelada).`,
  noHourData: "Sin datos por hora",
  trendNeedsSquare: "La tendencia necesita datos de Square.",
  foodDrinkNote:
    "Comida vs bebida requiere categorías de menú en Square (casi todo está Uncategorized hoy).",
  noMarketplaceFee: "sin comisión de marketplace",
  narrativeAi: "Narrativa por AI Gateway (solo hechos).",
  narrativeFacts: "Narrativa desde hechos estructurados (AI no disponible).",
  disclaimer:
    "Totales = Square (todos los canales). $ de canal online = solo atribución Orderly — nunca se suma a Square. Narrativa e insights solo con datos reales; sin predicciones. Recordatorio de stock = uso por ventas (Nivel 1), no predicción de inventario.",
};

export function uiForLang(lang: DailyReportLang): DailyReportUi {
  if (lang === "id") return ID;
  if (lang === "es") return ES;
  return EN;
}

const SUPPLY_LABEL: Record<
  DailyReportLang,
  Record<string, string>
> = {
  en: {
    gelas_minuman: "drink cups",
    botol_air: "water bottles",
    box_bento: "bento boxes",
    porsi_hibachi: "hibachi portions",
    wadah_appetizer: "appetizer containers",
  },
  id: {
    gelas_minuman: "gelas minuman",
    botol_air: "botol air",
    box_bento: "box bento",
    porsi_hibachi: "porsi hibachi",
    wadah_appetizer: "wadah appetizer",
  },
  es: {
    gelas_minuman: "vasos de bebida",
    botol_air: "botellas de agua",
    box_bento: "cajas bento",
    porsi_hibachi: "porciones hibachi",
    wadah_appetizer: "envases de entrada",
  },
};

export function formatSupplyReminderI18n(
  usage: { supplyType: string; quantity: number }[],
  lang: DailyReportLang,
): string {
  if (!usage.length) return "";
  const labels = SUPPLY_LABEL[lang];
  const parts = usage.map(
    (u) => `~${u.quantity} ${labels[u.supplyType] || u.supplyType}`,
  );
  if (lang === "id") {
    return `Terpakai minggu ini (dari penjualan): ${parts.join(", ")}. Cek stok supply sebelum kehabisan.`;
  }
  if (lang === "es") {
    return `Usado esta semana (por ventas): ${parts.join(", ")}. Revise el stock de suministros antes de que se acabe.`;
  }
  return `Used this week (from sales): ${parts.join(", ")}. Check supply stock before you run out.`;
}

export function formatPctVs7d(pct: number, lang: DailyReportLang): string {
  const sign = pct > 0 ? "+" : "";
  if (lang === "id") return `${sign}${pct}% vs rata-rata 7 hari`;
  if (lang === "es") return `${sign}${pct}% vs promedio 7 días`;
  return `${sign}${pct}% vs 7-day avg`;
}

export function buildAttentionLineI18n(
  reputation: {
    buckets: { question: number };
    unansweredQuestions: number;
    unanswered: unknown[];
    urgent: unknown[];
  },
  lang: DailyReportLang,
): string {
  const parts: string[] = [];
  const urgentN = reputation.urgent.length;
  const q = reputation.buckets.question;
  const uq = reputation.unansweredQuestions;
  const uAll = reputation.unanswered.length;

  if (lang === "id") {
    if (urgentN) parts.push(`${urgentN} item komplain/kesehatan perlu dicek.`);
    if (q > 0 && uAll > 0) {
      parts.push(
        `${q} pertanyaan kemarin · ${uAll} masih belum dijawab` +
          (uq > 0 && uq !== uAll ? ` (${uq} di antaranya pertanyaan)` : "") +
          ".",
      );
    } else if (q > 0) {
      parts.push(`${q} pertanyaan kemarin — sudah dijawab/ditutup.`);
    } else if (uAll > 0) {
      parts.push(`${uAll} pesan inbox masih belum dijawab.`);
    }
    return parts.join(" ");
  }

  if (lang === "es") {
    if (urgentN) parts.push(`${urgentN} queja(s)/salud requieren revisión.`);
    if (q > 0 && uAll > 0) {
      parts.push(
        `${q} preguntas ayer · ${uAll} aún sin responder` +
          (uq > 0 && uq !== uAll ? ` (${uq} son preguntas)` : "") +
          ".",
      );
    } else if (q > 0) {
      parts.push(`${q} preguntas ayer — todas respondidas o cerradas.`);
    } else if (uAll > 0) {
      parts.push(`${uAll} mensaje(s) del inbox aún sin responder.`);
    }
    return parts.join(" ");
  }

  if (urgentN) parts.push(`${urgentN} complaint/health item(s) need a look.`);
  if (q > 0 && uAll > 0) {
    parts.push(
      `${q} questions yesterday · ${uAll} still unanswered` +
        (uq > 0 && uq !== uAll ? ` (${uq} of them questions)` : "") +
        ".",
    );
  } else if (q > 0) {
    parts.push(`${q} questions yesterday — all answered or cleared.`);
  } else if (uAll > 0) {
    parts.push(`${uAll} inbox message(s) still unanswered.`);
  }
  return parts.join(" ");
}
