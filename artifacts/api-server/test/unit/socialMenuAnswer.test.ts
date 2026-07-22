import {
  answerMenuAvailabilityQuestion,
  extractMenuAskPhrases,
  flattenSquareModifiers,
  phraseMatchesCorpus,
} from "../../src/lib/socialMenuAnswer";

const samuraiKnowledge = [
  "Onion soup: yes — hibachi plates include soup or salad; onion soup is the soup choice.",
  "Ginger dressing: yes — available as the salad / ginger dressing option with hibachi plates.",
  "Alcohol/beer: not confirmed — if asked whether we serve beer/alcohol, ESCALATE.",
].join("\n");

describe("socialMenuAnswer", () => {
  test("extracts onion soup and ginger dressing phrases", () => {
    const phrases = extractMenuAskPhrases(
      "Do you guys have the onion soup and ginger dressing",
    );
    expect(phrases.map((p) => p.toLowerCase())).toEqual(
      expect.arrayContaining(["onion soup", "ginger dressing"]),
    );
  });

  test("answers hibachi sides from knowledge without inventing", () => {
    const result = answerMenuAvailabilityQuestion({
      message: "Do you guys have the onion soup and ginger dressing",
      authorName: "Shaylynn Collins Tomey",
      catalog: [],
      knowledge: samuraiKnowledge,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeOrderLink).toBe(false);
    expect(result.draft).toMatch(/Hi Shaylynn!/);
    expect(result.draft).toMatch(/ginger dressing/i);
    expect(result.draft).toMatch(/onion soup/i);
    expect(result.draft).not.toMatch(/follow up|team will/i);
    expect(result.draft).not.toMatch(/https?:\/\//i);
  });

  test("matches catalog item names", () => {
    const result = answerMenuAvailabilityQuestion({
      message: "do you have spicy tuna rolls?",
      authorName: "Alex",
      catalog: [{ name: "Spicy Tuna Roll" }],
      knowledge: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toMatch(/Spicy Tuna/i);
  });

  test("matches Square modifier options", () => {
    const mods = flattenSquareModifiers([
      {
        list_name: "Soup or Salad",
        modifiers: [{ name: "Onion Soup" }, { name: "Ginger Dressing Salad" }],
      },
    ]);
    expect(mods).toEqual(
      expect.arrayContaining(["Onion Soup", "Ginger Dressing Salad"]),
    );
    expect(phraseMatchesCorpus("onion soup", mods)).toBeTruthy();
  });

  test("escalates alcohol asks", () => {
    const result = answerMenuAvailabilityQuestion({
      message: "Do you serve beer?",
      authorName: "Pat",
      catalog: [{ name: "Soda" }],
      knowledge: samuraiKnowledge,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("needs_human");
    expect(result.riskFlags).toContain("alcohol_ask");
  });

  test("non-menu questions are ignored", () => {
    const result = answerMenuAvailabilityQuestion({
      message: "What time do you close today?",
      catalog: [],
      knowledge: samuraiKnowledge,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_menu_question");
  });
});
