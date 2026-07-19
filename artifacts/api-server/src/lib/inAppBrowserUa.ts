/**
 * Server-side UA helpers — keep in sync with storefront `inAppBrowser.ts`.
 * Covers Meta (FB/Messenger), Instagram, TikTok, LINE — Square card iframes fail here.
 */

export function isSocialInAppBrowserUa(
  ua: string | null | undefined,
): boolean {
  const u = ua || "";
  return (
    /FBAN|FBAV|FBIOS|FB_IAB|FB4A|FBSS|Messenger/i.test(u) ||
    /Instagram/i.test(u) ||
    /IABMV/i.test(u) ||
    /Line\//i.test(u) ||
    /TikTok/i.test(u) ||
    /BytedanceWebview|musical_ly|TTWebView/i.test(u)
  );
}

/** @deprecated Use isSocialInAppBrowserUa — kept for older imports. */
export const isMetaInAppBrowserUa = isSocialInAppBrowserUa;

export function isLikelyIosUa(ua: string | null | undefined): boolean {
  return /iPhone|iPad|iPod/i.test(ua || "");
}

export function inAppBrowserKind(
  ua: string | null | undefined,
): "facebook" | "instagram" | "tiktok" | "line" | "other_iab" | null {
  const u = ua || "";
  if (!isSocialInAppBrowserUa(u)) return null;
  if (/Instagram/i.test(u)) return "instagram";
  if (/TikTok|BytedanceWebview|musical_ly|TTWebView/i.test(u)) return "tiktok";
  if (/Line\//i.test(u)) return "line";
  if (/FBAN|FBAV|FBIOS|FB_IAB|FB4A|FBSS|Messenger/i.test(u) || /IABMV/i.test(u))
    return "facebook";
  return "other_iab";
}

export function browserContextFromUa(ua: string | null | undefined): {
  in_app_browser: boolean;
  in_app_kind: ReturnType<typeof inAppBrowserKind>;
  ios: boolean;
  ua_short: string | null;
} {
  const raw = typeof ua === "string" ? ua : null;
  return {
    in_app_browser: isSocialInAppBrowserUa(raw),
    in_app_kind: inAppBrowserKind(raw),
    ios: isLikelyIosUa(raw),
    ua_short: raw ? raw.slice(0, 180) : null,
  };
}
