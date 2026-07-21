/**
 * Self-serve Meta Page OAuth (development / allow-list only).
 *
 * Gate:
 * - META_PAGE_OAUTH_ENABLED=1 required
 * - Tenant must be in META_PAGE_OAUTH_ALLOWLIST (default: samurai,kirin)
 * - META_PAGE_OAUTH_PUBLIC=1 required before any non-allowlisted tenant
 *   (do not set until Meta Advanced Access is approved)
 *
 * Stores encrypted Page access token in meta_oauth_connections. Does not
 * automatically rewrite META_PAGE_ID_TENANT_MAP_JSON — ops confirms Graph
 * Page id then updates the map.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  metaOauthConnectionsTable,
  type MetaOauthConnection,
} from "@workspace/db";
import {
  encryptToken,
  getTokenEncryptionKey,
  isTokenEncryptionConfigured,
} from "./tokenCrypto";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const GRAPH = "https://graph.facebook.com/v21.0";

/** Scopes for inbox + comments. Expand only after App Review. */
export const META_PAGE_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_read_user_content",
  "pages_manage_engagement",
  "business_management",
] as const;

export function isMetaPageOauthEnabled(): boolean {
  return process.env.META_PAGE_OAUTH_ENABLED?.trim() === "1";
}

export function isMetaPageOauthPublic(): boolean {
  return process.env.META_PAGE_OAUTH_PUBLIC?.trim() === "1";
}

export function metaPageOauthAllowlist(): string[] {
  const raw = process.env.META_PAGE_OAUTH_ALLOWLIST?.trim();
  if (!raw) return ["samurai", "kirin"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isTenantAllowedForMetaPageOauth(tenantId: string): boolean {
  if (!isMetaPageOauthEnabled()) return false;
  if (isMetaPageOauthPublic()) return true;
  return metaPageOauthAllowlist().includes(tenantId);
}

export type MetaOauthAppConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export function getMetaOauthAppConfig(): MetaOauthAppConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const redirectUri =
    process.env.META_PAGE_OAUTH_REDIRECT_URI?.trim() ||
    "https://samurairesto.com/api/meta/oauth/callback";
  return { appId, appSecret, redirectUri };
}

export type MetaOauthReadiness = { ok: true } | { ok: false; error: string };

export function checkMetaPageOauthReadiness(): MetaOauthReadiness {
  if (!isMetaPageOauthEnabled()) {
    return {
      ok: false,
      error:
        "Meta Page OAuth is disabled. Set META_PAGE_OAUTH_ENABLED=1 for development connect (allow-listed tenants only).",
    };
  }
  if (!getMetaOauthAppConfig()) {
    return {
      ok: false,
      error: "Set META_APP_ID and META_APP_SECRET.",
    };
  }
  if (!isTokenEncryptionConfigured()) {
    return {
      ok: false,
      error: "Set ORDERLY_TOKEN_ENCRYPTION_KEY before connecting Meta Pages.",
    };
  }
  return { ok: true };
}

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

export function signMetaPageOauthState(tenantId: string): string {
  const payload = b64url(
    JSON.stringify({ t: tenantId, ts: Date.now(), v: "meta-page" }),
  );
  const sig = createHmac("sha256", stateSecret()).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

export function verifyMetaPageOauthState(
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
    if (!decoded.t || typeof decoded.ts !== "number" || decoded.v !== "meta-page") {
      return { ok: false, error: "OAuth state payload invalid." };
    }
    if (Date.now() - decoded.ts > STATE_MAX_AGE_MS) {
      return { ok: false, error: "OAuth state expired." };
    }
    return { ok: true, tenantId: decoded.t };
  } catch {
    return { ok: false, error: "OAuth state could not be decoded." };
  }
}

export function buildMetaAuthorizeUrl(state: string): string {
  const config = getMetaOauthAppConfig();
  if (!config) throw new Error("Meta OAuth app not configured");
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    scope: META_PAGE_OAUTH_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function exchangeCode(code: string): Promise<{ access_token: string }> {
  const config = getMetaOauthAppConfig();
  if (!config) throw new Error("Meta OAuth app not configured");
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);
  const r = await fetch(url.toString());
  const j = (await r.json()) as { access_token?: string; error?: { message?: string } };
  if (!r.ok || !j.access_token) {
    throw new Error(j.error?.message || `Meta token exchange failed (${r.status})`);
  }
  return { access_token: j.access_token };
}

async function exchangeLongLived(
  shortToken: string,
): Promise<{ access_token: string }> {
  const config = getMetaOauthAppConfig();
  if (!config) throw new Error("Meta OAuth app not configured");
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const r = await fetch(url.toString());
  const j = (await r.json()) as { access_token?: string; error?: { message?: string } };
  if (!r.ok || !j.access_token) {
    throw new Error(j.error?.message || `Long-lived exchange failed (${r.status})`);
  }
  return { access_token: j.access_token };
}

type MetaPage = { id: string; name?: string; access_token?: string };

async function listUserPages(userToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userToken);
  const r = await fetch(url.toString());
  const j = (await r.json()) as { data?: MetaPage[]; error?: { message?: string } };
  if (!r.ok) {
    throw new Error(j.error?.message || `List pages failed (${r.status})`);
  }
  return j.data ?? [];
}

export async function completeMetaPageOauth(input: {
  code: string;
  tenantId: string;
  /** Optional preferred page id; else first page with a token. */
  preferredPageId?: string | null;
}): Promise<MetaOauthConnection> {
  if (!isTenantAllowedForMetaPageOauth(input.tenantId)) {
    throw new Error(
      `Tenant "${input.tenantId}" is not allow-listed for Meta Page OAuth (set META_PAGE_OAUTH_ALLOWLIST or META_PAGE_OAUTH_PUBLIC=1 after Advanced Access).`,
    );
  }
  const short = await exchangeCode(input.code);
  const longLived = await exchangeLongLived(short.access_token);
  const pages = await listUserPages(longLived.access_token);
  const page =
    (input.preferredPageId
      ? pages.find((p) => p.id === input.preferredPageId)
      : null) ||
    pages.find((p) => p.access_token) ||
    pages[0];
  if (!page?.id || !page.access_token) {
    throw new Error(
      "No Facebook Page with an access token was returned. Ensure the user administers a Page.",
    );
  }

  const now = new Date();
  const existing = await db
    .select()
    .from(metaOauthConnectionsTable)
    .where(eq(metaOauthConnectionsTable.tenantId, input.tenantId))
    .limit(1);

  const rowBase = {
    tenantId: input.tenantId,
    pageId: page.id,
    pageName: page.name ?? null,
    pageAccessTokenEnc: encryptToken(page.access_token),
    scopes: META_PAGE_OAUTH_SCOPES.join(","),
    meta: {
      connectedVia: "meta_page_oauth",
      pagesFound: pages.length,
      allowlistOnly: !isMetaPageOauthPublic(),
    },
    updatedAt: now,
  };

  if (existing[0]) {
    await db
      .update(metaOauthConnectionsTable)
      .set(rowBase)
      .where(eq(metaOauthConnectionsTable.id, existing[0].id));
    return { ...existing[0], ...rowBase };
  }

  const row: MetaOauthConnection = {
    id: randomUUID(),
    ...rowBase,
    createdAt: now,
  };
  await db.insert(metaOauthConnectionsTable).values(row);
  return row;
}

export async function getMetaOauthConnectionForTenant(
  tenantId: string,
): Promise<MetaOauthConnection | null> {
  const rows = await db
    .select()
    .from(metaOauthConnectionsTable)
    .where(eq(metaOauthConnectionsTable.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}
