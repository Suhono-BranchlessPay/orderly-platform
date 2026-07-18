import { resolveGscSiteUrlForTenant } from "../../src/lib/gscSiteUrl";

describe("resolveGscSiteUrlForTenant", () => {
  test("accepts matching https host", () => {
    expect(
      resolveGscSiteUrlForTenant(
        "https://samurairesto.com/",
        "samurairesto.com",
      ),
    ).toBe("https://samurairesto.com/");
  });

  test("rejects other domains", () => {
    expect(
      resolveGscSiteUrlForTenant("https://evil.example/", "samurairesto.com"),
    ).toBeNull();
  });

  test("rejects http", () => {
    expect(
      resolveGscSiteUrlForTenant("http://samurairesto.com/", "samurairesto.com"),
    ).toBeNull();
  });

  test("defaults to tenant domain when siteUrl omitted", () => {
    expect(resolveGscSiteUrlForTenant(null, "samurairesto.com")).toBe(
      "https://samurairesto.com/",
    );
  });
});
