/**
 * Loose parser for Google Business Profile notification / simulate payloads.
 * Unknown shapes are ignored (not thrown) — same trade-off as Meta webhook.
 */

export type ParsedGbpInbound = {
  kind: "review" | "question";
  locationId: string | undefined;
  externalMessageId: string | null;
  authorName: string | null;
  body: string | null;
  starRating: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function intOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    return n >= 1 && n <= 5 ? n : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n >= 1 && n <= 5 ? n : null;
  }
  // Google sometimes sends STAR_RATING_THREE etc.
  if (typeof value === "string") {
    const m = value.toUpperCase().match(/ONE|TWO|THREE|FOUR|FIVE/);
    if (!m) return null;
    const map: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };
    return map[m[0]] ?? null;
  }
  return null;
}

/**
 * Accepts:
 *  - Our simulate shape: { kind, location_id, review_id|question_id, from, comment|text, star_rating }
 *  - Pub/Sub push envelope: { message: { data: base64(json) } }
 *  - Nested review objects with name/comment/starRating/reviewer
 */
export function parseGbpWebhookBody(body: unknown): ParsedGbpInbound[] {
  const root = asRecord(body);

  // Pub/Sub push
  const message = asRecord(root.message);
  if (typeof message.data === "string" && message.data) {
    try {
      const decoded = Buffer.from(message.data, "base64").toString("utf8");
      return parseGbpWebhookBody(JSON.parse(decoded));
    } catch {
      /* fall through */
    }
  }

  const results: ParsedGbpInbound[] = [];

  const direct = parseOne(root);
  if (direct) results.push(direct);

  for (const item of asArray(root.reviews)) {
    const parsed = parseOne({ ...asRecord(item), kind: "review" });
    if (parsed) results.push(parsed);
  }
  for (const item of asArray(root.questions)) {
    const parsed = parseOne({ ...asRecord(item), kind: "question" });
    if (parsed) results.push(parsed);
  }

  return results;
}

function parseOne(raw: Record<string, unknown>): ParsedGbpInbound | null {
  const kindRaw = str(raw.kind)?.toLowerCase();
  const kind: "review" | "question" | null =
    kindRaw === "review" || kindRaw === "question"
      ? kindRaw
      : str(raw.review_id) || str(raw.reviewId) || raw.starRating != null || raw.star_rating != null
        ? "review"
        : str(raw.question_id) || str(raw.questionId)
          ? "question"
          : null;
  if (!kind) return null;

  const from = asRecord(raw.from ?? raw.reviewer ?? raw.author);
  const body =
    str(raw.body) ??
    str(raw.comment) ??
    str(raw.text) ??
    str(raw.question) ??
    str(asRecord(raw.comment).text);

  const externalMessageId =
    str(raw.external_message_id) ??
    str(raw.review_id) ??
    str(raw.reviewId) ??
    str(raw.question_id) ??
    str(raw.questionId) ??
    str(raw.name); // accounts/.../locations/.../reviews/...

  const locationId =
    str(raw.location_id) ??
    str(raw.locationId) ??
    str(raw.external_location_id) ??
    extractLocationFromName(externalMessageId);

  if (!body && !externalMessageId) return null;

  return {
    kind,
    locationId: locationId ?? undefined,
    externalMessageId,
    authorName: str(from.name) ?? str(from.displayName) ?? str(raw.author_name),
    body,
    starRating: kind === "review" ? intOrNull(raw.star_rating ?? raw.starRating) : null,
  };
}

function extractLocationFromName(name: string | null): string | null {
  if (!name) return null;
  const m = name.match(/locations\/([^/]+)/);
  return m ? `locations/${m[1]}` : null;
}
