/**
 * Blok 4.1 — HEURISTIC (keyword) classifier for inbound social messages.
 *
 * Explicitly NOT medical/legal judgment. Routes to human workflows.
 * Safer buckets win. Negation windows prevent "was NOT disappointed" → complaint.
 */
import type { SocialClassification } from "@workspace/db";

const ALLERGY_HEALTH_KEYWORDS = [
  "allerg",
  "anaphyla",
  "epipen",
  "peanut",
  "tree nut",
  "shellfish",
  "gluten",
  "celiac",
  "coeliac",
  "lactose",
  "dairy free",
  "dairy-free",
  "halal",
  "kosher",
  "food poison",
  "foodborne",
  "threw up",
  "vomit",
  "diarrhea",
  "hospital",
  "er visit",
  "emergency room",
  "sick after eating",
  "got sick",
  "made me sick",
];

const SPAM_KEYWORDS = [
  "http://",
  "https://",
  "www.",
  "click here",
  "click the link",
  "buy now",
  "free followers",
  "free crypto",
  "bitcoin",
  "forex",
  "investment opportunity",
  "dm me for",
  "check my page",
  "check my profile",
  "work from home",
  "make money fast",
  "only fans",
  "onlyfans",
  "промо",
  "earn $",
  "guaranteed profit",
];

const COMPLAINT_KEYWORDS = [
  "worst",
  "terrible",
  "awful",
  "disgusting",
  "refund",
  "never again",
  "never coming back",
  "rude",
  "cold food",
  "was cold",
  "raw chicken",
  "undercooked",
  "overcooked",
  "waited an hour",
  "waited over",
  "hour late",
  "manager",
  "complain",
  "disappointed",
  "unacceptable",
  "horrible",
  "ripped off",
  "overcharged",
  "wrong order",
  "missing item",
  "hair in my food",
  "bug in my food",
];

const PRAISE_KEYWORDS = [
  "delicious",
  "amazing",
  "fantastic",
  "wonderful",
  "outstanding",
  "best",
  "love this",
  "love the",
  "love all",
  "loved it",
  "loved the",
  "i love",
  "we love",
  "great food",
  "great!",
  "it was great",
  "was great",
  "so good",
  "sooooooo good",
  "soooo good",
  "excellent",
  "yummy",
  "favorite",
  "favourite",
  "awesome",
  "thank you",
  "thanks so much",
  "highly recommend",
  "5 stars",
  "five stars",
  "can't wait to try",
  "cant wait to try",
  "we'll be back",
  "we will be back",
  "will go back",
];

/** Customer asking for items / formats not (yet) confirmed on menu. */
const MENU_SUGGESTION_KEYWORDS = [
  "ramen",
  "nigiri",
  "spider roll",
  "sweet potato tempura",
  "buffet",
  "all you can eat",
  "ayce",
  "do you have ramen",
  "add ramen",
  "wish you had",
  "you should add",
  "please add",
  "can you add",
  "gonna be on the menu",
  "going to be on the menu",
  "will you have",
];

/** Clear signals the comment is about another business / off-topic. */
const OFF_TOPIC_KEYWORDS = [
  "donut",
  "doughnut",
  "glazed jelly",
  "knead the dough",
  "go to donuts",
  "best donuts",
  "jelly filled",
  "hearing aids",
  "shop local page",
];

const QUESTION_STARTERS = [
  "what",
  "when",
  "where",
  "how",
  "do you",
  "are you",
  "can i",
  "can you",
  "is there",
  "does the",
  "will you",
  "why",
  "any update",
];

/** Negation tokens that invert a following complaint/praise keyword. */
const NEGATION_RE =
  /\b(not|no|never|n't|nt|wasnt|wasn't|isnt|isn't|arent|aren't|dont|don't|didnt|didn't|nope)\b/i;

export type ClassifyResult = {
  classification: SocialClassification;
  riskFlags: string[];
};

function normalize(text: string): string {
  return text.toLowerCase();
}

/** True if `needle` appears in haystack AND is not negated in a short window before it. */
export function hasNonNegatedMatch(haystack: string, needle: string): boolean {
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const windowStart = Math.max(0, idx - 28);
    const before = haystack.slice(windowStart, idx);
    if (!NEGATION_RE.test(before)) return true;
    from = idx + needle.length;
  }
  return false;
}

function findMatches(
  haystack: string,
  needles: string[],
  tag: string,
  respectNegation: boolean,
): string[] {
  const hits: string[] = [];
  for (const needle of needles) {
    const hit = respectNegation
      ? hasNonNegatedMatch(haystack, needle)
      : haystack.includes(needle);
    if (hit) hits.push(`${tag}:${needle}`);
  }
  return hits;
}

/**
 * Priority (safest first): allergy > spam > off-topic-as-spam > complaint
 * > menu_suggestion > question > praise > unknown.
 */
export function classifySocialMessage(rawBody: string | null | undefined): ClassifyResult {
  const body = (rawBody ?? "").trim();
  if (!body) {
    return { classification: "unknown", riskFlags: ["empty_body"] };
  }
  const text = normalize(body);

  const allergyHits = findMatches(text, ALLERGY_HEALTH_KEYWORDS, "allergy_keyword", false);
  const spamHits = findMatches(text, SPAM_KEYWORDS, "spam_keyword", false);
  const offTopicHits = findMatches(text, OFF_TOPIC_KEYWORDS, "off_topic", false);
  const complaintHits = findMatches(text, COMPLAINT_KEYWORDS, "complaint_keyword", true);
  const menuHits = findMatches(text, MENU_SUGGESTION_KEYWORDS, "menu_suggestion", false);
  const praiseHits = findMatches(text, PRAISE_KEYWORDS, "praise_keyword", true);
  const isQuestion =
    text.includes("?") ||
    QUESTION_STARTERS.some((q) => text.startsWith(q) || text.includes(` ${q} `));

  const allFlags = [
    ...allergyHits,
    ...spamHits,
    ...offTopicHits,
    ...complaintHits,
    ...menuHits,
    ...praiseHits,
  ];

  if (allergyHits.length > 0) {
    return { classification: "allergy_health", riskFlags: allFlags };
  }
  if (spamHits.length > 0) {
    return { classification: "spam", riskFlags: allFlags };
  }
  // Off-topic about another business → skip path (no Samurai thank-you draft).
  // Wins even if the text also contains generic praise words ("best", etc.).
  if (offTopicHits.length > 0 && !/\b(samurai|hibachi|sushi|bento)\b/i.test(text)) {
    return { classification: "spam", riskFlags: [...allFlags, "off_topic_other_business"] };
  }
  if (complaintHits.length > 0) {
    return { classification: "complaint", riskFlags: allFlags };
  }
  if (menuHits.length > 0) {
    return { classification: "menu_suggestion", riskFlags: allFlags };
  }
  if (isQuestion) {
    return {
      classification: "question",
      riskFlags: allFlags.length ? allFlags : ["question_pattern"],
    };
  }
  if (praiseHits.length > 0) {
    return { classification: "praise", riskFlags: allFlags };
  }
  return { classification: "unknown", riskFlags: allFlags };
}

/** Soft age gate for drafting — comments older than maxAgeDays should not get drafts. */
export function isCommentTooOldForDraft(
  externalCreatedAt: Date | null | undefined,
  maxAgeDays: number,
  now: Date = new Date(),
): boolean {
  if (!externalCreatedAt || !Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return false;
  const ageMs = now.getTime() - externalCreatedAt.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

export function parseExternalCreatedAt(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}
