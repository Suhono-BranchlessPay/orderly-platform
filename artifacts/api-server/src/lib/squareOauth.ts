/**
 * Blok 3.1 — REAL Square OAuth for self-serve onboarding + dashboard reconnect.
 *
 * The restaurant authorizes Square themselves via Square's hosted consent
 * page; Orderly never sees their Square password and no human ever
 * copy/pastes their access token. Platform Square APP credentials (the
 * Orderly Square *application*, not a merchant token) come from env only —
 * see docs/SELF_SERVE_ONBOARDING.md.
 *
 * Tokens are always encrypted at rest (lib/tokenCrypto.ts, AES-256-GCM)
 * before being written to square_oauth_connections. This module never writes
 * plaintext tokens anywhere, and never touches the existing Samurai/manual
 * env-token charge flow in integrations/square.ts (that remains the
 * preferred, unchanged path — this is a fallback for OAuth-onboarded
 * tenants).
 *
 * Dashboard path: signed state binds callback → tenant_id (no onboarding
 * session). Synthetic onboarding_session_id = `dashboard:<tenantId>`.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { desc, eq } from "drizzle-orm";
import {
  db,
  squareOauthConnectionsTable,
  tenantsTable,
  type SquareOauthConnection,
} from "@workspace/db";
import {
  decryptToken,
  encryptToken,
  getTokenEncryptionKey,
  isTokenEncryptionConfigured,
} from "./tokenCrypto";

const TENANT_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stateSecret(): Buffer {
  const key = getTokenEncryptionKey();
  if (!key) throw new Error("ORDERLY_TOKEN_ENCRYPTION_KEY is not set");
  return key;
}

/** Opaque state for dashboard Connect Square (binds callback to tenant). */
export function signSquareTenantOauthState(tenantId: string): string {
  const payload = b64url(
    JSON.stringify({ t: tenantId, ts: Date.now(), v: "sq-tenant" }),
  );
  const sig = createHmac("sha256", stateSecret()).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

export function verifySquareTenantOauthState(
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
      Buffer.from(
        payload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as { t?: string; ts?: number; v?: string };
    if (!decoded.t || typeof decoded.ts !== "number" || decoded.v !== "sq-tenant") {
      return { ok: false, error: "OAuth state payload invalid." };
    }
    if (Date.now() - decoded.ts > TENANT_STATE_MAX_AGE_MS) {
      return {
        ok: false,
        error: "OAuth state expired — please try connecting again.",
      };
    }
    return { ok: true, tenantId: decoded.t };
  } catch {
    return { ok: false, error: "OAuth state payload could not be decoded." };
  }
}

export function dashboardSquareSessionKey(tenantId: string): string {
  return `dashboard:${tenantId}`;
}

const SQUARE_API_VERSION = "2024-11-20";

/**
 * Square's documented OAuth permission names (see
 * https://developer.squareup.com/docs/oauth-api/square-permissions). Only
 * scopes Orderly actually needs for order-taking + catalog reads/writes.
 */
export const SQUARE_OAUTH_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "MERCHANT_PROFILE_WRITE",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
  "ITEMS_READ",
  /** Daily AI report — Square Reporting API (POST /reporting/v1/load). */
  "REPORTING_READ",
  /** Part 3 — Square Gift Cards (compliance issuer). */
  "GIFTCARDS_READ",
  "GIFTCARDS_WRITE",
] as const;

export function squareOauthEnvironment(): "sandbox" | "production" {
  return process.env.SQUARE_OAUTH_ENVIRONMENT?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

function squareOauthBaseUrl(environment?: string): string {
  return (environment ?? squareOauthEnvironment()) === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export type SquareOauthAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
  baseUrl: string;
};

/**
 * Null (never throws) when the platform Square app is not configured — the
 * route layer turns that into a clear 503, not a silent failure.
 */
export function getSquareOauthAppConfig(): SquareOauthAppConfig | null {
  const clientId = process.env.SQUARE_OAUTH_APPLICATION_ID?.trim();
  const clientSecret = process.env.SQUARE_OAUTH_APPLICATION_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    process.env.SQUARE_OAUTH_REDIRECT_URI?.trim() ||
    "https://samurairesto.com/api/onboarding/square/callback";
  const environment = squareOauthEnvironment();
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment,
    baseUrl: squareOauthBaseUrl(environment),
  };
}

export type SquareOauthReadiness =
  | { ok: true }
  | { ok: false; error: string };

/** Shared 503 guard for both /square/start and /square/callback. */
export function checkSquareOauthReadiness(): SquareOauthReadiness {
  if (!getSquareOauthAppConfig()) {
    return {
      ok: false,
      error:
        "Square OAuth is not configured on this server. Set SQUARE_OAUTH_APPLICATION_ID and SQUARE_OAUTH_APPLICATION_SECRET.",
    };
  }
  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "Token encryption is not configured on this server. Set ORDERLY_TOKEN_ENCRYPTION_KEY (32+ bytes) before connecting Square.",
    };
  }
  return { ok: true };
}

export function buildSquareAuthorizeUrl(state: string): string {
  const config = getSquareOauthAppConfig();
  if (!config) {
    throw new Error("Square OAuth app credentials are not configured");
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: SQUARE_OAUTH_SCOPES.join(" "),
    session: "false",
    state,
  });
  return `${config.baseUrl}/oauth2/authorize?${params.toString()}`;
}

type SquareTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_at?: string;
  merchant_id: string;
  refresh_token?: string;
};

async function exchangeCodeForToken(code: string): Promise<SquareTokenResponse> {
  const config = getSquareOauthAppConfig();
  if (!config) {
    throw new Error("Square OAuth app credentials are not configured");
  }
  const response = await fetch(`${config.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Square OAuth token exchange failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as SquareTokenResponse;
}

type SquareLocation = {
  id: string;
  name?: string;
  status?: string;
};

async function listSquareLocations(
  accessToken: string,
  environment: string,
): Promise<SquareLocation[]> {
  const response = await fetch(`${squareOauthBaseUrl(environment)}/v2/locations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": SQUARE_API_VERSION,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Square locations lookup failed (${response.status}): ${text}`);
  }
  const data = JSON.parse(text) as { locations?: SquareLocation[] };
  return data.locations ?? [];
}

export type SquareOauthExchangeResult = {
  merchantId: string;
  locationId: string;
  locationName: string | null;
  scopes: string;
  environment: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
};

/**
 * Full server-side half of the OAuth dance: exchange the authorization code,
 * then pick the merchant's first ACTIVE location. Throws with a
 * human-readable message on any failure — callers turn that into a 502/503,
 * never a silent success.
 */
export async function completeSquareOauthExchange(
  code: string,
): Promise<SquareOauthExchangeResult> {
  const environment = squareOauthEnvironment();
  const tokenData = await exchangeCodeForToken(code);
  const locations = await listSquareLocations(tokenData.access_token, environment);
  const activeLocation =
    locations.find((loc) => (loc.status ?? "ACTIVE") === "ACTIVE") ?? locations[0];
  if (!activeLocation) {
    throw new Error("This Square account has no locations Orderly can use.");
  }

  return {
    merchantId: tokenData.merchant_id,
    locationId: activeLocation.id,
    locationName: activeLocation.name ?? null,
    scopes: SQUARE_OAUTH_SCOPES.join(" "),
    environment,
    accessTokenEnc: encryptToken(tokenData.access_token),
    refreshTokenEnc: tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : null,
    accessTokenExpiresAt: tokenData.expires_at
      ? new Date(tokenData.expires_at)
      : null,
  };
}

/**
 * One connection row per onboarding session. Reconnecting (e.g. the
 * restaurant re-runs the wizard) replaces the stored tokens rather than
 * accumulating duplicate rows.
 */
export async function saveSquareOauthConnection(input: {
  onboardingSessionId: string;
  exchange: SquareOauthExchangeResult;
}): Promise<SquareOauthConnection> {
  const { onboardingSessionId, exchange } = input;
  const existing = await db
    .select()
    .from(squareOauthConnectionsTable)
    .where(eq(squareOauthConnectionsTable.onboardingSessionId, onboardingSessionId))
    .limit(1);
  const now = new Date();
  const meta = {
    locationName: exchange.locationName,
    connectedVia: "self_serve_oauth",
  };

  if (existing[0]) {
    const updated: SquareOauthConnection = {
      ...existing[0],
      merchantId: exchange.merchantId,
      locationId: exchange.locationId,
      accessTokenEnc: exchange.accessTokenEnc,
      refreshTokenEnc: exchange.refreshTokenEnc,
      accessTokenExpiresAt: exchange.accessTokenExpiresAt,
      scopes: exchange.scopes,
      environment: exchange.environment,
      meta,
      updatedAt: now,
    };
    await db
      .update(squareOauthConnectionsTable)
      .set({
        merchantId: updated.merchantId,
        locationId: updated.locationId,
        accessTokenEnc: updated.accessTokenEnc,
        refreshTokenEnc: updated.refreshTokenEnc,
        accessTokenExpiresAt: updated.accessTokenExpiresAt,
        scopes: updated.scopes,
        environment: updated.environment,
        meta: updated.meta,
        updatedAt: updated.updatedAt,
      })
      .where(eq(squareOauthConnectionsTable.id, existing[0].id));
    return updated;
  }

  const id = randomUUID();
  const row: SquareOauthConnection = {
    id,
    onboardingSessionId,
    tenantId: null,
    merchantId: exchange.merchantId,
    locationId: exchange.locationId,
    accessTokenEnc: exchange.accessTokenEnc,
    refreshTokenEnc: exchange.refreshTokenEnc,
    accessTokenExpiresAt: exchange.accessTokenExpiresAt,
    scopes: exchange.scopes,
    environment: exchange.environment,
    meta,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(squareOauthConnectionsTable).values(row);
  return row;
}

export async function getSquareOauthConnectionForSession(
  onboardingSessionId: string,
): Promise<SquareOauthConnection | null> {
  const rows = await db
    .select()
    .from(squareOauthConnectionsTable)
    .where(eq(squareOauthConnectionsTable.onboardingSessionId, onboardingSessionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Dashboard Connect Square for an existing tenant — upsert by synthetic
 * onboarding_session_id `dashboard:<tenantId>` and set tenant_id immediately.
 */
export async function saveSquareOauthConnectionForTenant(input: {
  tenantId: string;
  exchange: SquareOauthExchangeResult;
}): Promise<SquareOauthConnection> {
  const sessionKey = dashboardSquareSessionKey(input.tenantId);
  const exchange = input.exchange;
  const existing = await db
    .select()
    .from(squareOauthConnectionsTable)
    .where(eq(squareOauthConnectionsTable.onboardingSessionId, sessionKey))
    .limit(1);
  const now = new Date();
  const meta = {
    locationName: exchange.locationName,
    connectedVia: "dashboard_square_oauth",
  };

  if (existing[0]) {
    await db
      .update(squareOauthConnectionsTable)
      .set({
        tenantId: input.tenantId,
        merchantId: exchange.merchantId,
        locationId: exchange.locationId,
        accessTokenEnc: exchange.accessTokenEnc,
        refreshTokenEnc: exchange.refreshTokenEnc,
        accessTokenExpiresAt: exchange.accessTokenExpiresAt,
        scopes: exchange.scopes,
        environment: exchange.environment,
        meta,
        updatedAt: now,
      })
      .where(eq(squareOauthConnectionsTable.id, existing[0].id));
    return {
      ...existing[0],
      tenantId: input.tenantId,
      merchantId: exchange.merchantId,
      locationId: exchange.locationId,
      accessTokenEnc: exchange.accessTokenEnc,
      refreshTokenEnc: exchange.refreshTokenEnc,
      accessTokenExpiresAt: exchange.accessTokenExpiresAt,
      scopes: exchange.scopes,
      environment: exchange.environment,
      meta,
      updatedAt: now,
    };
  }

  const row: SquareOauthConnection = {
    id: randomUUID(),
    onboardingSessionId: sessionKey,
    tenantId: input.tenantId,
    merchantId: exchange.merchantId,
    locationId: exchange.locationId,
    accessTokenEnc: exchange.accessTokenEnc,
    refreshTokenEnc: exchange.refreshTokenEnc,
    accessTokenExpiresAt: exchange.accessTokenExpiresAt,
    scopes: exchange.scopes,
    environment: exchange.environment,
    meta,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(squareOauthConnectionsTable).values(row);
  return row;
}

export async function getSquareOauthConnectionForTenant(
  tenantId: string,
): Promise<SquareOauthConnection | null> {
  const rows = await db
    .select()
    .from(squareOauthConnectionsTable)
    .where(eq(squareOauthConnectionsTable.tenantId, tenantId))
    .orderBy(desc(squareOauthConnectionsTable.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Called from the /publish path once a real tenant row exists. */
export async function linkSquareOauthConnectionToTenant(
  onboardingSessionId: string,
  tenantId: string,
): Promise<void> {
  await db
    .update(squareOauthConnectionsTable)
    .set({ tenantId, updatedAt: new Date() })
    .where(eq(squareOauthConnectionsTable.onboardingSessionId, onboardingSessionId));
}

export type ResolvedDbSquareCreds = {
  accessToken: string;
  locationId: string;
  merchantId: string;
  environment: string;
};

/**
 * Runtime credential fallback for tenants onboarded via real Square OAuth
 * instead of manually-issued env tokens. Callers MUST try the existing
 * env-based tenantSecret() path first — this only runs when that returns
 * nothing, so tenants with env tokens (e.g. Samurai) never hit the DB here.
 */
export async function resolveSquareCredsFromDb(
  slug: string,
): Promise<ResolvedDbSquareCreds | null> {
  if (!slug) return null;
  try {
    const tenantRows = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug))
      .limit(1);
    const tenantId = tenantRows[0]?.id;
    if (!tenantId) return null;

    const rows = await db
      .select()
      .from(squareOauthConnectionsTable)
      .where(eq(squareOauthConnectionsTable.tenantId, tenantId))
      .orderBy(desc(squareOauthConnectionsTable.updatedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const accessToken = decryptToken(row.accessTokenEnc);
    return {
      accessToken,
      locationId: row.locationId,
      merchantId: row.merchantId,
      environment: row.environment,
    };
  } catch (err) {
    console.error("[squareOauth] resolveSquareCredsFromDb failed:", err);
    return null;
  }
}
