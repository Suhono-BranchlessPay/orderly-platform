import { parseDailyReportTenants } from "../../src/lib/dailyReportRun";
import {
  moneyToCents,
  parseBusyHourRows,
  parseDailySalesRows,
  parseTopProductRows,
} from "../../src/lib/squareReporting";
import { renderDailyReportHtml } from "../../src/lib/dailyReportHtml";
import {
  buildAttentionLine,
  buildFactInsights,
  type DailyReportPayload,
} from "../../src/lib/dailyReportAssemble";
import {
  buildSupplyUsageFromProducts,
  classifySupplyItem,
} from "../../src/lib/dailyReportSupply";
import {
  formatSupplyReminderI18n,
  normalizeDailyReportLang,
  uiForLang,
} from "../../src/lib/dailyReportI18n";
import { pickRotatedPraiseQuotes } from "../../src/lib/dailyReportOrderly";
import { parseDailyReportOutput } from "../../src/lib/ai/guardrails";

function emptyExtras(): Pick<
  DailyReportPayload,
  | "qrScans"
  | "socialPosts"
  | "contentCalendar"
  | "gbp"
  | "gsc"
  | "foodDrinkNote"
  | "supplyUsage"
  | "supplyReminder"
  | "narrative"
  | "squareWindow"
  | "dataQualityFlags"
> {
  return {
    qrScans: { total: 0, human: 0, bot: 0, hiddenTestSrcRows: 0, bySrc: [] },
    dataQualityFlags: [],
    socialPosts: {
      drafted: 0,
      pendingApproval: 0,
      posted: 0,
      highlights: [],
      clickAnomalies: [],
    },
    contentCalendar: {
      draft: 0,
      approved: 0,
      postedInWindow: 0,
      highlights: [],
      lookbackDays: 14,
    },
    gbp: {
      available: false,
      note: "No Google reviews/Q&A in range (sync may be quota-limited).",
      reviews: 0,
      questions: 0,
      unanswered: 0,
      quotes: [],
    },
    gsc: {
      connected: false,
      siteUrl: null,
      window: null,
      status: "not_connected",
      note: "Google Search Console not connected for this restaurant yet.",
      topQueries: [],
      opportunities: [],
      movers: [],
      mapPackNote:
        "Map Pack rankings need Google Business Profile API access (still blocked on quota/allow-list). Coming after GBP access — not shown as empty columns.",
    },
    foodDrinkNote:
      "Food vs drink breakdown needs Square menu categories (most items are Uncategorized today).",
    supplyUsage: [],
    supplyReminder: "",
    squareWindow: {
      startDate: "2026-07-10",
      endDate: "2026-07-16",
      label: "2026-07-10 → 2026-07-16 (America/New_York)",
    },
    narrative: {
      greeting: "Good morning — here’s your report.",
      body: "Yesterday was a quieter day vs your 7-day average — often normal midweek.",
      attention: "",
      ideaForToday: "Promote your top seller before peak hour.",
      source: "facts",
    },
  };
}

describe("daily report Phase 1 / narrative v2", () => {
  const prevTenants = process.env.DAILY_REPORT_TENANTS;
  const prevTo = process.env.DAILY_REPORT_TO;

  afterEach(() => {
    if (prevTenants === undefined) delete process.env.DAILY_REPORT_TENANTS;
    else process.env.DAILY_REPORT_TENANTS = prevTenants;
    if (prevTo === undefined) delete process.env.DAILY_REPORT_TO;
    else process.env.DAILY_REPORT_TO = prevTo;
  });

  test("moneyToCents parses Square dollar strings", () => {
    expect(moneyToCents("12.5")).toBe(1250);
    expect(moneyToCents(10)).toBe(1000);
  });

  test("parseDailyReportTenants supports IANA zones with = separator", () => {
    process.env.DAILY_REPORT_TENANTS =
      "samurai=America/Indiana/Indianapolis=a@x.com,b@x.com";
    const t = parseDailyReportTenants();
    expect(t).toHaveLength(1);
    expect(t[0].slug).toBe("samurai");
    expect(t[0].timeZone).toBe("America/Indiana/Indianapolis");
    expect(t[0].to).toEqual(["a@x.com", "b@x.com"]);
  });

  test("parseDailySalesRows maps Square columns", () => {
    const rows = parseDailySalesRows([
      {
        "Sales.local_date": "2026-07-16",
        "Sales.total_sales_amount": "100.00",
        "Sales.net_sales": "90.00",
        "Sales.order_count": "5",
        "Sales.avg_net_sales": "18.00",
        "Sales.tips_amount": "10.00",
        "Sales.sales_tax_amount": "7.00",
        "Sales.unique_customers": "4",
      },
    ]);
    expect(rows[0].date).toBe("2026-07-16");
    expect(rows[0].totalSalesCents).toBe(10000);
    expect(rows[0].orderCount).toBe(5);
  });

  test("parseTopProductRows accepts ProductMix or ItemSales", () => {
    const a = parseTopProductRows([
      {
        "ProductMixReport.item_name": "Hibachi Chicken",
        "ProductMixReport.items_sold_quantity": "12",
        "ProductMixReport.net_sales": "1664",
      },
    ]);
    expect(a[0].name).toBe("Hibachi Chicken");
    expect(a[0].netSalesCents).toBe(166400);

    const b = parseTopProductRows([
      {
        "ItemSales.item_name": "OMG Roll",
        "ItemSales.items_sold_quantity": "3",
        "ItemSales.net_sales": "45.5",
      },
    ]);
    expect(b[0].name).toBe("OMG Roll");
    expect(b[0].netSalesCents).toBe(4550);
  });

  test("parseBusyHourRows finds peak hour data", () => {
    const hours = parseBusyHourRows([
      {
        "Sales.local_hour": "17",
        "Sales.order_count": "3",
        "Sales.total_sales_amount": "100",
      },
      {
        "Sales.local_hour": "18",
        "Sales.order_count": "9",
        "Sales.total_sales_amount": "400",
      },
    ]);
    expect(hours[1].hour).toBe(18);
    expect(hours[1].orderCount).toBe(9);
  });

  test("supply Level-1 maps drinks/bento/hibachi and skips modifiers", () => {
    expect(classifySupplyItem("Soda")?.supplyType).toBe("gelas_minuman");
    expect(classifySupplyItem("Japanese Soda")?.supplyType).toBe("gelas_minuman");
    expect(classifySupplyItem("Bottle Water")?.supplyType).toBe("botol_air");
    expect(classifySupplyItem("Chicken Bento")?.supplyType).toBe("box_bento");
    expect(classifySupplyItem("Hibachi Chicken")?.supplyType).toBe("porsi_hibachi");
    expect(classifySupplyItem("Crab Rangoon")?.supplyType).toBe("wadah_appetizer");
    expect(classifySupplyItem("Change Noodle Instead Of Rice")).toBeNull();

    const usage = buildSupplyUsageFromProducts([
      { name: "Soda", quantity: 205 },
      { name: "Japanese Soda", quantity: 32 },
      { name: "Bottle Water", quantity: 23 },
      { name: "Chicken Bento", quantity: 49 },
      { name: "Steak Bento", quantity: 30 },
      { name: "Hibachi Chicken", quantity: 146 },
      { name: "Crab Rangoon", quantity: 110 },
      { name: "Change Noodle Instead Of Rice", quantity: 40 },
    ]);
    const cups = usage.find((u) => u.supplyType === "gelas_minuman");
    const bento = usage.find((u) => u.supplyType === "box_bento");
    expect(cups?.quantity).toBe(237);
    expect(bento?.quantity).toBe(79);
    const line = formatSupplyReminderI18n(usage, "en");
    expect(line).toContain("~237 drink cups");
    expect(line).toContain("Check supply stock");
    expect(line).not.toContain("days");
    expect(formatSupplyReminderI18n(usage, "id")).toContain("gelas minuman");
    expect(formatSupplyReminderI18n(usage, "es")).toContain("vasos de bebida");
  });

  test("normalizeDailyReportLang + UI labels", () => {
    expect(normalizeDailyReportLang("indonesia")).toBe("id");
    expect(normalizeDailyReportLang("español")).toBe("es");
    expect(uiForLang("id").salesYesterday).toContain("Penjualan");
    expect(uiForLang("es").needsAttention).toContain("ATENCIÓN");
  });

  test("parseDailyReportOutput requires narrative", () => {
    const ok = parseDailyReportOutput(
      JSON.stringify({
        greeting: "Hi",
        narrative: "Sales were solid.",
        attention: "",
        idea_for_today: "Post Hibachi before 6pm.",
        insights: ["Peak at 6pm"],
      }),
    );
    expect(ok?.ideaForToday).toContain("Hibachi");
    expect(parseDailyReportOutput("{}")).toBeNull();
  });

  test("HTML never invents Square totals when unavailable; shows narrative + attribution disclaimer", () => {
    const payload: DailyReportPayload = {
      tenantId: "t1",
      tenantSlug: "samurai",
      restaurantName: "Samurai Martinsville",
      reportDate: "2026-07-16",
      timeZone: "America/Indiana/Indianapolis",
      language: "en",
      squareAvailable: false,
      squareError: "Square reporting 403",
      day: null,
      avg7d: null,
      trend7d: [],
      topProducts: [],
      busyHours: [],
      peakHour: null,
      orderlyChannels: [{ src: "google", orders: 2, totalCents: 6251 }],
      reputation: {
        buckets: {
          praise: 1,
          question: 0,
          complaint: 0,
          allergy_health: 0,
          menu_suggestion: 0,
          other: 0,
        },
        quotes: [],
        urgent: [],
        unanswered: [],
        unansweredQuestions: 0,
      },
      ...emptyExtras(),
      insights: ["Fact-only insight"],
      disclaimer:
        "Totals = Square (all channels). Online channel $ = Orderly attribution only — never added to Square. Narrative & insights use actual data only; no forecasts. Supply reminder = usage from sales (Level 1), not inventory prediction.",
    };
    const html = renderDailyReportHtml(payload);
    expect(html).toContain("Square data unavailable");
    expect(html).toContain("do not add these dollars");
    expect(html).toContain("$62.51");
    expect(html).not.toContain("blockchain");
    expect(html).toContain("Verified");
    expect(html).toContain("Sales yesterday (all channels)");
    expect(html).toContain("MANAGER NOTE");
    expect(html).toContain("ONE IDEA FOR TODAY");
    // Numbers first: sales heading appears before manager note.
    expect(html.indexOf("Sales yesterday")).toBeLessThan(html.indexOf("MANAGER NOTE"));
  });

  test("HTML shows supply reminder and unanswered highlight", () => {
    const payload: DailyReportPayload = {
      tenantId: "t1",
      tenantSlug: "demo",
      restaurantName: "Demo Resto",
      reportDate: "2026-07-16",
      timeZone: "America/Indiana/Indianapolis",
      language: "en",
      squareAvailable: true,
      day: {
        date: "2026-07-16",
        totalSalesCents: 169201,
        netSalesCents: 150000,
        orderCount: 49,
        avgNetSalesCents: 3061,
        tipsCents: 12000,
        taxCents: 8000,
        uniqueCustomers: 40,
      },
      avg7d: {
        totalSalesCents: 190000,
        orderCount: 55,
        uniqueCustomers: 45,
        avgNetSalesCents: 3400,
      },
      trend7d: [],
      topProducts: [
        { name: "Hibachi Chicken", quantity: 12, netSalesCents: 166400 },
      ],
      busyHours: [{ hour: 18, totalSalesCents: 40000, orderCount: 9 }],
      peakHour: 18,
      orderlyChannels: [],
      reputation: {
        buckets: {
          praise: 0,
          question: 6,
          complaint: 0,
          allergy_health: 0,
          menu_suggestion: 0,
          other: 0,
        },
        quotes: [],
        urgent: [],
        unanswered: [
          {
            classification: "question",
            excerpt: "Do you have gluten free?",
            platform: "facebook",
            status: "new",
          },
          {
            classification: "question",
            excerpt: "Hours?",
            platform: "facebook",
            status: "drafted",
          },
          {
            classification: "question",
            excerpt: "Parking?",
            platform: "instagram",
            status: "new",
          },
          {
            classification: "praise",
            excerpt: "Great!",
            platform: "facebook",
            status: "new",
          },
        ],
        unansweredQuestions: 3,
      },
      ...emptyExtras(),
      socialPosts: {
        drafted: 0,
        pendingApproval: 0,
        posted: 1,
        highlights: [],
        clickAnomalies: [
          {
            itemName: "Shrimp Bento",
            platform: "facebook",
            srcTag: "fb-shrimpbento-20260715",
            clicks: 30,
            orders: 0,
            ordersPromotedItem: 0,
            revenueCents: 0,
          },
        ],
      },
      supplyReminder:
        "Used this week (from sales): ~237 drink cups, ~121 bento boxes. Check supply stock before you run out.",
      supplyUsage: [
        {
          supplyType: "gelas_minuman",
          label: "drink cups",
          quantity: 237,
          contributingItems: [],
        },
      ],
      narrative: {
        greeting: "Good morning — here’s Demo Resto for 2026-07-16.",
        body: "Yesterday you rang $1,692.01 across 49 orders.",
        attention: "6 questions yesterday · 4 still unanswered (3 of them questions).",
        ideaForToday: "Promote Hibachi Chicken before 6 PM.",
        source: "ai",
      },
      insights: ["Peak around 6 PM"],
      disclaimer: "Totals = Square (all channels).",
    };
    const html = renderDailyReportHtml(payload);
    expect(html).toContain("NEEDS ATTENTION");
    expect(html).toContain("6 questions yesterday · 4 still unanswered");
    expect(html).toContain("Questions 6 (4 unanswered)");
    expect(html).toContain("CLICK → ORDER GAP");
    expect(html).toContain("30 clicks → 0 orders (any item via link)");
    expect(html).toContain("SUPPLY REMINDER");
    expect(html).toContain("~237 drink cups");
    expect(html).toContain("Narrative by AI Gateway");
    expect(html).toContain("Tips $120.00");
  });

  test("buildAttentionLine aligns questions with unanswered", () => {
    const line = buildAttentionLine({
      buckets: {
        praise: 5,
        question: 6,
        complaint: 0,
        allergy_health: 0,
        menu_suggestion: 0,
        other: 0,
      },
      quotes: [],
      urgent: [],
      unanswered: [
        { classification: "question", excerpt: "a", platform: "fb", status: "new" },
        { classification: "question", excerpt: "b", platform: "fb", status: "new" },
        { classification: "question", excerpt: "c", platform: "fb", status: "new" },
        { classification: "praise", excerpt: "d", platform: "fb", status: "new" },
      ],
      unansweredQuestions: 3,
    });
    expect(line).toContain("6 questions yesterday · 4 still unanswered");
    expect(line).toContain("3 of them questions");
  });

  test("click anomaly becomes top fact insight", () => {
    const insights = buildFactInsights({
      language: "en",
      topProducts: [
        { name: "Hibachi Chicken", quantity: 146, netSalesCents: 167556 },
      ],
      peakHour: 18,
      day: null,
      avg7d: null,
      orderlyChannels: [],
      supplyReminder: "",
      restaurantName: "Demo",
      reportDate: "2026-07-20",
      timeZone: "America/Indiana/Indianapolis",
      dataQualityFlags: [],
      socialPosts: {
        drafted: 0,
        pendingApproval: 0,
        posted: 1,
        highlights: [],
        clickAnomalies: [
          {
            itemName: "Shrimp Bento",
            platform: "facebook",
            srcTag: "fb-shrimpbento",
            clicks: 30,
            orders: 0,
            ordersPromotedItem: 0,
            revenueCents: 0,
          },
        ],
      },
    });
    expect(insights[0]).toContain("Shrimp Bento");
    expect(insights[0]).toContain("30 clicks → 0 paid orders");
    expect(insights[0]).toContain("promoted item: 0");
    expect(insights[0]).toContain("Hibachi Chicken");

    const idInsights = buildFactInsights({
      language: "id",
      topProducts: [
        { name: "Hibachi Chicken", quantity: 146, netSalesCents: 167556 },
      ],
      peakHour: 18,
      day: null,
      avg7d: null,
      orderlyChannels: [],
      supplyReminder: "",
      restaurantName: "Demo",
      reportDate: "2026-07-20",
      timeZone: "America/Indiana/Indianapolis",
      dataQualityFlags: [],
      socialPosts: {
        drafted: 0,
        pendingApproval: 0,
        posted: 1,
        highlights: [],
        clickAnomalies: [
          {
            itemName: "Shrimp Bento",
            platform: "facebook",
            srcTag: "fb-shrimpbento",
            clicks: 30,
            orders: 0,
            ordersPromotedItem: 0,
            revenueCents: 0,
          },
        ],
      },
    });
    expect(idInsights[0]).toContain("klik");
    expect(idInsights[0]).toContain("item yang dipromosikan: 0");
    expect(idInsights[0]).toContain("Hibachi Chicken");
  });

  test("Jul 16–20 attribution DQ flag leads insights and softens click gap", () => {
    const insights = buildFactInsights({
      language: "en",
      topProducts: [
        { name: "Hibachi Chicken", quantity: 146, netSalesCents: 167556 },
      ],
      peakHour: 18,
      day: null,
      avg7d: null,
      orderlyChannels: [],
      supplyReminder: "",
      restaurantName: "Demo",
      reportDate: "2026-07-17",
      timeZone: "America/Indiana/Indianapolis",
      socialPosts: {
        drafted: 0,
        pendingApproval: 0,
        posted: 1,
        highlights: [],
        clickAnomalies: [
          {
            itemName: "Hibachi Chicken",
            platform: "facebook",
            srcTag: "fb-hibachi",
            clicks: 27,
            orders: 0,
            ordersPromotedItem: 0,
            revenueCents: 0,
          },
        ],
      },
    });
    expect(insights[0]).toMatch(/Attribution data quality incomplete/i);
    expect(insights[0]).toMatch(/PR #96/i);
    expect(insights[0]).toMatch(/Do not conclude the campaign failed/i);
    // Second DQ flag: WebView + category-chip until PR #96 timestamp (CE learning).
    expect(insights[1]).toMatch(/WebView checkout was broken until PR #86/i);
    expect(insights[1]).toMatch(/PR #96/i);
    expect(insights[1]).toMatch(/2026-07-20T06:17:38Z/i);
    expect(insights[2]).toMatch(/starts from zero on Facebook/i);
    expect(insights[2]).toMatch(/never measured fairly/i);
    expect(insights[3]).toMatch(/Reputation counts before Jul 20 are undercounts/i);
    expect(insights[4]).toContain("Hibachi Chicken");
    expect(insights[4]).toMatch(/Do not conclude campaign failure/i);
    expect(insights[4]).not.toContain("try featuring");
  });

  test("Indonesian HTML labels render", () => {
    const payload: DailyReportPayload = {
      tenantId: "t1",
      tenantSlug: "samurai",
      restaurantName: "Samurai",
      reportDate: "2026-07-16",
      timeZone: "America/Indiana/Indianapolis",
      language: "id",
      squareAvailable: true,
      day: {
        date: "2026-07-16",
        totalSalesCents: 10000,
        netSalesCents: 9000,
        orderCount: 5,
        avgNetSalesCents: 1800,
        tipsCents: 100,
        taxCents: 70,
        uniqueCustomers: 4,
      },
      avg7d: null,
      trend7d: [],
      topProducts: [],
      busyHours: [],
      peakHour: null,
      orderlyChannels: [],
      reputation: {
        buckets: {
          praise: 0,
          question: 0,
          complaint: 0,
          allergy_health: 0,
          menu_suggestion: 0,
          other: 0,
        },
        quotes: [],
        urgent: [],
        unanswered: [],
        unansweredQuestions: 0,
      },
      ...emptyExtras(),
      language: "id",
      narrative: {
        greeting: "Selamat pagi",
        body: "Kemarin omzet solid.",
        attention: "",
        ideaForToday: "Promosikan Hibachi Chicken.",
        source: "facts",
      },
      insights: ["Jam tersibuk sekitar 6 PM"],
      disclaimer: "Total = Square",
    };
    // emptyExtras overwrites language narrative — force id again after spread
    payload.language = "id";
    payload.narrative = {
      greeting: "Selamat pagi",
      body: "Kemarin omzet solid.",
      attention: "",
      ideaForToday: "Promosikan Hibachi Chicken.",
      source: "facts",
    };
    const html = renderDailyReportHtml(payload);
    expect(html).toContain("Penjualan kemarin");
    expect(html).toContain("Terverifikasi");
    expect(html).toContain("CATATAN MANAJER");
    expect(html).toContain("lang=\"id\"");
  });

  test("praise quote rotation dedupes and reduces count", () => {
    const pool = [
      { classification: "praise", excerpt: "Loved it!", platform: "fb" },
      { classification: "praise", excerpt: "Loved it!", platform: "ig" },
      { classification: "praise", excerpt: "Delicious bento", platform: "fb" },
      { classification: "praise", excerpt: "Favorite!", platform: "fb" },
    ];
    const a = pickRotatedPraiseQuotes(pool, "2026-07-16", 2);
    const b = pickRotatedPraiseQuotes(pool, "2026-07-17", 2);
    expect(a.length).toBeLessThanOrEqual(2);
    expect(new Set(a.map((q) => q.excerpt.toLowerCase())).size).toBe(a.length);
    // Different days should often rotate start (not required equal, but pool allows shift).
    expect(pickRotatedPraiseQuotes(pool.slice(0, 1), "2026-07-16", 2)).toHaveLength(1);
    expect(a.length + b.length).toBeGreaterThan(0);
  });
});
