/**
 * Blok 4.2 Stage 2 — Google Business Profile review client (LIVE).
 *
 * Uses the Business Profile API v4 (mybusiness.googleapis.com/v4) to list
 * reviews and post owner replies. Q&A replies use a separate API and remain
 * stubbed for now.
 *
 * Gating lives in lib/gbp.ts (kill switch, GBP_SEND_ENABLED, human approval).
 * This module only performs the network call once the caller has decided to.
 *
 * OPS PREREQUISITES (see docs/BLOK4_GBP_TRIAL.md):
 *  - A Google Cloud project with the Business Profile API enabled AND
 *    access approved by Google (the API is allow-listed / requires an
 *    application). Until approved, list/reply return 403.
 *  - OAuth client (GOOGLE_OAUTH_CLIENT_ID/SECRET) + an offline refresh token
 *    (GBP_REFRESH_TOKEN) with scope https://www.googleapis.com/auth/business.manage
 *  - GBP_LOCATION_RESOURCE = accounts/{acct}/locations/{loc}
 */

const GBP_API_BASE = "https://mybusiness.googleapis.com/v4";

export type GbpReplyResult =
  | { ok: true; externalReplyId: string | null }
  | { ok: false; status: number; error: string };

export type FetchedGbpReview = {
  reviewName: string; // accounts/{a}/locations/{l}/reviews/{id}
  authorName: string | null;
  comment: string | null;
  starRating: number | null;
  createTime: string | null;
  updateTime: string | null;
  hasReply: boolean;
};

export type FetchGbpReviewsResult =
  | { ok: true; reviews: FetchedGbpReview[] }
  | { ok: false; status: number; error: string };

const STAR_ENUM_TO_NUMBER: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function starToNumber(value: unknown): number | null {
  if (typeof value === "number" && value >= 1 && value <= 5) return Math.round(value);
  if (typeof value === "string") {
    const hit = STAR_ENUM_TO_NUMBER[value.trim().toUpperCase()];
    if (hit) return hit;
  }
  return null;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * List reviews for a location. Paginates until exhausted or `pageSize` reached.
 * `locationResource` = accounts/{acct}/locations/{loc}.
 */
export async function fetchGbpReviews(input: {
  accessToken: string;
  locationResource: string;
  pageSize?: number;
}): Promise<FetchGbpReviewsResult> {
  const cap = Math.min(Math.max(input.pageSize ?? 50, 1), 200);
  const reviews: FetchedGbpReview[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL(`${GBP_API_BASE}/${input.locationResource}/reviews`);
      url.searchParams.set("pageSize", String(Math.min(cap - reviews.length, 50)));
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${input.accessToken}` },
      });
      if (!res.ok) {
        return { ok: false, status: res.status, error: await readError(res) };
      }
      const json = (await res.json()) as {
        reviews?: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };
      for (const r of json.reviews ?? []) {
        const reviewer = (r.reviewer ?? {}) as Record<string, unknown>;
        const reply = r.reviewReply as Record<string, unknown> | undefined;
        reviews.push({
          reviewName: String(r.name ?? ""),
          authorName:
            typeof reviewer.displayName === "string" ? reviewer.displayName : null,
          comment: typeof r.comment === "string" ? r.comment : null,
          starRating: starToNumber(r.starRating),
          createTime: typeof r.createTime === "string" ? r.createTime : null,
          updateTime: typeof r.updateTime === "string" ? r.updateTime : null,
          hasReply: Boolean(reply && reply.comment),
        });
      }
      pageToken = json.nextPageToken;
    } while (pageToken && reviews.length < cap);

    return { ok: true, reviews: reviews.filter((r) => r.reviewName) };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Failed to fetch Google reviews",
    };
  }
}

/** Post/replace the owner reply on a review. `reviewName` is the full resource name. */
export async function replyToGbpReview(input: {
  accessToken: string;
  reviewName: string;
  comment: string;
}): Promise<GbpReplyResult> {
  try {
    const res = await fetch(`${GBP_API_BASE}/${input.reviewName}/reply`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: input.comment }),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: await readError(res) };
    }
    // reply resource has no separate id; the review name is the anchor.
    return { ok: true, externalReplyId: `${input.reviewName}/reply` };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Failed to post review reply",
    };
  }
}

/**
 * Q&A answers use the separate Business Profile Q&A API
 * (mybusinessqanda.googleapis.com). Not wired yet — reviews are the priority.
 */
export async function replyToGbpQuestion(_input: {
  accessToken: string;
  questionName: string;
  comment: string;
}): Promise<GbpReplyResult> {
  return {
    ok: false,
    status: 501,
    error:
      "GBP Q&A reply API is not wired yet — review replies are supported. Q&A uses the separate mybusinessqanda API.",
  };
}
