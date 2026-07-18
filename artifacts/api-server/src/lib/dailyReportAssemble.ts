/**
 * Build one tenant's daily report payload.
 * Anti double-count: Square = all-channel total; Orderly = online attribution subset.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { run as aiRun } from "./ai";
import type { DailyReportLlmOutput } from "./ai/guardrails";
import {
  fetchOrderlyChannelAttribution,
  fetchOrderlyGbpDay,
  fetchOrderlyQrScans,
  fetchOrderlyReputation,
  fetchOrderlySocialPosts,
  localYesterday,
  type ChannelAttribution,
  type GbpDaySummary,
  type QrScanDaySummary,
  type ReputationBucket,
  type ReputationQuote,
  type SocialPostsDaySummary,
  type UnansweredInboxItem,
} from "./dailyReportOrderly";
import {
  buildAttentionLineI18n,
  formatSupplyReminderI18n,
  normalizeDailyReportLang,
  uiForLang,
  type DailyReportLang,
} from "./dailyReportI18n";
import { buildSupplyUsageFromProducts, type SupplyUsage } from "./dailyReportSupply";
import { logger } from "./logger";
import { refreshSocialPostMetrics } from "./socialPosting";
import {
  fetchSquareBusyHours,
  fetchSquareDailySales,
  fetchSquareProductMixForSupply,
  fetchSquareTopProducts,
  parseBusyHourRows,
  parseDailySalesRows,
  parseTopProductRows,
} from "./squareReporting";
import { fetchGscDailyReportSlice } from "./gscAnalytics";
import type { GscDailyReportSlice } from "./gscAnalytics";

export type DailyReportDay = {
  date: string;
  totalSalesCents: number;
  netSalesCents: number;
  orderCount: number;
  avgNetSalesCents: number;
  tipsCents: number;
  taxCents: number;
  uniqueCustomers: number;
};

export type DailyReportNarrative = {
  greeting: string;
  body: string;
  attention: string;
  ideaForToday: string;
  source: "ai" | "facts";
};

export type DailyReportPayload = {
  tenantId: string;
  tenantSlug: string;
  restaurantName: string;
  reportDate: string;
  timeZone: string;
  /** Report language for UI chrome + AI narrative (en | id | es). */
  language: DailyReportLang;
  squareAvailable: boolean;
  squareError?: string;
  /** Yesterday (or reportDate) from Square — all channels. */
  day: DailyReportDay | null;
  /** 7-day average of Square daily totals (for "vs 7-day avg"). */
  avg7d: {
    totalSalesCents: number;
    orderCount: number;
    uniqueCustomers: number;
    avgNetSalesCents: number;
  } | null;
  trend7d: DailyReportDay[];
  topProducts: { name: string; quantity: number; netSalesCents: number }[];
  busyHours: { hour: number; totalSalesCents: number; orderCount: number }[];
  peakHour: number | null;
  /** Explicit rolling window for Square 7d slices (transparency / no frozen cache). */
  squareWindow: { startDate: string; endDate: string; label: string };
  /** Orderly online attribution — DO NOT add to Square totals. */
  orderlyChannels: ChannelAttribution[];
  /** Google Search Console (honest empty states — never invent positions). */
  gsc: GscDailyReportSlice;
  reputation: {
    buckets: ReputationBucket;
    quotes: ReputationQuote[];
    urgent: ReputationQuote[];
    unanswered: UnansweredInboxItem[];
    /** Questions still in unanswered statuses (subset of unanswered). */
    unansweredQuestions: number;
  };
  qrScans: QrScanDaySummary;
  socialPosts: SocialPostsDaySummary;
  gbp: GbpDaySummary;
  /** Food vs drink — blocked until Square menu categories exist. */
  foodDrinkNote: string;
  /** Level-1 supply usage from weekly product mix (facts only). */
  supplyUsage: SupplyUsage[];
  supplyReminder: string;
  narrative: DailyReportNarrative;
  insights: string[];
  disclaimer: string;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function peakLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function weekdayName(isoDate: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return "";
  }
}

/** Structured attention — never invent counts; keep Questions vs unanswered aligned. */
export function buildAttentionLine(
  reputation: DailyReportPayload["reputation"],
  lang: DailyReportLang = "en",
): string {
  return buildAttentionLineI18n(reputation, lang);
}

export function buildFactInsights(
  p: Pick<
    DailyReportPayload,
    | "topProducts"
    | "peakHour"
    | "day"
    | "avg7d"
    | "orderlyChannels"
    | "supplyReminder"
    | "restaurantName"
    | "reportDate"
    | "timeZone"
    | "socialPosts"
    | "language"
  >,
): string[] {
  const lang = p.language || "en";
  const out: string[] = [];
  const anomaly = p.socialPosts.clickAnomalies[0];

  if (anomaly) {
    const top = p.topProducts[0]?.name;
    const src = anomaly.srcTag ? ` (tracked link ${anomaly.srcTag})` : "";
    if (lang === "id") {
      out.push(
        `${anomaly.itemName}: ${anomaly.clicks} klik → ${anomaly.orders} order berbayar lewat link ini${src}` +
          ` · item yang dipromosikan: ${anomaly.ordersPromotedItem} order.` +
          (top
            ? ` Banyak yang lihat tapi belum checkout lewat link; coba feature ${top}.`
            : " Banyak yang lihat tapi belum checkout lewat link.") +
          " (Sebagian klik mungkin influencer/share.)",
      );
    } else if (lang === "es") {
      out.push(
        `${anomaly.itemName}: ${anomaly.clicks} clics → ${anomaly.orders} pedidos pagados con este enlace${src}` +
          ` · ítem promovido: ${anomaly.ordersPromotedItem} pedido(s).` +
          (top
            ? ` Hubo interés sin checkout; pruebe destacar ${top}.`
            : " Hubo interés sin checkout.") +
          " (Algunos clics pueden ser de influencer/compartidos.)",
      );
    } else {
      out.push(
        `${anomaly.itemName}: ${anomaly.clicks} clicks → ${anomaly.orders} paid orders via this tracked link${src}` +
          ` · promoted item: ${anomaly.ordersPromotedItem} order(s).` +
          (top
            ? ` Interest without checkout on the link; try featuring ${top}.`
            : " Interest without checkout on the link.") +
          " (Some clicks may be influencer/share traffic.)",
      );
    }
  }

  if (p.peakHour != null) {
    if (lang === "id") {
      out.push(
        `Jam tersibuk (7 hari): sekitar ${peakLabel(p.peakHour)}. Siapkan staf dan jadwalkan post 1–2 jam sebelumnya.`,
      );
    } else if (lang === "es") {
      out.push(
        `Hora pico (7 días): alrededor de ${peakLabel(p.peakHour)}. Prepare personal y programe publicaciones 1–2 h antes.`,
      );
    } else {
      out.push(
        `Busiest hour (last 7 days): around ${peakLabel(p.peakHour)}. Consider staffing and posting 1–2 hours before that window.`,
      );
    }
  }

  if (p.topProducts[0] && !anomaly) {
    const top = p.topProducts[0];
    if (lang === "id") {
      out.push(
        `Terlaris (7 hari): ${top.name} — ${top.quantity} terjual, ${dollars(top.netSalesCents)} net. Promosikan yang sudah laku.`,
      );
    } else if (lang === "es") {
      out.push(
        `Más vendido (7 días): ${top.name} — ${top.quantity} vendidos, ${dollars(top.netSalesCents)} neto. Promueva lo que ya se vende.`,
      );
    } else {
      out.push(
        `Top seller (last 7 days): ${top.name} — ${top.quantity} sold, ${dollars(top.netSalesCents)} net. Promote what already sells.`,
      );
    }
  }

  if (p.day && p.avg7d && p.avg7d.totalSalesCents > 0) {
    const pct = Math.round(
      ((p.day.totalSalesCents - p.avg7d.totalSalesCents) / p.avg7d.totalSalesCents) *
        100,
    );
    if (lang === "id") {
      const dir = pct >= 0 ? "di atas" : "di bawah";
      out.push(
        `Total penjualan kemarin ${Math.abs(pct)}% ${dir} rata-rata 7 hari (hari kerja/akhir pekan berbeda — ini bukan prediksi).`,
      );
    } else if (lang === "es") {
      const dir = pct >= 0 ? "por encima" : "por debajo";
      out.push(
        `Las ventas de ayer estuvieron ${Math.abs(pct)}% ${dir} del promedio de 7 días (entre semana/fin de semana varía — no es un pronóstico).`,
      );
    } else {
      const dir = pct >= 0 ? "above" : "below";
      out.push(
        `Yesterday's total sales were ${Math.abs(pct)}% ${dir} the 7-day average (weekday/weekend mix varies — this is not a forecast).`,
      );
    }
  }

  const google = p.orderlyChannels.find((c) => c.src.includes("google"));
  if (google && google.orders > 0 && out.length < 3) {
    if (lang === "id") {
      out.push(
        `Orderly melacak ${google.orders} order online berbayar dari Google (${dollars(google.totalCents)}) — tanpa komisi marketplace. Ini subset total Square, bukan pendapatan tambahan.`,
      );
    } else if (lang === "es") {
      out.push(
        `Orderly rastreó ${google.orders} pedido(s) online pagado(s) de Google (${dollars(google.totalCents)}) — sin comisión de marketplace. Es un subconjunto de Square, no ingreso extra.`,
      );
    } else {
      out.push(
        `Orderly tracked ${google.orders} paid online order(s) from Google (${dollars(google.totalCents)}) — marketplace-fee free. This is a subset of Square totals, not extra revenue.`,
      );
    }
  }
  return out.slice(0, 3);
}

function buildFactNarrative(
  p: Omit<DailyReportPayload, "narrative" | "insights" | "disclaimer">,
): DailyReportNarrative {
  const lang = p.language || "en";
  const dayName = weekdayName(p.reportDate, p.timeZone) || "yesterday";
  const parts: string[] = [];
  if (p.day) {
    let pct = 0;
    if (p.avg7d && p.avg7d.totalSalesCents > 0) {
      pct = Math.round(
        ((p.day.totalSalesCents - p.avg7d.totalSalesCents) /
          p.avg7d.totalSalesCents) *
          100,
      );
    }
    const windowMax = Math.max(
      0,
      ...p.trend7d.map((d) => d.totalSalesCents),
      p.day.totalSalesCents,
    );
    const isStrongestInWindow =
      p.trend7d.length > 0 && p.day.totalSalesCents >= windowMax;
    const isStrongDay =
      pct >= 25 || p.day.tipsCents >= 20000 || isStrongestInWindow;
    if (isStrongDay) {
      const strongestBit = isStrongestInWindow
        ? lang === "id"
          ? " — terkuat di jendela 7 hari"
          : lang === "es"
            ? " — el más alto en la ventana de 7 días"
            : " — strongest in your rolling 7-day window"
        : "";
      if (lang === "id") {
        parts.push(
          `Hari yang bagus untuk dirayakan: omzet ${dollars(p.day.totalSalesCents)}${strongestBit}` +
            (pct > 0 ? ` (~${pct}% di atas rata-rata 7 hari)` : "") +
            ` dari ${p.day.orderCount} order, tip ${dollars(p.day.tipsCents)}. Semuanya lewat Square (semua channel).`,
        );
      } else if (lang === "es") {
        parts.push(
          `Día para celebrar: ${dollars(p.day.totalSalesCents)}${strongestBit}` +
            (pct > 0 ? ` (~${pct}% sobre el promedio de 7 días)` : "") +
            ` en ${p.day.orderCount} pedidos, propinas ${dollars(p.day.tipsCents)}. Todo vía Square (todos los canales).`,
        );
      } else {
        parts.push(
          `A day worth celebrating: ${dollars(p.day.totalSalesCents)}${strongestBit}` +
            (pct > 0 ? ` (~${pct}% above your 7-day average)` : "") +
            ` across ${p.day.orderCount} orders, with ${dollars(p.day.tipsCents)} in tips. All channels via Square.`,
        );
      }
    } else {
      let vs = "";
      if (p.avg7d && p.avg7d.totalSalesCents > 0) {
        if (lang === "id") {
          vs =
            pct === 0
              ? " Pas dengan rata-rata 7 hari."
              : pct > 0
                ? ` Sekitar ${pct}% di atas rata-rata 7 hari — solid untuk ${dayName}.`
                : ` Sekitar ${Math.abs(pct)}% di bawah rata-rata 7 hari — sering wajar untuk ${dayName}.`;
        } else if (lang === "es") {
          vs =
            pct === 0
              ? " Justo en su promedio de 7 días."
              : pct > 0
                ? ` Unos ${pct}% por encima del promedio de 7 días — sólido para un ${dayName}.`
                : ` Unos ${Math.abs(pct)}% por debajo del promedio de 7 días — a menudo normal para un ${dayName}.`;
        } else {
          vs =
            pct === 0
              ? " Right on your 7-day average."
              : pct > 0
                ? ` About ${pct}% above your 7-day average — solid for a ${dayName}.`
                : ` About ${Math.abs(pct)}% below your 7-day average — often normal for a ${dayName}.`;
        }
      }
      if (lang === "id") {
        parts.push(
          `Kemarin omzet ${dollars(p.day.totalSalesCents)} dari ${p.day.orderCount} order (semua channel via Square).${vs}`,
        );
      } else if (lang === "es") {
        parts.push(
          `Ayer registró ${dollars(p.day.totalSalesCents)} en ${p.day.orderCount} pedidos (todos los canales vía Square).${vs}`,
        );
      } else {
        parts.push(
          `Yesterday you rang ${dollars(p.day.totalSalesCents)} across ${p.day.orderCount} orders (all channels via Square).${vs}`,
        );
      }
    }
  } else if (!p.squareAvailable) {
    parts.push(
      lang === "id"
        ? `Total Square tidak tersedia untuk ${p.reportDate}. Di bawah hanya atribusi/inbox Orderly — gambaran hari belum lengkap.`
        : lang === "es"
          ? `Los totales de Square no están disponibles para ${p.reportDate}. Abajo solo atribución/inbox de Orderly — panorama incompleto.`
          : `Square totals were unavailable for ${p.reportDate}. Below is Orderly online attribution and inbox only — incomplete picture of the full day.`,
    );
  }

  if (p.topProducts[0]) {
    const top = p.topProducts[0];
    if (lang === "id") {
      parts.push(
        `Bintang minggu ini: ${top.name} (${top.quantity} terjual, ${dollars(top.netSalesCents)} net).`,
      );
    } else if (lang === "es") {
      parts.push(
        `Destacado de la semana: ${top.name} (${top.quantity} vendidos, ${dollars(top.netSalesCents)} neto).`,
      );
    } else {
      parts.push(
        `Your standout seller this week: ${top.name} (${top.quantity} sold, ${dollars(top.netSalesCents)} net).`,
      );
    }
  }

  if (p.peakHour != null) {
    if (lang === "id") {
      parts.push(
        `Puncak sekitar ${peakLabel(p.peakHour)} — siapkan staf sebelum rush dan jadwalkan post 1–2 jam lebih awal.`,
      );
    } else if (lang === "es") {
      parts.push(
        `El pico está cerca de ${peakLabel(p.peakHour)} — prepare personal y programe publicaciones 1–2 h antes.`,
      );
    } else {
      parts.push(
        `Peak traffic sits around ${peakLabel(p.peakHour)} — staff ahead of that rush and schedule posts 1–2 hours earlier.`,
      );
    }
  }

  const google = p.orderlyChannels.find((c) => c.src.includes("google"));
  if (google && (google.orders > 0 || google.totalCents > 0)) {
    if (lang === "id") {
      parts.push(
        `Online via Orderly: Google menyumbang ${google.orders} order berbayar (${dollars(google.totalCents)}) tanpa komisi marketplace — sudah masuk total Square, bukan tambahan.`,
      );
    } else if (lang === "es") {
      parts.push(
        `Online vía Orderly: Google aportó ${google.orders} pedido(s) pagado(s) (${dollars(google.totalCents)}) sin comisión — ya está dentro del total de Square, no es extra.`,
      );
    } else {
      parts.push(
        `Online via Orderly: Google contributed ${google.orders} paid order(s) (${dollars(google.totalCents)}) with no marketplace fee — already inside the Square total, not extra.`,
      );
    }
  }

  const anomaly = p.socialPosts.clickAnomalies[0];
  if (anomaly) {
    const top = p.topProducts[0]?.name;
    if (lang === "id") {
      parts.push(
        `${anomaly.itemName}: ${anomaly.clicks} klik tapi ${anomaly.orders} order berbayar` +
          (top
            ? ` — banyak yang lihat, belum pesan. Feature ${top} yang sudah terbukti laku.`
            : " — banyak yang lihat, belum pesan. Feature yang sudah laku.") +
          " Sebagian klik mungkin dari influencer/share (pelacakan terpisah nanti).",
      );
    } else if (lang === "es") {
      parts.push(
        `${anomaly.itemName}: ${anomaly.clicks} clics pero ${anomaly.orders} pedidos pagados` +
          (top
            ? ` — miraron pero no compraron. Destaque ${top} (su vendedor probado).`
            : " — miraron pero no compraron. Destaque lo que ya se vende.") +
          " Algunos clics pueden ser de influencer/compartidos (seguimiento aparte después).",
      );
    } else {
      parts.push(
        `${anomaly.itemName} drew ${anomaly.clicks} clicks but ${anomaly.orders} paid orders` +
          (top
            ? ` — people looked, didn’t buy. Feature ${top} (your proven seller) instead.`
            : " — people looked, didn’t buy. Feature what already sells.") +
          " Some of those clicks may be influencer/share traffic (separate tracking later).",
      );
    }
  } else if (p.reputation.quotes[0]) {
    parts.push(
      lang === "id"
        ? `Catatan tamu: “${p.reputation.quotes[0].excerpt}”`
        : lang === "es"
          ? `Nota de un cliente: “${p.reputation.quotes[0].excerpt}”`
          : `A guest note: “${p.reputation.quotes[0].excerpt}”`,
    );
  }

  let idea = "";
  if (anomaly && p.topProducts[0]) {
    idea =
      lang === "id"
        ? `Untuk sementara jangan dorong ${anomaly.itemName} — post ${p.topProducts[0].name} sebelum jam puncak.`
        : lang === "es"
          ? `Deje de impulsar ${anomaly.itemName} por ahora — publique ${p.topProducts[0].name} antes de la hora pico.`
          : `Skip pushing ${anomaly.itemName} for now — post ${p.topProducts[0].name} before peak hour instead.`;
  } else if (p.topProducts[0] && p.peakHour != null) {
    idea =
      lang === "id"
        ? `Promosikan ${p.topProducts[0].name} dengan post 1–2 jam sebelum ${peakLabel(p.peakHour)}.`
        : lang === "es"
          ? `Promueva ${p.topProducts[0].name} con una publicación 1–2 h antes de ${peakLabel(p.peakHour)}.`
          : `Promote ${p.topProducts[0].name} with a post about 1–2 hours before ${peakLabel(p.peakHour)}.`;
  } else if (p.topProducts[0]) {
    idea =
      lang === "id"
        ? `Andalkan yang sudah laku — feature ${p.topProducts[0].name} di post hari ini.`
        : lang === "es"
          ? `Apoye lo que ya se vende — destaque ${p.topProducts[0].name} en la publicación de hoy.`
          : `Lean into what already sells — feature ${p.topProducts[0].name} in today’s post.`;
  } else {
    idea =
      lang === "id"
        ? "Cek inbox yang belum dijawab dulu, lalu jadwalkan satu post sebelum rush biasa."
        : lang === "es"
          ? "Revise primero el inbox sin responder, luego programe una publicación antes de su rush habitual."
          : "Review unanswered inbox items first, then schedule one post before your usual rush.";
  }

  const greeting =
    lang === "id"
      ? `Selamat pagi — laporan ${p.restaurantName} untuk ${p.reportDate}.`
      : lang === "es"
        ? `Buenos días — aquí está ${p.restaurantName} para ${p.reportDate}.`
        : `Good morning — here’s ${p.restaurantName} for ${p.reportDate}.`;

  return {
    greeting,
    body: parts.join("\n\n"),
    attention: buildAttentionLine(p.reputation, lang),
    ideaForToday: idea,
    source: "facts",
  };
}

function factsForAi(
  p: Omit<DailyReportPayload, "narrative" | "insights" | "disclaimer">,
): Record<string, unknown> {
  const lang = p.language || "en";
  return {
    restaurant_name: p.restaurantName,
    report_date: p.reportDate,
    weekday: weekdayName(p.reportDate, p.timeZone),
    time_zone: p.timeZone,
    language: lang,
    language_instruction:
      lang === "id"
        ? "Write greeting, narrative, idea_for_today, and insights entirely in Bahasa Indonesia. Keep item names and $ amounts as-is."
        : lang === "es"
          ? "Write greeting, narrative, idea_for_today, and insights entirely in Spanish. Keep item names and $ amounts as-is."
          : "Write greeting, narrative, idea_for_today, and insights in English.",
    square_available: p.squareAvailable,
    sales_yesterday: p.day
      ? {
          total_sales: dollars(p.day.totalSalesCents),
          orders: p.day.orderCount,
          customers: p.day.uniqueCustomers,
          avg_ticket: dollars(p.day.avgNetSalesCents),
          tips: dollars(p.day.tipsCents),
          tax: dollars(p.day.taxCents),
        }
      : null,
    vs_7day_avg: p.day && p.avg7d
      ? {
          total_sales_pct:
            p.avg7d.totalSalesCents > 0
              ? Math.round(
                  ((p.day.totalSalesCents - p.avg7d.totalSalesCents) /
                    p.avg7d.totalSalesCents) *
                    100,
                )
              : null,
          note: "Compare to 7-day average, not yesterday — weekday/weekend varies.",
        }
      : null,
    peak_hour_7d: p.peakHour,
    top_products_7d: p.topProducts.slice(0, 5).map((t) => ({
      name: t.name,
      qty: t.quantity,
      net: dollars(t.netSalesCents),
    })),
    orderly_online_attribution_subset: p.orderlyChannels.map((c) => ({
      src: c.src,
      orders: c.orders,
      dollars: dollars(c.totalCents),
    })),
    reputation: {
      buckets: p.reputation.buckets,
      questions_yesterday: p.reputation.buckets.question,
      unanswered_total: p.reputation.unanswered.length,
      unanswered_questions: p.reputation.unansweredQuestions,
      attention_line_use_exactly: buildAttentionLine(p.reputation, lang),
      urgent: p.reputation.urgent.map((u) => ({
        classification: u.classification,
        platform: u.platform,
        excerpt: u.excerpt,
      })),
      praise_quotes: p.reputation.quotes.map((q) => q.excerpt),
      unanswered: p.reputation.unanswered.map((u) => ({
        classification: u.classification,
        status: u.status,
        excerpt: u.excerpt,
      })),
    },
    qr_scans: {
      human: p.qrScans.human,
      bot: p.qrScans.bot,
      top_src: p.qrScans.bySrc.slice(0, 5),
    },
    social_posts: {
      ...p.socialPosts,
      click_anomalies: p.socialPosts.clickAnomalies,
    },
    note_influencer:
      "Some high-click src tags may include influencer/share traffic — do not claim all clicks are buyers. Separate influencer tracking comes later.",
    google_reviews: p.gbp,
    food_drink_note: p.foodDrinkNote,
    supply_reminder: p.supplyReminder || null,
    anti_double_count:
      "Square totals include all channels. Orderly channel dollars are a subset — never add them to Square.",
  };
}

async function alertDailyReportAiFailure(input: {
  tenantSlug: string;
  error?: string;
}): Promise<void> {
  const url = process.env.ORDERLY_ALERT_WEBHOOK_URL?.trim();
  const message = `[Orderly] Daily report AI unavailable for ${input.tenantSlug}: ${input.error || "unknown"} — using fact narrative`;
  logger.warn({ alert: "daily_report_ai_fail", ...input }, message);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        type: "daily_report_ai_fail",
        tenantSlug: input.tenantSlug,
        error: input.error,
      }),
    });
  } catch (err) {
    logger.error({ err }, "daily report AI alert webhook failed");
  }
}

async function generateNarrative(
  base: Omit<DailyReportPayload, "narrative" | "insights" | "disclaimer">,
): Promise<{ narrative: DailyReportNarrative; insights: string[] }> {
  const factInsights = buildFactInsights(base);
  const fallback = buildFactNarrative(base);
  const lang = base.language || "en";
  const attempt = async () =>
    aiRun({
      task: "daily_report",
      tenantId: base.tenantId,
      language: lang,
      input: { facts: factsForAi(base) },
      opts: { maxTokens: 900, temperature: 0.4, responseFormat: "json" },
    });

  let lastError: string | undefined;
  try {
    for (let i = 0; i < 2; i++) {
      const result = await attempt();
      if (result.ok && result.output && typeof result.output === "object") {
        const out = result.output as DailyReportLlmOutput;
        return {
          narrative: {
            greeting: out.greeting || fallback.greeting,
            body: out.narrative,
            attention: fallback.attention,
            ideaForToday: out.ideaForToday || fallback.ideaForToday,
            source: "ai",
          },
          insights: factInsights.length ? factInsights : out.insights,
        };
      }
      lastError = result.error || "ai_failed";
      logger.warn(
        { tenantSlug: base.tenantSlug, error: lastError, attempt: i + 1 },
        "daily report AI narrative attempt failed",
      );
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : "ai_threw";
    logger.warn({ err, tenantSlug: base.tenantSlug }, "daily report AI failed");
  }

  await alertDailyReportAiFailure({
    tenantSlug: base.tenantSlug,
    error: lastError,
  });
  return { narrative: fallback, insights: factInsights };
}

export async function assembleDailyReport(input: {
  tenantSlug: string;
  timeZone: string;
  /** Defaults to yesterday in tenant TZ. */
  reportDate?: string;
  /** en | id | es — UI chrome + AI narrative language. */
  language?: string;
}): Promise<DailyReportPayload | null> {
  const language = normalizeDailyReportLang(input.language);
  const ui = uiForLang(language);

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, input.tenantSlug))
    .limit(1);
  if (!tenant) {
    logger.warn({ slug: input.tenantSlug }, "daily report: tenant not found");
    return null;
  }

  const reportDate = input.reportDate ?? localYesterday(input.timeZone);

  const [salesRes, productsRes, hoursRes, supplyMixRes] = await Promise.all([
    fetchSquareDailySales(input.tenantSlug),
    fetchSquareTopProducts(input.tenantSlug, 10),
    fetchSquareBusyHours(input.tenantSlug),
    fetchSquareProductMixForSupply(input.tenantSlug),
  ]);

  let squareAvailable = salesRes.ok;
  let squareError: string | undefined;
  if (!salesRes.ok) {
    squareError = salesRes.error;
    squareAvailable = false;
  }

  const trend7d = salesRes.ok ? parseDailySalesRows(salesRes.data) : [];
  const day =
    trend7d.find((d) => d.date === reportDate) ??
    trend7d[trend7d.length - 1] ??
    null;

  let avg7d: DailyReportPayload["avg7d"] = null;
  if (trend7d.length) {
    const n = trend7d.length;
    avg7d = {
      totalSalesCents: Math.round(
        trend7d.reduce((s, d) => s + d.totalSalesCents, 0) / n,
      ),
      orderCount: Math.round(
        trend7d.reduce((s, d) => s + d.orderCount, 0) / n,
      ),
      uniqueCustomers: Math.round(
        trend7d.reduce((s, d) => s + d.uniqueCustomers, 0) / n,
      ),
      avgNetSalesCents: Math.round(
        trend7d.reduce((s, d) => s + d.avgNetSalesCents, 0) / n,
      ),
    };
  }

  const topProducts = productsRes.ok
    ? parseTopProductRows(productsRes.data).slice(0, 5)
    : [];
  const busyHours = hoursRes.ok ? parseBusyHourRows(hoursRes.data) : [];
  let peakHour: number | null = null;
  if (busyHours.length) {
    peakHour = busyHours.reduce((best, h) =>
      h.orderCount > best.orderCount ? h : best,
    ).hour;
  }

  const supplyProducts = supplyMixRes.ok
    ? parseTopProductRows(supplyMixRes.data)
    : productsRes.ok
      ? parseTopProductRows(productsRes.data)
      : [];
  const supplyUsage = buildSupplyUsageFromProducts(supplyProducts);
  const supplyReminder = formatSupplyReminderI18n(supplyUsage, language);

  // Fresh closed-loop metrics before reading social_posts (cron previously used stale columns).
  try {
    await refreshSocialPostMetrics(tenant.id);
  } catch (err) {
    logger.warn({ err, tenantId: tenant.id }, "daily report: social metrics refresh failed");
  }

  const windowStart = (() => {
    const [y, m, d] = reportDate.split("-").map(Number);
    const utc = Date.UTC(y, m - 1, d, 12, 0, 0) - 6 * 24 * 60 * 60 * 1000;
    const dt = new Date(utc);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  })();
  const squareWindow = {
    startDate: windowStart,
    endDate: reportDate,
    label: `${windowStart} → ${reportDate}`,
  };

  const [orderlyChannels, reputation, qrScans, socialPosts, gbp, gsc] =
    await Promise.all([
      fetchOrderlyChannelAttribution({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlyReputation({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlyQrScans({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlySocialPosts({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchOrderlyGbpDay({
        tenantId: tenant.id,
        localDate: reportDate,
        timeZone: input.timeZone,
      }),
      fetchGscDailyReportSlice({
        tenantId: tenant.id,
        siteUrl: tenant.domain
          ? `https://${tenant.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/`
          : "https://samurairesto.com/",
        reportDate,
      }),
    ]);

  const base = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    restaurantName: tenant.name,
    reportDate,
    timeZone: input.timeZone,
    language,
    squareAvailable,
    squareError,
    day,
    avg7d,
    trend7d,
    topProducts,
    busyHours,
    peakHour,
    squareWindow,
    orderlyChannels,
    gsc,
    reputation,
    qrScans,
    socialPosts,
    gbp,
    foodDrinkNote: ui.foodDrinkNote,
    supplyUsage,
    supplyReminder,
  };

  const { narrative, insights } = await generateNarrative(base);

  return {
    ...base,
    narrative,
    insights,
    disclaimer: ui.disclaimer,
  };
}
