/**
 * Google Search Console Search Analytics for the daily report.
 * Never invents positions — honest empty / warming-up states only.
 * Map Pack is GBP API (still quota-blocked) — note only, no empty columns.
 */
import { eq } from "drizzle-orm";
import { db, gscOauthConnectionsTable } from "@workspace/db";
import { decryptToken, isTokenEncryptionConfigured } from "./tokenCrypto";
import { logger } from "./logger";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscDailyReportSlice = {
  connected: boolean;
  siteUrl: string | null;
  window: { startDate: string; endDate: string } | null;
  /** Honest status for UI. */
  status:
    | "connected"
    | "not_connected"
    | "warming_up"
    | "no_data"
    | "error";
  note: string;
  topQueries: GscQueryRow[];
  opportunities: GscQueryRow[];
  /** Position deltas vs prior week when both windows have the query. */
  movers: Array<GscQueryRow & { prevPosition: number; delta: number }>;
  mapPackNote: string;
};

function emptySlice(
  partial: Partial<GscDailyReportSlice> & Pick<GscDailyReportSlice, "status" | "note">,
): GscDailyReportSlice {
  return {
    connected: false,
    siteUrl: null,
    window: null,
    topQueries: [],
    opportunities: [],
    movers: [],
    mapPackNote:
      "Map Pack rankings need Google Business Profile API access (still blocked on quota/allow-list). Coming after GBP access — not shown as empty columns.",
    ...partial,
  };
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d, 12, 0, 0) + delta * 24 * 60 * 60 * 1000;
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function mintAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "GSC token refresh failed");
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function querySearchAnalytics(input: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
}): Promise<GscQueryRow[]> {
  const encoded = encodeURIComponent(input.siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["query"],
      rowLimit: 50,
      startRow: 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GSC query ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    rows?: Array<{
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
  };
  return (json.rows ?? [])
    .map((r) => ({
      query: String(r.keys?.[0] ?? "").trim(),
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      ctr: Number(r.ctr ?? 0),
      position: Number(r.position ?? 0),
    }))
    .filter((r) => r.query.length > 0);
}

/**
 * Weekly GSC slice ending on reportDate. Never invents rankings.
 */
export async function fetchGscDailyReportSlice(input: {
  tenantId: string;
  siteUrl: string;
  reportDate: string;
}): Promise<GscDailyReportSlice> {
  const mapPackNote =
    "Map Pack rankings need Google Business Profile API access (still blocked on quota/allow-list). Coming after GBP access — not shown as empty columns.";

  const [conn] = await db
    .select()
    .from(gscOauthConnectionsTable)
    .where(eq(gscOauthConnectionsTable.tenantId, input.tenantId))
    .limit(1);

  if (!conn) {
    return emptySlice({
      status: "not_connected",
      note: "Search Console is not connected for this restaurant yet. Connect GSC OAuth (per-tenant property) to show real query positions. Until then we do not invent rankings.",
      mapPackNote,
      siteUrl: input.siteUrl,
    });
  }

  if (!isTokenEncryptionConfigured()) {
    return emptySlice({
      connected: true,
      status: "error",
      note: "GSC is connected but token decryption is not configured on this server.",
      siteUrl: conn.siteUrl,
      mapPackNote,
    });
  }

  let refreshPlain: string;
  try {
    refreshPlain = decryptToken(conn.refreshTokenEnc);
  } catch (err) {
    logger.warn({ err }, "GSC decrypt failed");
    return emptySlice({
      connected: true,
      status: "error",
      note: "Could not decrypt the GSC refresh token.",
      siteUrl: conn.siteUrl,
      mapPackNote,
    });
  }

  const access = await mintAccessToken(refreshPlain);
  if (!access) {
    return emptySlice({
      connected: true,
      status: "error",
      note: "Could not refresh the GSC access token. Re-connect Search Console OAuth.",
      siteUrl: conn.siteUrl,
      mapPackNote,
    });
  }

  const endDate = input.reportDate;
  const startDate = addDays(endDate, -6);
  const prevEnd = addDays(startDate, -1);
  const prevStart = addDays(prevEnd, -6);
  const window = { startDate, endDate };

  try {
    const [thisWeek, lastWeek] = await Promise.all([
      querySearchAnalytics({
        accessToken: access,
        siteUrl: conn.siteUrl,
        startDate,
        endDate,
      }),
      querySearchAnalytics({
        accessToken: access,
        siteUrl: conn.siteUrl,
        startDate: prevStart,
        endDate: prevEnd,
      }),
    ]);

    if (!thisWeek.length) {
      const dataSince = conn.dataSince || "2026-07-17";
      return emptySlice({
        connected: true,
        status: "warming_up",
        siteUrl: conn.siteUrl,
        window,
        mapPackNote,
        note:
          `No Search Analytics rows yet for ${startDate}→${endDate}. ` +
          `GSC data for this property started around ${dataSince}. Google typically needs 4–8 weeks before rankings look stable — we will not invent positions meanwhile.`,
      });
    }

    if (!conn.dataSince) {
      await db
        .update(gscOauthConnectionsTable)
        .set({ dataSince: startDate, updatedAt: new Date() })
        .where(eq(gscOauthConnectionsTable.tenantId, input.tenantId));
    }

    // Min impressions: a single lucky impression at pos 1.0 is chance, not rank.
    const TOP_POSITION_MIN_IMPRESSIONS = 10;
    const topQueries = [...thisWeek]
      .filter(
        (r) =>
          r.impressions >= TOP_POSITION_MIN_IMPRESSIONS &&
          r.position > 0 &&
          r.position <= 10,
      )
      .sort((a, b) => a.position - b.position || b.impressions - a.impressions)
      .slice(0, 5);

    const opportunities = [...thisWeek]
      .filter((r) => r.impressions >= 10 && r.position >= 5 && r.position <= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    const prevByQuery = new Map(lastWeek.map((r) => [r.query.toLowerCase(), r]));
    const movers = thisWeek
      .map((r) => {
        const prev = prevByQuery.get(r.query.toLowerCase());
        if (!prev || !prev.position || !r.position) return null;
        const delta = prev.position - r.position; // positive = improved
        if (Math.abs(delta) < 1.5) return null;
        return { ...r, prevPosition: prev.position, delta };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);

    return {
      connected: true,
      siteUrl: conn.siteUrl,
      window,
      status: "connected",
      note: `Search Analytics ${startDate}→${endDate} (facts only). Positions are averages from Google — never estimated.`,
      topQueries,
      opportunities,
      movers,
      mapPackNote,
    };
  } catch (err) {
    logger.warn({ err }, "GSC search analytics failed");
    return emptySlice({
      connected: true,
      status: "error",
      siteUrl: conn.siteUrl,
      window,
      mapPackNote,
      note: `GSC API error: ${err instanceof Error ? err.message.slice(0, 160) : "unknown"}`,
    });
  }
}

export const GSC_OAUTH_SCOPES = [GSC_SCOPE] as const;
