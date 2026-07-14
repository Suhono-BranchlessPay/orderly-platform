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

const DEFAULT_GRAPH_API_VERSION = "v21.0";

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
  const url = `https://graph.facebook.com/${getMetaGraphApiVersion()}/${encodeURIComponent(commentId)}/comments`;
  const body = new URLSearchParams({ message, access_token: accessToken });

  try {
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
  const url = `https://graph.facebook.com/${getMetaGraphApiVersion()}/me/messages?access_token=${encodeURIComponent(accessToken)}`;

  try {
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
