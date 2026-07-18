import {
  resolveCanonicalTag,
  slugifySeo,
} from "../../src/lib/seoTags";

describe("resolveCanonicalTag", () => {
  it("blocks uncategorized and similar junk", () => {
    expect(resolveCanonicalTag("Uncategorized")).toBeNull();
    expect(resolveCanonicalTag("misc")).toBeNull();
    expect(resolveCanonicalTag("menu")).toBeNull();
  });

  it("merges drink/drinks and appetizer/appetizers", () => {
    expect(resolveCanonicalTag("drink")).toEqual({
      slug: "drinks",
      name: "Drinks",
    });
    expect(resolveCanonicalTag("Drinks")).toEqual({
      slug: "drinks",
      name: "Drinks",
    });
    expect(resolveCanonicalTag("appetizer")).toEqual({
      slug: "appetizers",
      name: "Appetizers",
    });
  });

  it("merges bento-box into bento", () => {
    expect(resolveCanonicalTag("Bento Box")).toEqual({
      slug: "bento",
      name: "Bento",
    });
    expect(resolveCanonicalTag("bento")).toEqual({
      slug: "bento",
      name: "Bento",
    });
  });

  it("keeps unique food tags", () => {
    expect(resolveCanonicalTag("Hibachi")).toEqual({
      slug: "hibachi",
      name: null,
    });
    expect(slugifySeo("Spicy Tuna")).toBe("spicy-tuna");
  });
});
