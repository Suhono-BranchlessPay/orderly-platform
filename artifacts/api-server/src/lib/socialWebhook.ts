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
  /**
   * comment = reply on Page/IG feed comment (/{comment-id}/comments)
   * message = Messenger/IG DM (/me/messages, needs PSID)
   * mention = visitor/tagged post that tags the Page (/{post-id}/comments)
   */
  kind: "comment" | "message" | "mention";
  pageId: string | undefined;
  externalThreadId: string | null;
  externalMessageId: string | null;
  /** Author's Meta user/page id — used to skip the Page's own posts/comments. */
  authorId: string | null;
  authorName: string | null;
  body: string | null;
  /** Original platform created_time when present (ISO / Graph string). */
  createdTime?: string | null;
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
      // Skip the Page's own outgoing DMs (Meta echoes them back to the webhook).
      if (message.is_echo === true) continue;
      const senderId = str(sender.id);
      // Never treat the Page replying to itself as an inbound message.
      if (senderId && pageId && senderId === pageId) continue;
      results.push({
        platform,
        kind: "message",
        pageId,
        externalThreadId: senderId,
        externalMessageId: str(message.mid),
        authorId: senderId,
        authorName: null, // Messenger events don't include a display name; left null honestly.
        body: text,
      });
    }

    for (const changeRaw of asArray(entry.changes)) {
      const change = asRecord(changeRaw);
      const field = str(change.field);
      const value = asRecord(change.value);
      const from = asRecord(value.from);
      const text = str(value.message) ?? str(value.text);
      const commentId = str(value.comment_id);
      const postId =
        str(value.post_id) ?? str(value.parent_id) ?? str(value.postId);
      const item = str(value.item);
      const verb = str(value.verb);
      const fromId = str(from.id);
      const createdTime = str(value.created_time) ?? str(value.createdTime);

      // Deletions/hides are not repliable.
      if (verb === "remove" || verb === "hide") continue;
      // The Page speaking as itself — never file as inbound.
      if (fromId && pageId && fromId === pageId) continue;
      if (!text) continue;

      // Page `mention` webhook field — someone tagged the Page on their post.
      if (field === "mention" || item === "mention" || item === "tag") {
        const mentionPostId = postId ?? str(value.id);
        if (!mentionPostId) continue;
        results.push({
          platform,
          kind: "mention",
          pageId,
          externalThreadId: mentionPostId,
          externalMessageId: mentionPostId,
          authorId: fromId,
          authorName: str(from.name),
          body: text,
          createdTime,
        });
        continue;
      }

      // Visitor post on the Page timeline (not the Page's own publish).
      if (
        item &&
        ["post", "status", "photo", "video", "share", "link"].includes(item) &&
        !commentId
      ) {
        const visitorPostId = postId ?? str(value.post_id) ?? str(value.id);
        if (!visitorPostId) continue;
        // Skip Page-owned publish echoes (id prefix pageId_).
        if (pageId && visitorPostId.startsWith(`${pageId}_`)) continue;
        results.push({
          platform,
          kind: "mention",
          pageId,
          externalThreadId: visitorPostId,
          externalMessageId: visitorPostId,
          authorId: fromId,
          authorName: str(from.name),
          body: text,
          createdTime,
        });
        continue;
      }

      // Real comments on Page posts.
      if (item && item !== "comment") continue;
      if (!commentId) continue;

      results.push({
        platform,
        kind: "comment",
        pageId,
        externalThreadId: postId,
        externalMessageId: commentId,
        authorId: fromId,
        authorName: str(from.name),
        body: text,
        createdTime,
      });
    }
  }

  return results;
}

/**
 * X-Hub-Signature-256: "sha256=<hex hmac of raw body with META_APP_SECRET>".
 *
 * Wired via `express.raw` on `/api/social/webhooks/meta` (and dashboard alias)
 * in `app.ts` BEFORE `express.json()`, same pattern as Square webhooks.
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
