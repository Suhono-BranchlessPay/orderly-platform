/**
 * Deterministic answers for "do you have X?" social questions.
 * Prefer catalog (names, descriptions, Square modifiers) + knowledge base.
 * Never invent — escalate when the fact is missing or marked escalate-only.
 */

export type MenuCatalogEntry = {
  name: string;
  description?: string | null;
  /** Flattened modifier / option names from Square or knowledge. */
  options?: string[];
};

export type MenuAnswerResult =
  | {
      ok: true;
      kind: "found" | "partial" | "not_found";
      draft: string;
      /** Do not append storefront link previews for direct catalog answers. */
      includeOrderLink: false;
      matched: string[];
      missing: string[];
      riskFlags: string[];
    }
  | {
      ok: false;
      reason: "not_menu_question" | "needs_human" | "no_phrases";
      riskFlags: string[];
    };

const MENU_ASK_RE =
  /\b(?:do\s+you(?:\s+guys|\s+y'?all)?\s+have|do\s+y'?all\s+have|do\s+you\s+serve|is\s+there|are\s+there|can\s+i\s+get|do\s+you\s+offer|got\s+any|have\s+you\s+got)\b/i;

const ALCOHOL_RE =
  /\b(beer|alcohol|wine|sake|cocktail|liquor|boozy|happy\s*hour)\b/i;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract item phrases after a menu-ask opener. */
export function extractMenuAskPhrases(message: string): string[] {
  const text = message.trim();
  if (!MENU_ASK_RE.test(text)) return [];

  let rest = text
    .replace(MENU_ASK_RE, " ")
    .replace(/[?!.]+$/g, " ")
    .replace(/\b(please|thanks|thank you|rn|tho|though)\b/gi, " ");

  // Drop leading articles / filler.
  rest = rest.replace(/^\s*(the|a|an|any|some)\s+/i, "");

  const parts = rest
    .split(/\s*(?:,|\/|\band\b|\bor\b)\s*/i)
    .map((p) =>
      p
        .replace(/^\s*(the|a|an|any|some)\s+/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((p) => p.length >= 3 && !/^(guys|yall|you)$/i.test(p));

  // Dedupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const n = normalize(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(p);
  }
  return out;
}

export function isMenuAvailabilityQuestion(message: string): boolean {
  return extractMenuAskPhrases(message).length > 0;
}

function corpusFromCatalog(entries: MenuCatalogEntry[]): string[] {
  const lines: string[] = [];
  for (const e of entries) {
    if (e.name?.trim()) lines.push(e.name.trim());
    if (e.description?.trim()) lines.push(e.description.trim());
    for (const opt of e.options ?? []) {
      if (opt?.trim()) lines.push(opt.trim());
    }
  }
  return lines;
}

function corpusFromKnowledge(knowledge: string): string[] {
  return knowledge
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function knowledgeSaysEscalate(knowledge: string, phrase: string): boolean {
  const n = normalize(phrase);
  for (const line of knowledge.split("\n")) {
    const ln = normalize(line);
    if (!ln.includes(n) && !n.split(" ").every((t) => t.length < 3 || ln.includes(t))) {
      continue;
    }
    if (/\bescalate\b|not confirmed|do not invent|must not answer/i.test(line)) {
      return true;
    }
  }
  return false;
}

/** True if phrase is present in a catalog/knowledge line (bidirectional token containment). */
export function phraseMatchesCorpus(phrase: string, corpus: string[]): string | null {
  const pn = normalize(phrase);
  if (!pn) return null;
  const tokens = pn.split(" ").filter((t) => t.length >= 3);

  for (const line of corpus) {
    const ln = normalize(line);
    if (!ln) continue;
    if (ln.includes(pn) || pn.includes(ln)) return line;
    if (tokens.length >= 2 && tokens.every((t) => ln.includes(t))) return line;
  }
  return null;
}

function firstName(authorName: string | null | undefined): string {
  const n = authorName?.trim().split(/\s+/)[0];
  return n && /^[A-Za-z]/.test(n) ? n : "";
}

function buildFoundDraft(input: {
  authorName: string | null;
  matched: string[];
}): string {
  const name = firstName(input.authorName);
  const hi = name ? `Hi ${name}! ` : "";
  const items = input.matched;
  if (items.length === 1) {
    return `${hi}Yes — ${items[0]} is on our menu. Come on in!`.replace(/\s+/g, " ").trim();
  }
  if (items.length === 2) {
    return (
      `${hi}Yes, we've got you covered — ${items[0]} and ${items[1]} are both available. Come on in!`
    )
      .replace(/\s+/g, " ")
      .trim();
  }
  const last = items[items.length - 1];
  const head = items.slice(0, -1).join(", ");
  return `${hi}Yes — we have ${head}, and ${last}. Come on in!`
    .replace(/\s+/g, " ")
    .trim();
}

/** Richer copy when both hibachi side options are asked together. */
function buildHibachiSidesDraft(
  authorName: string | null,
  matched: string[],
): string | null {
  const norms = matched.map((m) => normalize(m));
  const hasSoup = norms.some((n) => n.includes("onion") && n.includes("soup"));
  const hasGinger = norms.some(
    (n) => n.includes("ginger") && (n.includes("dressing") || n.includes("salad")),
  );
  if (!hasSoup || !hasGinger || matched.length !== 2) return null;
  const name = firstName(authorName);
  const hi = name ? `Hi ${name}! ` : "";
  return (
    `${hi}Yes, we've got you covered — ginger dressing is one of our salad options, ` +
    `and onion soup comes with our hibachi plates as your soup choice. Come on in!`
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Answer a menu-availability question from catalog + knowledge.
 * Callers should short-circuit the LLM when `ok: true`.
 */
export function answerMenuAvailabilityQuestion(input: {
  message: string;
  authorName?: string | null;
  catalog: MenuCatalogEntry[];
  knowledge?: string;
}): MenuAnswerResult {
  const phrases = extractMenuAskPhrases(input.message);
  if (!phrases.length) {
    return { ok: false, reason: "not_menu_question", riskFlags: [] };
  }

  const knowledge = input.knowledge ?? "";
  const riskFlags = ["menu_availability_question"];

  // Alcohol / beer — never invent; knowledge may explicitly escalate.
  if (ALCOHOL_RE.test(input.message) || phrases.some((p) => ALCOHOL_RE.test(p))) {
    return {
      ok: false,
      reason: "needs_human",
      riskFlags: [...riskFlags, "alcohol_ask"],
    };
  }

  const corpus = [
    ...corpusFromCatalog(input.catalog),
    ...corpusFromKnowledge(knowledge),
  ];

  const matched: string[] = [];
  const missing: string[] = [];

  for (const phrase of phrases) {
    if (knowledgeSaysEscalate(knowledge, phrase)) {
      return {
        ok: false,
        reason: "needs_human",
        riskFlags: [...riskFlags, "knowledge_escalate"],
      };
    }
    const hit = phraseMatchesCorpus(phrase, corpus);
    if (hit) matched.push(phrase);
    else missing.push(phrase);
  }

  if (matched.length && !missing.length) {
    // Prefer friendly labels for common Samurai sides when knowledge phrasing is long.
    const display = matched.map((m) => {
      const n = normalize(m);
      if (n.includes("onion") && n.includes("soup")) return "onion soup";
      if (n.includes("ginger") && (n.includes("dressing") || n.includes("salad"))) {
        return "ginger dressing";
      }
      return m;
    });
    const draft =
      buildHibachiSidesDraft(input.authorName ?? null, display) ??
      buildFoundDraft({ authorName: input.authorName ?? null, matched: display });
    return {
      ok: true,
      kind: "found",
      draft,
      includeOrderLink: false,
      matched: display,
      missing: [],
      riskFlags,
    };
  }

  if (matched.length && missing.length) {
    const display = matched.join(" and ");
    const name = firstName(input.authorName);
    const hi = name ? `Hi ${name}! ` : "";
    return {
      ok: true,
      kind: "partial",
      draft: `${hi}We do have ${display} — for ${missing.join(" and ")}, let me confirm with the team so we don't guess.`.replace(
        /\s+/g,
        " ",
      ).trim(),
      includeOrderLink: false,
      matched,
      missing,
      riskFlags: [...riskFlags, "partial_menu_match"],
    };
  }

  // No matches — do not invent a "no" from incomplete catalog (modifiers often unsynced).
  return {
    ok: false,
    reason: "needs_human",
    riskFlags: [...riskFlags, "menu_item_unconfirmed"],
  };
}

/** Flatten Square modifier JSON into searchable option names. */
export function flattenSquareModifiers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const list of raw) {
    if (!list || typeof list !== "object") continue;
    const rec = list as Record<string, unknown>;
    if (typeof rec.list_name === "string") out.push(rec.list_name);
    const mods = rec.modifiers;
    if (Array.isArray(mods)) {
      for (const m of mods) {
        if (m && typeof m === "object" && typeof (m as { name?: unknown }).name === "string") {
          out.push(String((m as { name: string }).name));
        }
      }
    }
  }
  return out.filter(Boolean);
}
