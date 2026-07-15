/**
 * Blok 4.2 Stage 2 — REAL Google OAuth for Google Business Profile.
 *
 * The restaurant (or Malik on their behalf) authorizes Google via Google's
 * hosted consent screen; Orderly never sees the Google password and no human
 * copy/pastes a long-lived token. The offline refresh token that comes back is
 * ALWAYS encrypted at rest (lib/tokenCrypto.ts, AES-256-GCM) before being
 * written to gbp_oauth_connections. Short-lived access tokens are minted from
 * it in memory (lib/gbpConfig.ts) and never persisted.
 *
 * OPS PREREQUISITE (external, cannot be coded away): the Business Profile APIs
 * (mybusiness*) are allow-listed by Google. Until the GCP project is approved,
 * listing reviews / posting replies returns 403 even with a valid token. The
 * OAuth connect + token storage below still work and are ready the moment
 * Google approves the project. See docs/BLOK4_GBP_TRIAL.md.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  gbpOauthConnectionsTable,
  type GbpOauthConnection,
} from "@workspace/db";
import {
  encryptToken,
  getTokenEncryptionKey,
  isTokenEncryptionConfigured,
} from "./tokenCrypto";

/** Only the scope Orderly needs to read reviews and post owner replies. */
export const GBP_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
] as const;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GBP_ACCOUNTS_URL =
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const GBP_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export type GoogleOauthAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Null (never throws) when the platform Google app is not configured. */
export function getGoogleOauthAppConfig(): GoogleOauthAppConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    process.env.GBP_OAUTH_REDIRECT_URI?.trim() ||
    "https://samurairesto.com/api/gbp/oauth/callback";
  return { clientId, clientSecret, redirectUri };
}

export type GbpOauthReadiness = { ok: true } | { ok: false; error: string };

/** Shared 503 guard for both /oauth/start and /oauth/callback. */
export function checkGbpOauthReadiness(): GbpOauthReadiness {
  if (!getGoogleOauthAppConfig()) {
    return {
      ok: false,
      error:
        "Google OAuth is not configured on this server. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
    };
  }
  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "Token encryption is not configured on this server. Set ORDERLY_TOKEN_ENCRYPTION_KEY (32+ bytes) before connecting Google.",
    };
  }
  return { ok: true };
}

// --- Signed state (binds the callback to a tenant without a DB row) ----------

function stateSecret(): Buffer {
  const key = getTokenEncryptionKey();
  if (!key) throw new Error("ORDERLY_TOKEN_ENCRYPTION_KEY is not set");
  return key;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Opaque, tamper-proof state that encodes the tenant + a timestamp. */
export function signGbpOauthState(tenantId: string): string {
  const payload = b64url(JSON.stringify({ t: tenantId, ts: Date.now() }));
  const sig = createHmac("sha256", stateSecret()).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

export function verifyGbpOauthState(
  state: string | undefined | null,
): { ok: true; tenantId: string } | { ok: false; error: string } {
  if (!state || typeof state !== "string" || !state.includes(".")) {
    return { ok: false, error: "Missing or malformed OAuth state." };
  }
  const [payload, sig] = state.split(".", 2);
  if (!payload || !sig) return { ok: false, error: "Malformed OAuth state." };
  const expected = b64url(
    createHmac("sha256", stateSecret()).update(payload).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "OAuth state signature mismatch." };
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { t?: string; ts?: number };
    if (!decoded.t || typeof decoded.ts !== "number") {
      return { ok: false, error: "OAuth state payload invalid." };
    }
    if (Date.now() - decoded.ts > STATE_MAX_AGE_MS) {
      return { ok: false, error: "OAuth state expired — please try connecting again." };
    }
    return { ok: true, tenantId: decoded.t };
  } catch {
    return { ok: false, error: "OAuth state payload could not be decoded." };
  }
}

// --- Authorize URL -----------------------------------------------------------

export function buildGoogleAuthorizeUrl(state: string): string {
  const config = getGoogleOauthAppConfig();
  if (!config) throw new Error("Google OAuth app credentials are not configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [...GBP_OAUTH_SCOPES, "openid", "email"].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent", // force a refresh_token even on re-consent
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// --- Token exchange ----------------------------------------------------------

export type GbpTokenExchange = {
  refreshToken: string | null;
  accessToken: string;
  scope: string;
};

export async function exchangeCodeForGbpTokens(
  code: string,
): Promise<GbpTokenExchange> {
  const config = getGoogleOauthAppConfig();
  if (!config) throw new Error("Google OAuth app credentials are not configured");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!json.access_token) {
    throw new Error("Google OAuth token exchange returned no access_token.");
  }
  return {
    refreshToken: json.refresh_token ?? null,
    accessToken: json.access_token,
    scope: json.scope ?? GBP_OAUTH_SCOPES.join(" "),
  };
}

/** Best-effort — display only. Never throws. */
export async function fetchGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort discovery of the first account + location so review sync works
 * without a manually-set GBP_LOCATION_RESOURCE. Returns nulls (never throws)
 * when the Business Profile API is not yet allow-listed (403) — the refresh
 * token is still saved and the location can be set later.
 */
export async function discoverGbpLocation(accessToken: string): Promise<{
  accountResource: string | null;
  locationResource: string | null;
}> {
  const empty = { accountResource: null, locationResource: null };
  try {
    const accRes = await fetch(GBP_ACCOUNTS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!accRes.ok) return empty;
    const accJson = (await accRes.json()) as {
      accounts?: Array<{ name?: string }>;
    };
    const account = accJson.accounts?.find((a) => a.name)?.name;
    if (!account) return empty;

    const locUrl = new URL(`${GBP_INFO_BASE}/${account}/locations`);
    locUrl.searchParams.set("readMask", "name,title");
    locUrl.searchParams.set("pageSize", "10");
    const locRes = await fetch(locUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!locRes.ok) return { accountResource: account, locationResource: null };
    const locJson = (await locRes.json()) as {
      locations?: Array<{ name?: string }>;
    };
    const location = locJson.locations?.find((l) => l.name)?.name; // "locations/123"
    if (!location) return { accountResource: account, locationResource: null };
    return {
      accountResource: account,
      locationResource: `${account}/${location}`,
    };
  } catch {
    return empty;
  }
}

// --- Persistence -------------------------------------------------------------

export async function saveGbpOauthConnection(input: {
  tenantId: string;
  refreshToken: string;
  accountResource: string | null;
  locationResource: string | null;
  googleEmail: string | null;
  scopes: string;
}): Promise<GbpOauthConnection> {
  const now = new Date();
  const refreshTokenEnc = encryptToken(input.refreshToken);
  const existing = await getGbpOauthConnection(input.tenantId);

  if (existing) {
    const updated: GbpOauthConnection = {
      ...existing,
      refreshTokenEnc,
      // Keep a previously-discovered location if this pass could not discover one.
      accountResource: input.accountResource ?? existing.accountResource,
      locationResource: input.locationResource ?? existing.locationResource,
      googleEmail: input.googleEmail ?? existing.googleEmail,
      scopes: input.scopes,
      meta: { ...existing.meta, connectedVia: "self_serve_oauth" },
      updatedAt: now,
    };
    await db
      .update(gbpOauthConnectionsTable)
      .set({
        refreshTokenEnc: updated.refreshTokenEnc,
        accountResource: updated.accountResource,
        locationResource: updated.locationResource,
        googleEmail: updated.googleEmail,
        scopes: updated.scopes,
        meta: updated.meta,
        updatedAt: updated.updatedAt,
      })
      .where(eq(gbpOauthConnectionsTable.id, existing.id));
    return updated;
  }

  const row: GbpOauthConnection = {
    id: randomUUID(),
    tenantId: input.tenantId,
    accountResource: input.accountResource,
    locationResource: input.locationResource,
    googleEmail: input.googleEmail,
    refreshTokenEnc,
    scopes: input.scopes,
    meta: { connectedVia: "self_serve_oauth" },
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(gbpOauthConnectionsTable).values(row);
  return row;
}

export async function getGbpOauthConnection(
  tenantId: string,
): Promise<GbpOauthConnection | null> {
  if (!tenantId) return null;
  const rows = await db
    .select()
    .from(gbpOauthConnectionsTable)
    .where(eq(gbpOauthConnectionsTable.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/** True when a self-serve OAuth connection exists for this tenant. */
export async function hasGbpOauthConnection(tenantId: string): Promise<boolean> {
  return (await getGbpOauthConnection(tenantId)) !== null;
}
