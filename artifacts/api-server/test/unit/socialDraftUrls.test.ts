import {
  ensureTrackedLinkInDraft,
  replaceBareStorefrontUrls,
} from "../../src/lib/social";

const tracked =
  "https://samurairesto.com/r/samurai?src=social-reply-20260718";

describe("bare storefront URL rewrite", () => {
  test("replaces naked domain with tracked link", () => {
    const out = replaceBareStorefrontUrls(
      "Order here: https://samurairesto.com",
      "samurairesto.com",
      tracked,
    );
    expect(out).toBe(`Order here: ${tracked}`);
  });

  test("keeps URLs that already have src=", () => {
    const kept =
      "https://samurairesto.com/r/samurai?src=fb-page-cta-20260718";
    const out = replaceBareStorefrontUrls(
      `Try ${kept}`,
      "samurairesto.com",
      tracked,
    );
    expect(out).toContain(kept);
    expect(out).not.toContain("social-reply");
  });

  test("ordering_interest appends tracked link when missing", () => {
    const out = ensureTrackedLinkInDraft(
      "Yes we deliver!",
      "ordering_interest",
      tracked,
      "samurairesto.com",
    );
    expect(out).toContain(tracked);
  });

  test("menu_suggestion gets tracked link too", () => {
    const out = ensureTrackedLinkInDraft(
      "We don't have ramen right now: https://samurairesto.com/order",
      "menu_suggestion",
      tracked,
      "samurairesto.com",
    );
    expect(out).toContain(tracked);
    expect(out).not.toMatch(/samurairesto\.com\/order(?![^\s]*src=)/);
  });
});
