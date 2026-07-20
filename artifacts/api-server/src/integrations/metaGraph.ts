/**
 * Blok 4.1 — real Meta Graph API send calls (Page/IG comment replies +
 * Messenger). This module ONLY performs the HTTP call — it never decides
 * *whether* a reply should be sent. All gating (kill switch,
 * SOCIAL_SEND_ENABLED, status=approved, safe classification, human /send
 * click) happens in `lib/social.ts` `sendApprovedReply()` before this is
 * ever called. See docs/BLOK4_SOCIAL_TRIAL.md.
 *
 * The access token is NEVER logged, thrown in an Error message, or written
 * to the audit trail — only Meta's own (token-free) error text is captured.
 */

import { isMetaGloballyDisabled, throttleMetaCall } from "../lib/metaGuard";

const DEFAULT_GRAPH_API_VERSION = "v21.0";

const GLOBALLY_DISABLED_MSG =
  "Meta traffic is globally disabled (META_GLOBAL_KILL_SWITCH). No Graph call was made.";

export function getMetaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_API_VERSION;
}

export type MetaSendResult =
  | { ok: true; externalReplyId: string | null }
  | { ok: false; status: number; error: string };

function metaErrorMessage(status: number, text: string): string {
  try {
    const parsed = text
      ? (JSON.parse(text) as { error?: { message?: string; type?: string; code?: number } })
      : null;
    if (parsed?.error?.message) {
      return `${parsed.error.message}${parsed.error.code ? ` (Meta error code ${parsed.error.code})` : ""}`;
    }
  } catch {
    /* Meta didn't return JSON — fall through to raw text below. */
  }
  return text.trim() || `Meta Graph API returned HTTP ${status} with no body`;
}

/**
 * Reply to a Page/Instagram feed comment.
 * POST /{comment-id}/comments  (message + access_token)
 * https://developers.facebook.com/docs/graph-api/reference/v21.0/object/comments
 */
export async function replyToMetaComment(
  commentId: string,
  message: string,
  accessToken: string,
): Promise<MetaSendResult> {
  if (isMetaGloballyDisabled()) {
    return { ok: false, status: 503, error: GLOBALLY_DISABLED_MSG };
  }
  const url = `https://graph.facebook.com/${getMetaGraphApiVersion()}/${encodeURIComponent(commentId)}/comments`;
  const body = new URLSearchParams({ message, access_token: accessToken });

  try {
    await throttleMetaCall();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, error: metaErrorMessage(response.status, text) };
    }
    const json = text ? (JSON.parse(text) as { id?: string }) : {};
    return { ok: true, externalReplyId: json.id ?? null };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Network error calling Meta Graph API (comment reply)",
    };
  }
}

export type BackfilledComment = {
  postId: string | null;
  commentId: string;
  authorId: string | null;
  authorName: string | null;
  message: string | null;
  createdTime: string | null;
};

export type FetchCommentsResult =
  | { ok: true; pageId: string | null; comments: BackfilledComment[] }
  | { ok: false; error: string };

export type BackfilledTaggedPost = {
  postId: string;
  authorId: string | null;
  authorName: string | null;
  message: string | null;
  createdTime: string | null;
  permalinkUrl: string | null;
};

export type FetchTaggedResult =
  | { ok: true; pageId: string | null; posts: BackfilledTaggedPost[] }
  | { ok: false; error: string };

/**
 * People/Pages that tagged this Page on their own posts (visitor mentions).
 * GET /{page-id}/tagged — never appears in /me/posts comment trees.
 * Skips the Page's own posts that echo in /tagged (id prefix pageId_).
 */
export async function fetchRecentPageTaggedPosts(
  accessToken: string,
  opts?: { limit?: number },
): Promise<FetchTaggedResult> {
  if (isMetaGloballyDisabled()) {
    return { ok: false, error: GLOBALLY_DISABLED_MSG };
  }
  const version = getMetaGraphApiVersion();
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 100);

  try {
    let pageId: string | null = null;
    try {
      await throttleMetaCall();
      const meRes = await fetch(
        `https://graph.facebook.com/${version}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`,
      );
      const meText = await meRes.text();
      if (meRes.ok) pageId = s(asRec(JSON.parse(meText)).id);
    } catch {
      /* non-fatal */
    }

    const fields = "id,message,created_time,from{id,name},permalink_url";
    const url =
      `https://graph.facebook.com/${version}/me/tagged` +
      `?fields=${encodeURIComponent(fields)}&limit=${limit}` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    await throttleMetaCall();
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: metaErrorMessage(res.status, text) };
    }

    const json = asRec(JSON.parse(text));
    const posts: BackfilledTaggedPost[] = [];
    for (const raw of asArr(json.data)) {
      const p = asRec(raw);
      const postId = s(p.id);
      if (!postId) continue;
      if (pageId && postId.startsWith(`${pageId}_`)) continue;
      const from = asRec(p.from);
      const authorId = s(from.id);
      if (pageId && authorId && authorId === pageId) continue;
      const message = s(p.message);
      if (!message) continue;
      posts.push({
        postId,
        authorId,
        authorName: s(from.name),
        message,
        createdTime: s(p.created_time),
        permalinkUrl: s(p.permalink_url),
      });
    }
    return { ok: true, pageId, posts };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error calling Meta Graph API (tagged backfill)",
    };
  }
}

function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Read-only backfill: fetch recent Page posts + their comments so comments the
 * webhook never received (older posts, or before the subscription) can be filed
 * into the inbox. GET only — never sends. The Page's own comments are excluded
 * by comparing each comment author id to the Page id.
 *
 * `fetch().text()` decodes Graph's UTF-8 JSON correctly, so emoji come back
 * clean (this also repairs "�" from earlier corrupted ingests on re-file).
 */
export async function fetchRecentPageComments(
  accessToken: string,
  opts?: { postLimit?: number; commentLimit?: number },
): Promise<FetchCommentsResult> {
  if (isMetaGloballyDisabled()) {
    return { ok: false, error: GLOBALLY_DISABLED_MSG };
  }
  const version = getMetaGraphApiVersion();
  // Default 50 — comments keep arriving on older posts; 12 was too shallow.
  const postLimit = Math.min(Math.max(opts?.postLimit ?? 50, 1), 100);
  const commentLimit = Math.min(Math.max(opts?.commentLimit ?? 50, 1), 100);

  try {
    // The Page id lets us drop the Page's own comments during backfill.
    let pageId: string | null = null;
    try {
      await throttleMetaCall();
      const meRes = await fetch(
        `https://graph.facebook.com/${version}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`,
      );
      const meText = await meRes.text();
      if (meRes.ok) pageId = s(asRec(JSON.parse(meText)).id);
    } catch {
      /* non-fatal — without page id we simply keep all comments */
    }

    const fields = `id,message,created_time,comments.limit(${commentLimit}){id,message,from,created_time}`;
    const url =
      `https://graph.facebook.com/${version}/me/posts` +
      `?fields=${encodeURIComponent(fields)}&limit=${postLimit}` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    await throttleMetaCall();
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: metaErrorMessage(res.status, text) };
    }

    const json = asRec(JSON.parse(text));
    const comments: BackfilledComment[] = [];
    for (const postRaw of asArr(json.data)) {
      const post = asRec(postRaw);
      const postId = s(post.id);
      for (const cRaw of asArr(asRec(post.comments).data)) {
        const c = asRec(cRaw);
        const commentId = s(c.id);
        if (!commentId) continue;
        const from = asRec(c.from);
        const authorId = s(from.id);
        if (pageId && authorId && authorId === pageId) continue; // our own comment
        comments.push({
          postId,
          commentId,
          authorId,
          authorName: s(from.name),
          message: s(c.message),
          createdTime: s(c.created_time),
        });
      }
    }
    return { ok: true, pageId, comments };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error calling Meta Graph API (comment backfill)",
    };
  }
}

/**
 * Send a Messenger (or IG DM) reply to a PSID.
 * POST /me/messages  (recipient + message, access_token as query param)
 * https://developers.facebook.com/docs/messenger-platform/reference/send-api
 */
export async function sendMetaMessengerMessage(
  recipientPsid: string,
  message: string,
  accessToken: string,
): Promise<MetaSendResult> {
  if (isMetaGloballyDisabled()) {
    return { ok: false, status: 503, error: GLOBALLY_DISABLED_MSG };
  }
  const url = `https://graph.facebook.com/${getMetaGraphApiVersion()}/me/messages?access_token=${encodeURIComponent(accessToken)}`;

  try {
    await throttleMetaCall();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message: { text: message },
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, error: metaErrorMessage(response.status, text) };
    }
    const json = text ? (JSON.parse(text) as { message_id?: string }) : {};
    return { ok: true, externalReplyId: json.message_id ?? null };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Network error calling Meta Graph API (messenger send)",
    };
  }
}
