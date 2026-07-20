import {
  buildBioSrcSlug,
  buildCalendarSrcSlug,
  buildPageCtaSrcSlug,
  captionHasBannedClaim,
  ClaimRecheckError,
  isEvergreenSurfaceSrc,
  maxHookWordsForPlatform,
  platformSrcPrefix,
  suggestTimeBeforePeak,
  wordCount,
} from "../../src/lib/contentCalendar";
import {
  itemNameInTopProducts,
  matchMenuItem,
  matchMenuItemFromText,
  textHasRankingClaim,
} from "../../src/lib/contentCalendarMatch";
import {
  filterPastPerformanceForContentEngine,
  isInAttributionIncompleteWindow,
  isPreWebviewFacebookPerformance,
} from "../../src/lib/dailyReportDataQuality";
import { parseContentCalendarOutput } from "../../src/lib/ai/guardrails";

const CONFUSABLE_MENU = [
  { id: "1", sku: "HC-SCALLOP", name: "Hibachi Chicken & Scallop" },
  { id: "2", sku: "HS-CHICKEN", name: "Hibachi Steak & Chicken" },
  { id: "3", sku: "HC", name: "Hibachi Chicken" },
  { id: "4", sku: "CRAB-BENTO", name: "Crab Meat Bento" },
  { id: "5", sku: "CHICKEN-BENTO", name: "Chicken Bento" },
];

describe("content calendar helpers", () => {
  test("src slug is platform-item-date", () => {
    expect(
      buildCalendarSrcSlug({
        platform: "facebook",
        itemName: "Hibachi Chicken",
        scheduledDate: "2026-08-01",
        pillar: "hero_product",
      }),
    ).toBe("fb-hibachichicken-20260801");
  });

  test("instagram prefix", () => {
    expect(platformSrcPrefix("instagram")).toBe("ig");
  });

  test("tiktok campaign src + bio src", () => {
    expect(platformSrcPrefix("tiktok")).toBe("tiktok");
    expect(
      buildCalendarSrcSlug({
        platform: "tiktok",
        itemName: "Shrimp Bento",
        scheduledDate: "2026-08-01",
        pillar: "hero_product",
      }),
    ).toBe("tiktok-shrimpbento-20260801");
    expect(buildBioSrcSlug("tiktok")).toBe("tiktok-bio");
    expect(buildBioSrcSlug("instagram")).toBe("ig-bio");
    expect(maxHookWordsForPlatform("tiktok")).toBe(5);
    expect(maxHookWordsForPlatform("facebook")).toBe(8);
  });

  test("Page CTA evergreen src is undated; historical dated slug still recognized", () => {
    expect(buildPageCtaSrcSlug()).toBe("fb-page-cta");
    expect(isEvergreenSurfaceSrc("fb-page-cta")).toBe(true);
    expect(isEvergreenSurfaceSrc("fb-page-cta-20260718")).toBe(true);
    expect(isEvergreenSurfaceSrc("fb-about-20260718")).toBe(true);
    expect(isEvergreenSurfaceSrc("ig-bio")).toBe(true);
    expect(isEvergreenSurfaceSrc("fb-hibachichicken-20260718")).toBe(false);
    expect(isEvergreenSurfaceSrc("facebook_organic_fbclid")).toBe(false);
  });

  test("suggest time before peak", () => {
    expect(suggestTimeBeforePeak(18, 105)).toBe("16:15:00");
  });

  test("hook word limit helper", () => {
    expect(wordCount("Hot hibachi tonight")).toBe(3);
  });

  test("banned claims", () => {
    expect(captionHasBannedClaim("Best sushi in Indiana")).toBe(true);
    expect(captionHasBannedClaim("Hibachi Chicken ready for pickup")).toBe(
      false,
    );
  });

  test("Content Engine past_performance excludes until PR #96 timestamp (not end of Jul 20)", () => {
    expect(isInAttributionIncompleteWindow("2026-07-16T20:00:00.000Z")).toBe(
      true,
    );
    expect(isInAttributionIncompleteWindow("2026-07-18")).toBe(true);
    expect(isInAttributionIncompleteWindow("2026-07-19")).toBe(true);
    // Date-only Jul 20 → start of day UTC → still incomplete (conservative).
    expect(isInAttributionIncompleteWindow("2026-07-20")).toBe(true);
    // After PR #96 merge instant — clean (Ron Morris-era / post-chip-fix).
    expect(
      isInAttributionIncompleteWindow("2026-07-20T06:17:38.000Z"),
    ).toBe(false);
    expect(
      isInAttributionIncompleteWindow("2026-07-20T15:35:09.000Z"),
    ).toBe(false);
    expect(isInAttributionIncompleteWindow("2026-07-21")).toBe(false);
    const filtered = filterPastPerformanceForContentEngine([
      {
        src: "fb-shrimpbento-20260716",
        clicks: 33,
        orders: 0,
        postedAt: "2026-07-16T18:00:00.000Z",
      },
      {
        src: "fb-hibachi-20260717",
        clicks: 37,
        orders: 0,
        postedAt: "2026-07-17",
      },
      {
        src: "fb-chip-era-20260719",
        clicks: 52,
        orders: 0,
        postedAt: "2026-07-19T12:00:00.000Z",
      },
      {
        src: "fb-page-cta-20260718",
        clicks: 1,
        orders: 1,
        postedAt: "2026-07-20T15:35:09.000Z",
      },
      {
        src: "fb-ok-20260721",
        clicks: 5,
        orders: 2,
        postedAt: "2026-07-21T12:00:00.000Z",
      },
    ]);
    expect(filtered.map((r) => r.src)).toEqual([
      "fb-page-cta-20260718",
      "fb-ok-20260721",
    ]);
  });

  test("Content Engine excludes pre-WebView Facebook campaigns (before PR #86)", () => {
    expect(
      isPreWebviewFacebookPerformance({
        src: "fb-crabmeatbento-20260714",
        postedAt: "2026-07-14",
      }),
    ).toBe(true);
    expect(
      isPreWebviewFacebookPerformance({
        src: "fb-beefbento",
        postedAt: "2026-07-15T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isPreWebviewFacebookPerformance({
        src: "fb-chip-era-20260719",
        postedAt: "2026-07-19",
      }),
    ).toBe(true);
    expect(
      isPreWebviewFacebookPerformance({
        src: "fb-page-cta-20260718",
        postedAt: "2026-07-20T15:35:09.000Z",
      }),
    ).toBe(false);
    expect(
      isPreWebviewFacebookPerformance({
        src: "fb-ok-20260721",
        postedAt: "2026-07-21",
      }),
    ).toBe(false);
    expect(
      isPreWebviewFacebookPerformance({
        src: "ig-bio",
        postedAt: "2026-07-14",
      }),
    ).toBe(false);
    const filtered = filterPastPerformanceForContentEngine([
      {
        src: "fb-crabmeatbento-20260714",
        clicks: 10,
        orders: 0,
        postedAt: "2026-07-14",
      },
      {
        src: "fb-steakbento-20260715",
        clicks: 8,
        orders: 0,
        postedAt: "2026-07-15",
        platform: "facebook",
      },
      {
        src: "ig-summer-20260715",
        clicks: 3,
        orders: 1,
        postedAt: "2026-07-15",
      },
      {
        src: "fb-rainbowroll-20260719",
        clicks: 4,
        orders: 1,
        postedAt: "2026-07-19",
      },
      {
        src: "fb-ok-20260721",
        clicks: 4,
        orders: 1,
        postedAt: "2026-07-21",
      },
    ]);
    expect(filtered.map((r) => r.src).sort()).toEqual([
      "fb-ok-20260721",
      "ig-summer-20260715",
    ]);
  });

  test("matchMenuItem prefers sku/id over confusable names", () => {
    expect(matchMenuItem("HC-SCALLOP", CONFUSABLE_MENU)?.name).toBe(
      "Hibachi Chicken & Scallop",
    );
    expect(matchMenuItem("3", CONFUSABLE_MENU)?.name).toBe("Hibachi Chicken");
    expect(matchMenuItem("Hibachi Chicken", CONFUSABLE_MENU)?.name).toBe(
      "Hibachi Chicken",
    );
    expect(matchMenuItem("Chicken Bento", CONFUSABLE_MENU)?.name).toBe(
      "Chicken Bento",
    );
    expect(
      matchMenuItemFromText(
        "Tonight: Hibachi Chicken & Scallop — order ahead",
        CONFUSABLE_MENU,
      )?.sku,
    ).toBe("HC-SCALLOP");
  });

  test("ranking claim helpers", () => {
    expect(textHasRankingClaim("Our most-ordered hibachi")).toBe(true);
    expect(textHasRankingClaim("Hibachi ready for pickup")).toBe(false);
    expect(
      itemNameInTopProducts("Hibachi Chicken", [
        { name: "Shrimp Bento" },
        { name: "Hibachi Chicken" },
      ]),
    ).toBe(true);
    expect(
      itemNameInTopProducts("Crab Meat Bento", [
        { name: "Chicken Bento" },
        { name: "Shrimp Bento" },
      ]),
    ).toBe(false);
    const err = new ClaimRecheckError(
      "square_unavailable",
      "Can't verify the ranking claim",
    );
    expect(err.code).toBe("square_unavailable");
    expect(err).toBeInstanceOf(Error);
  });

  test("parse content calendar JSON", () => {
    const raw = JSON.stringify({
      posts: [
        {
          date: "2026-08-05",
          suggested_time: "16:30",
          pillar: "hero_product",
          target_item_name: "Hibachi Chicken",
          hook: "Hibachi night",
          caption: "Hibachi Chicken is calling — order ahead.",
          hashtags: ["Martinsville"],
          cta_type: "order_online",
          platform: "facebook",
          photo_needed: false,
        },
        {
          date: "2026-08-06",
          pillar: "hero_product",
          hook: "Best food ever",
          caption: "#1 rated in town",
          hashtags: [],
          cta_type: "order_online",
        },
      ],
    });
    const parsed = parseContentCalendarOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.posts).toHaveLength(1);
    expect(parsed!.posts[0]!.hook).toBe("Hibachi night");
  });
});
