/**
 * Blok 4.2 — Google Business Profile trial config.
 *
 * Access tokens are resolved in this order (first hit wins):
 *   1. GBP_ACCESS_TOKEN (manual short-lived paste — env)
 *   2. GBP_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID/SECRET (env offline token)
 *   3. A self-serve OAuth connection in gbp_oauth_connections (Stage 2) —
 *      the refresh token there is encrypted at rest (lib/tokenCrypto.ts).
 * Minted access tokens live in-memory only; refresh tokens from env are never
 * persisted. See docs/BLOK4_GBP_TRIAL.md.
 */
import { tenantSecret } from "./tenant";
import { getGbpOauthConnection } from "./gbpOauth";
import { decryptToken } from "./tokenCrypto";

/** Hard-coded trial allow-list (same as social 4.1). */
export const GBP_TRIAL_TENANT_IDS = ["samurai"] as const;

export function isGbpTrialTenant(tenantId: string | null | undefined): boolean {
  return Boolean(tenantId) && (GBP_TRIAL_TENANT_IDS as readonly string[]).includes(tenantId as string);
}

export function isGbpKillSwitchOn(tenantId: string): boolean {
  const key = `GBP_KILL_SWITCH_${tenantId.toUpperCase()}`;
  return process.env[key]?.trim() === "1";
}

/** Global off-by-default send gate. */
export function isGbpSendGloballyEnabled(): boolean {
  return process.env.GBP_SEND_ENABLED?.trim() === "1";
}

/** Auto-draft each freshly ingested review/question. ON by default (still human-approve). */
export function isGbpAutoDraftEnabled(): boolean {
  const v = process.env.GBP_AUTO_DRAFT_ENABLED?.trim();
  return v !== "0" && v !== "false";
}

/**
 * Google Business Profile location resource for a tenant, e.g.
 * "accounts/1234567890/locations/9876543210". Used to list reviews.
 */
export function getGbpLocationResource(tenantId: string): string | undefined {
  return tenantSecret(tenantId, "GBP_LOCATION_RESOURCE");
}

/** Per-tenant then global GBP OAuth access token (manual/short-lived override). */
export function getGbpAccessToken(tenantId: string): string | undefined {
  return tenantSecret(tenantId, "GBP_ACCESS_TOKEN");
}

/** Long-lived OAuth refresh token (obtained once via the offline consent flow). */
function getGbpRefreshToken(tenantId: string): string | undefined {
  return tenantSecret(tenantId, "GBP_REFRESH_TOKEN");
}

function getGoogleOAuthClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// Short-lived access tokens minted from the refresh token, cached in-memory.
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Exchange a refresh token for a short-lived access token (cached per key). */
async function mintAccessTokenFromRefresh(
  cacheKey: string,
  refreshToken: string,
): Promise<string | undefined> {
  const client = getGoogleOAuthClient();
  if (!client) return undefined;

  const now = Date.now();
  const cached = accessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return undefined;
    const expiresAt = now + (json.expires_in ?? 3600) * 1000;
    accessTokenCache.set(cacheKey, { token: json.access_token, expiresAt });
    return json.access_token;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a usable Google access token for a tenant. Tries (in order): manual
 * env token, env refresh token, then the self-serve OAuth connection (DB).
 * Returns undefined when nothing is configured (send/sync then 501).
 */
export async function resolveGbpAccessToken(tenantId: string): Promise<string | undefined> {
  const manual = getGbpAccessToken(tenantId);
  if (manual) return manual;

  const envRefresh = getGbpRefreshToken(tenantId);
  if (envRefresh) {
    const tok = await mintAccessTokenFromRefresh(`${tenantId}:env`, envRefresh);
    if (tok) return tok;
  }

  try {
    const conn = await getGbpOauthConnection(tenantId);
    if (conn?.refreshTokenEnc) {
      const refresh = decryptToken(conn.refreshTokenEnc);
      const tok = await mintAccessTokenFromRefresh(`${tenantId}:db`, refresh);
      if (tok) return tok;
    }
  } catch {
    /* non-fatal — treated as "no token" (501 upstream) */
  }

  return undefined;
}

/**
 * Resolve the Business Profile location resource for a tenant. Prefers the
 * env override, then the self-serve OAuth connection discovered at connect time.
 */
export async function resolveGbpLocationResource(
  tenantId: string,
): Promise<string | undefined> {
  const envLoc = getGbpLocationResource(tenantId);
  if (envLoc) return envLoc;
  try {
    const conn = await getGbpOauthConnection(tenantId);
    if (conn?.locationResource) return conn.locationResource;
  } catch {
    /* non-fatal */
  }
  return undefined;
}

/**
 * Map Google Business Profile location resource name / id → tenant.
 * Example: {"locations/12345":"samurai"} or {"12345":"samurai"}
 */
export function resolveTenantIdForGbpLocation(
  locationId: string | null | undefined,
): string {
  const raw = process.env.GBP_LOCATION_ID_TENANT_MAP_JSON?.trim();
  if (raw && locationId) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const hit = map[locationId] || map[locationId.replace(/^locations\//, "")];
      if (hit && typeof hit === "string") return hit.trim();
    } catch {
      /* ignore bad JSON */
    }
  }
  return process.env.GBP_DEFAULT_TENANT_ID?.trim() || "samurai";
}

export async function buildGbpHealth(tenantIds: readonly string[]) {
  const oauthAppConfigured = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
  );
  const tenants = await Promise.all(
    tenantIds.map(async (tenant_id) => {
      let dbConnected = false;
      let dbGoogleEmail: string | null = null;
      let dbLocation: string | null = null;
      try {
        const conn = await getGbpOauthConnection(tenant_id);
        dbConnected = Boolean(conn?.refreshTokenEnc);
        dbGoogleEmail = conn?.googleEmail ?? null;
        dbLocation = conn?.locationResource ?? null;
      } catch {
        /* non-fatal — report as not connected */
      }
      return {
        tenant_id,
        kill_switch: isGbpKillSwitchOn(tenant_id),
        send_globally_enabled: isGbpSendGloballyEnabled(),
        gbp_token_configured: Boolean(getGbpAccessToken(tenant_id)),
        gbp_oauth_configured: Boolean(
          tenantSecret(tenant_id, "GBP_REFRESH_TOKEN") && oauthAppConfigured,
        ),
        // Self-serve OAuth connection (Stage 2).
        oauth_app_configured: oauthAppConfigured,
        oauth_connected: dbConnected,
        google_email: dbGoogleEmail,
        gbp_location_configured: Boolean(
          getGbpLocationResource(tenant_id) || dbLocation,
        ),
        trial: isGbpTrialTenant(tenant_id),
      };
    }),
  );
  return {
    send_globally_enabled: isGbpSendGloballyEnabled(),
    auto_draft_enabled: isGbpAutoDraftEnabled(),
    oauth_app_configured: oauthAppConfigured,
    tenants,
  };
}
