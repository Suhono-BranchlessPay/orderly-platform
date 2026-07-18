/**
 * Google Search Console OAuth (per-tenant property).
 * Reuses GOOGLE_OAUTH_CLIENT_ID/SECRET; separate redirect + encrypted refresh token.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, gscOauthConnectionsTable } from "@workspace/db";
import { encryptToken, isTokenEncryptionConfigured } from "./tokenCrypto";
import { GSC_OAUTH_SCOPES } from "./gscAnalytics";
import { getGoogleOauthAppConfig } from "./gbpOauth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function redirectUri(): string {
  return (
    process.env.GSC_OAUTH_REDIRECT_URI?.trim() ||
    "https://samurairesto.com/api/gsc/oauth/callback"
  );
}

export function checkGscOauthReadiness():
  | { ok: true }
  | { ok: false; error: string } {
  if (!getGoogleOauthAppConfig()) {
    return {
      ok: false,
      error:
        "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
    };
  }
  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      error: "Set ORDERLY_TOKEN_ENCRYPTION_KEY before connecting Search Console.",
    };
  }
  return { ok: true };
}

function signState(payload: string): string {
  const secret =
    process.env.ORDERLY_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    "gsc-state";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function buildGscOauthStartUrl(input: {
  tenantId: string;
  siteUrl: string;
}): string {
  const cfg = getGoogleOauthAppConfig();
  if (!cfg) throw new Error("Google OAuth not configured");
  const ts = Date.now().toString(36);
  const raw = `${input.tenantId}|${input.siteUrl}|${ts}`;
  const state = `${Buffer.from(raw).toString("base64url")}.${signState(raw)}`;
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GSC_OAUTH_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

export function parseGscOauthState(
  state: string,
): { tenantId: string; siteUrl: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const raw = Buffer.from(body, "base64url").toString("utf8");
  const expect = signState(raw);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [tenantId, siteUrl, ts36] = raw.split("|");
  if (!tenantId || !siteUrl || !ts36) return null;
  const ts = parseInt(ts36, 36);
  if (!Number.isFinite(ts) || Date.now() - ts > STATE_MAX_AGE_MS) return null;
  return { tenantId, siteUrl };
}

export async function finishGscOauth(input: {
  code: string;
  tenantId: string;
  siteUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getGoogleOauthAppConfig();
  if (!cfg) return { ok: false, error: "Google OAuth not configured" };
  const body = new URLSearchParams({
    code: input.code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Token exchange failed: ${res.status} ${t.slice(0, 120)}` };
  }
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
  };
  if (!json.refresh_token) {
    return {
      ok: false,
      error: "No refresh_token returned — revoke prior consent and retry with prompt=consent.",
    };
  }
  const enc = encryptToken(json.refresh_token);
  const siteUrl = input.siteUrl.endsWith("/") ? input.siteUrl : `${input.siteUrl}/`;
  const existing = await db
    .select()
    .from(gscOauthConnectionsTable)
    .where(eq(gscOauthConnectionsTable.tenantId, input.tenantId))
    .limit(1);
  if (existing[0]) {
    await db
      .update(gscOauthConnectionsTable)
      .set({
        siteUrl,
        refreshTokenEnc: enc,
        scopes: json.scope || GSC_OAUTH_SCOPES.join(" "),
        updatedAt: new Date(),
      })
      .where(eq(gscOauthConnectionsTable.tenantId, input.tenantId));
  } else {
    await db.insert(gscOauthConnectionsTable).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      siteUrl,
      refreshTokenEnc: enc,
      scopes: json.scope || GSC_OAUTH_SCOPES.join(" "),
      dataSince: "2026-07-17",
      meta: {},
    });
  }
  return { ok: true };
}
