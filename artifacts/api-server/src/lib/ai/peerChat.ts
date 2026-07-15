/**
 * Detect peer-to-peer / not-to-restaurant social comments.
 * Production failure 14 Jul 2026: "Joni Haryono lets try tomorrow" got a generic draft.
 */

const PEER_PLAN_RE =
  /\b(lets? try|let'?s try|wanna (go|try|come)|you should (come|bring|try)|see you (there|tomorrow)|tagging you|bring me this)\b/i;

const REACTION_ONLY_RE = /^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}👍🔥❤️😂lolomg]+$/iu;

/** Two+ Capitalized tokens at start that look like a person name, then a plan. */
const LEADING_PERSON_NAME_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/;

export function looksLikePeerConversation(messageText: string): { peer: boolean; reason: string } {
  const text = messageText.trim();
  if (!text) return { peer: true, reason: "empty_message" };

  if (REACTION_ONLY_RE.test(text)) {
    return { peer: true, reason: "reaction_only" };
  }

  if (PEER_PLAN_RE.test(text) && LEADING_PERSON_NAME_RE.test(text)) {
    return { peer: true, reason: "person_name_plus_plan" };
  }

  if (PEER_PLAN_RE.test(text) && !/\b(you|do you|are you|hours|open|menu|order|pickup)\b/i.test(text)) {
    // Plan language without addressing the restaurant.
    if (LEADING_PERSON_NAME_RE.test(text) || /^@\w+/.test(text)) {
      return { peer: true, reason: "peer_plan" };
    }
  }

  // "@Friend you should…"
  if (/^@\w+\s+/i.test(text) && /\b(you should|check this|look at this)\b/i.test(text)) {
    return { peer: true, reason: "friend_tag" };
  }

  return { peer: false, reason: "" };
}
