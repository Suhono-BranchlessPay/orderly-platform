import {
  classifySocialMessage,
  hasNonNegatedMatch,
  isCommentTooOldForDraft,
} from "../../src/lib/socialClassify";

describe("socialClassify negation", () => {
  it("does not treat 'was NOT disappointed' as complaint", () => {
    const r = classifySocialMessage("I was NOT disappointed — food was great!");
    expect(r.classification).not.toBe("complaint");
    expect(["praise", "unknown"]).toContain(r.classification);
  });

  it("still flags real disappointment as complaint", () => {
    const r = classifySocialMessage("Very disappointed with the cold food");
    expect(r.classification).toBe("complaint");
  });

  it("hasNonNegatedMatch respects negation window", () => {
    expect(hasNonNegatedMatch("was not disappointed", "disappointed")).toBe(false);
    expect(hasNonNegatedMatch("so disappointed today", "disappointed")).toBe(true);
  });
});

describe("socialClassify praise + menu + off-topic", () => {
  it("classifies clear praise that used to be unknown", () => {
    expect(classifySocialMessage("This place is FANTASTIC!").classification).toBe(
      "praise",
    );
    expect(classifySocialMessage("it was great!").classification).toBe("praise");
    expect(classifySocialMessage("I love all the sushi").classification).toBe("praise");
  });

  it("classifies menu suggestions", () => {
    expect(classifySocialMessage("Spider roll gonna be on the menu ??").classification).toBe(
      "menu_suggestion",
    );
    expect(classifySocialMessage("do you have ramen").classification).toBe(
      "menu_suggestion",
    );
  });

  it("skips donut / other-business praise as spam(off-topic)", () => {
    const r = classifySocialMessage("Their glazed jelly filled are the worlds best");
    expect(r.classification).toBe("spam");
    expect(r.riskFlags.some((f) => f.includes("off_topic"))).toBe(true);
  });
});

describe("socialClassify age gate", () => {
  it("marks comments older than max age", () => {
    const old = new Date("2026-06-01T12:00:00Z");
    const now = new Date("2026-07-18T12:00:00Z");
    expect(isCommentTooOldForDraft(old, 21, now)).toBe(true);
    expect(isCommentTooOldForDraft(old, 90, now)).toBe(false);
    expect(isCommentTooOldForDraft(null, 21, now)).toBe(false);
  });
});

describe("socialClassify ordering_interest", () => {
  it("classifies online-ordering celebration / how-to-order", () => {
    expect(
      classifySocialMessage("Yay! Online ordering!!").classification,
    ).toBe("ordering_interest");
    expect(
      classifySocialMessage("How do I order for pickup?").classification,
    ).toBe("ordering_interest");
    expect(classifySocialMessage("Do you deliver?").classification).toBe(
      "ordering_interest",
    );
  });
});
