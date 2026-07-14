/**
 * Blok 4.1 — loose Meta (Facebook Page / Instagram) webhook payload parsing.
 *
 * This intentionally does NOT depend on the full Meta Graph SDK / OAuth flow
 * (that's Blok 4.x real integration). It only extracts enough fields to file
 * a social_inbox row. Unknown/older payload shapes are ignored, not thrown.
 */
import { createHmac, timingSafeEqual } from "crypto";

export type ParsedInboundMessage = {
  platform: "facebook" | "instagram";
  /** "comment" = Page/IG feed comment (reply via /{comment-id}/comments).
   *  "message" = Messenger/IG DM (reply via /me/messages, needs the PSID). */
  kind: "comment" | "message";
  pageId: string | undefined;
  externalThreadId: string | null;
  externalMessageId: string | null;
  authorName: string | null;
  body: string | null;
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

/**
 * Handles the two shapes Meta sends for Pages:
 *  - Messenger: entry[].messaging[] (message.mid, message.text, sender.id)
 *  - Comments/feed: entry[].changes[] (value.comment_id, value.message, value.from)
 * Instagram uses the same envelope with object: "instagram".
 */
export function parseMetaWebhookBody(body: unknown): ParsedInboundMessage[] {
  const root = asRecord(body);
  const object = str(root.object) ?? "page";
  const platform: "facebook" | "instagram" = object.includes("instagram")
    ? "instagram"
    : "facebook";

  const results: ParsedInboundMessage[] = [];
  for (const entryRaw of asArray(root.entry)) {
    const entry = asRecord(entryRaw);
    const pageId = str(entry.id) ?? undefined;

    for (const msgRaw of asArray(entry.messaging)) {
      const msg = asRecord(msgRaw);
      const sender = asRecord(msg.sender);
      const message = asRecord(msg.message);
      const text = str(message.text);
      if (!text && !message.mid) continue;
      results.push({
        platform,
        kind: "message",
        pageId,
        externalThreadId: str(sender.id),
        externalMessageId: str(message.mid),
        authorName: null, // Messenger events don't include a display name; left null honestly.
        body: text,
      });
    }

    for (const changeRaw of asArray(entry.changes)) {
      const change = asRecord(changeRaw);
      const value = asRecord(change.value);
      const from = asRecord(value.from);
      const text = str(value.message) ?? str(value.text);
      const commentId = str(value.comment_id);
      const postId = str(value.post_id) ?? str(value.parent_id);
      if (!text && !commentId) continue;
      results.push({
        platform,
        kind: "comment",
        pageId,
        externalThreadId: postId,
        externalMessageId: commentId,
        authorName: str(from.name),
        body: text,
      });
    }
  }

  return results;
}

/**
 * X-Hub-Signature-256: "sha256=<hex hmac of raw body with META_APP_SECRET>".
 *
 * NOTE: not wired into routes/social.ts yet — express.json() has already
 * parsed the body by the time it reaches the route handler, and
 * re-serializing JSON is not guaranteed to byte-match Meta's original raw
 * request, which would cause false-negative rejections. Real enforcement
 * needs a raw-body capture middleware scoped to this one route (mounted
 * before express.json()) — left as a documented gap, not a silent bug.
 * Exported so that follow-up work can wire it once that capture exists.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedHex = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(providedHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
