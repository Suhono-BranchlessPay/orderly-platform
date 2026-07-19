/**
 * Detect social in-app browsers where Square Web Payments card iframes
 * often fail (Pay stuck disabled before tokenize).
 * Facebook, Instagram, TikTok, LINE — not Safari/Chrome.
 */

export function isSocialInAppBrowser(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
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

/** @deprecated Use isSocialInAppBrowser */
export const isMetaInAppBrowser = isSocialInAppBrowser;

export function isLikelyIos(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  return /iPhone|iPad|iPod/i.test(ua || "");
}

export function inAppBrowserKind(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): "facebook" | "instagram" | "tiktok" | "line" | "other_iab" | null {
  const u = ua || "";
  if (!isSocialInAppBrowser(u)) return null;
  if (/Instagram/i.test(u)) return "instagram";
  if (/TikTok|BytedanceWebview|musical_ly|TTWebView/i.test(u)) return "tiktok";
  if (/Line\//i.test(u)) return "line";
  if (/FBAN|FBAV|FBIOS|FB_IAB|FB4A|FBSS|Messenger/i.test(u) || /IABMV/i.test(u))
    return "facebook";
  return "other_iab";
}

/** Snapshot for analytics meta — never guess payment stage from this alone. */
export function browserPaymentContext(): {
  in_app_browser: boolean;
  in_app_kind: ReturnType<typeof inAppBrowserKind>;
  ios: boolean;
  is_secure_context: boolean;
  ua_short: string;
} {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return {
    in_app_browser: isSocialInAppBrowser(ua),
    in_app_kind: inAppBrowserKind(ua),
    ios: isLikelyIos(ua),
    is_secure_context:
      typeof window !== "undefined" ? Boolean(window.isSecureContext) : false,
    ua_short: (ua || "").slice(0, 180),
  };
}
