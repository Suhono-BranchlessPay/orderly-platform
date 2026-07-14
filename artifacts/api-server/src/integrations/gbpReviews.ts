/**
 * Blok 4.2 — Google Business Profile review/Q&A reply client (STUB).
 *
 * Real Business Profile API calls are NOT wired yet (OAuth + location
 * ownership still ops). This module exists so /send has a single place to
 * grow into — gating stays in lib/gbp.ts, never here.
 * See docs/BLOK4_GBP_TRIAL.md.
 */

export type GbpReplyResult =
  | { ok: true; externalReplyId: string | null }
  | { ok: false; status: number; error: string };

export async function replyToGbpReview(_input: {
  accessToken: string;
  reviewName: string;
  comment: string;
}): Promise<GbpReplyResult> {
  return {
    ok: false,
    status: 501,
    error:
      "GBP review reply API is not wired yet — configure Google Business Profile OAuth (Blok 4.2 Stage 2) before enabling GBP_SEND_ENABLED.",
  };
}

export async function replyToGbpQuestion(_input: {
  accessToken: string;
  questionName: string;
  comment: string;
}): Promise<GbpReplyResult> {
  return {
    ok: false,
    status: 501,
    error:
      "GBP Q&A reply API is not wired yet — configure Google Business Profile OAuth (Blok 4.2 Stage 2) before enabling GBP_SEND_ENABLED.",
  };
}
