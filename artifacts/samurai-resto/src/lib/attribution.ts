/**
 * First-touch attribution for Orderly storefront (Blok C1 / D4).
 * Captures UTM + ?src= on first page load; persists for the session;
 * used at checkout to set orders.channel + source_detail.
 *
 * First-touch wins when it already has a tracking signal. Bare first hits
 * (homepage with no params) can upgrade when a later click brings src/UTM/fbclid.
 */
const STORAGE_PREFIX = "orderly_attribution_";

/** Fallback src when Facebook stamps fbclid but the link lost our campaign src=. */
export const FACEBOOK_FBCLID_FALLBACK_SRC = "facebook_organic_fbclid";

export type StorefrontAttribution = {
  channel: string;
  source_detail: Record<string, unknown>;
  captured_at: string;
};

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}${tenantId || "default"}`;
}

/** Meta CAPI fbc format when _fbc cookie is missing. */
export function buildFbcFromFbclid(
  fbclid: string,
  tsMs: number = Date.now(),
): string {
  return `fb.1.${Math.floor(tsMs)}.${fbclid.trim()}`;
}

function mapSourceToChannel(opts: {
  utmSource?: string | null;
  src?: string | null;
  fbclid?: string | null;
}): string {
  const u = (opts.utmSource || "").trim().toLowerCase();
  const s = (opts.src || "").trim().toLowerCase();

  if (u === "google" || s === "google" || s === "gbp") return "google";
  // Tracked social tags look like fb-hibachichicken-20260718 / ig-…
  if (
    u === "facebook" ||
    u === "fb" ||
    s === "facebook" ||
    s === "fb" ||
    s.startsWith("fb-") ||
    s === FACEBOOK_FBCLID_FALLBACK_SRC ||
    Boolean(opts.fbclid?.trim())
  ) {
    return "facebook";
  }
  if (
    u === "instagram" ||
    u === "ig" ||
    s === "instagram" ||
    s === "ig" ||
    s.startsWith("ig-")
  ) {
    return "instagram";
  }
  if (u === "tiktok" || s === "tiktok" || s.startsWith("tt-") || s.startsWith("tiktok-"))
    return "tiktok";
  if (s === "flyer" || s === "qr" || u === "qr" || s.startsWith("qr-")) return "qr";
  if (u === "doordash" || s === "doordash") return "doordash";
  if (s.startsWith("social-reply-") || s.startsWith("social-")) return "other";
  if (u || s) return "other";
  return "web";
}

function hasTrackingSignal(detail: Record<string, unknown> | undefined): boolean {
  if (!detail) return false;
  return Boolean(
    detail.src ||
      detail.utm_source ||
      detail.utm_medium ||
      detail.utm_campaign ||
      detail.fbclid ||
      detail.fbc,
  );
}

/** Call once on app boot (TenantProvider / App). Safe to call repeatedly. */
export function captureAttributionFromUrl(tenantId: string): StorefrontAttribution {
  const key = storageKey(tenantId);

  let search = "";
  let path = "/";
  let referrer = "";
  try {
    search = window.location.search || "";
    path = window.location.pathname + window.location.search;
    referrer = document.referrer || "";
  } catch {
    /* SSR / non-browser */
  }

  const params = new URLSearchParams(search);
  const utm_source = params.get("utm_source");
  const utm_medium = params.get("utm_medium");
  const utm_campaign = params.get("utm_campaign");
  const utm_content = params.get("utm_content");
  const utm_term = params.get("utm_term");
  const srcParam = params.get("src");
  const fbclid = params.get("fbclid")?.trim() || null;

  // Campaign src wins; else UTM; else Facebook-stamped fbclid → organic/system bucket.
  let src = srcParam?.trim() || null;
  if (!src && !utm_source?.trim() && fbclid) {
    src = FACEBOOK_FBCLID_FALLBACK_SRC;
  }

  const channel = mapSourceToChannel({
    utmSource: utm_source,
    src,
    fbclid,
  });
  const source_detail: Record<string, unknown> = {
    surface: "samurai-resto-checkout",
    landing_path: path,
  };
  if (utm_source) source_detail.utm_source = utm_source;
  if (utm_medium) source_detail.utm_medium = utm_medium;
  if (utm_campaign) source_detail.utm_campaign = utm_campaign;
  if (utm_content) source_detail.utm_content = utm_content;
  if (utm_term) source_detail.utm_term = utm_term;
  if (src) source_detail.src = src;
  if (fbclid) {
    source_detail.fbclid = fbclid;
    source_detail.fbc = buildFbcFromFbclid(fbclid);
  }
  if (referrer) source_detail.referrer = referrer;

  const incoming: StorefrontAttribution = {
    channel,
    source_detail,
    captured_at: new Date().toISOString(),
  };

  try {
    const existingRaw = sessionStorage.getItem(key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as StorefrontAttribution;
      // First-touch wins when it already has UTM/src/fbclid. If the first hit was a
      // bare homepage (no tracking), allow upgrade when a later click brings signal.
      if (hasTrackingSignal(existing.source_detail)) {
        return existing;
      }
      if (!hasTrackingSignal(incoming.source_detail)) {
        return existing;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    sessionStorage.setItem(key, JSON.stringify(incoming));
  } catch {
    /* private mode */
  }
  return incoming;
}

export function getAttribution(tenantId: string): StorefrontAttribution {
  try {
    const raw = sessionStorage.getItem(storageKey(tenantId));
    if (raw) return JSON.parse(raw) as StorefrontAttribution;
  } catch {
    /* ignore */
  }
  return captureAttributionFromUrl(tenantId);
}
