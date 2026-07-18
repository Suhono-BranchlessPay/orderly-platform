import {
  buildCalendarSrcSlug,
  captionHasBannedClaim,
  platformSrcPrefix,
  suggestTimeBeforePeak,
  wordCount,
} from "../../src/lib/contentCalendar";
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
