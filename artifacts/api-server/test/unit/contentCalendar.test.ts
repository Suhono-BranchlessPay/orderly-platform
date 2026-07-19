import {
  buildBioSrcSlug,
  buildCalendarSrcSlug,
  captionHasBannedClaim,
  maxHookWordsForPlatform,
  platformSrcPrefix,
  suggestTimeBeforePeak,
  wordCount,
} from "../../src/lib/contentCalendar";
import {
  filterPastPerformanceForContentEngine,
  isInAttributionIncompleteWindow,
} from "../../src/lib/dailyReportDataQuality";
import { parseContentCalendarOutput } from "../../src/lib/ai/guardrails";

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

  test("Content Engine past_performance excludes Jul 16–18 DQ window", () => {
    expect(isInAttributionIncompleteWindow("2026-07-16T20:00:00.000Z")).toBe(
      true,
    );
    expect(isInAttributionIncompleteWindow("2026-07-18")).toBe(true);
    expect(isInAttributionIncompleteWindow("2026-07-19")).toBe(false);
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
        src: "fb-ok-20260719",
        clicks: 5,
        orders: 2,
        postedAt: "2026-07-19T12:00:00.000Z",
      },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.src).toBe("fb-ok-20260719");
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
