import {
  inAppBrowserKind,
  isSocialInAppBrowserUa,
} from "../../src/lib/inAppBrowserUa";
import { escapeHrefForUa, shouldEscapeInAppBrowser } from "../../src/lib/webviewEscape";

describe("social in-app browser UA", () => {
  test("detects Facebook, Instagram, TikTok", () => {
    expect(isSocialInAppBrowserUa("Mozilla/5.0 FBAN/FBIOS")).toBe(true);
    expect(isSocialInAppBrowserUa("Instagram 300.0.0")).toBe(true);
    expect(
      isSocialInAppBrowserUa(
        "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 TikTok TTWebView",
      ),
    ).toBe(true);
    expect(isSocialInAppBrowserUa("BytedanceWebview")).toBe(true);
    expect(isSocialInAppBrowserUa("Safari/605.1.15")).toBe(false);
  });

  test("classifies kind for escape routing", () => {
    expect(inAppBrowserKind("Instagram 300")).toBe("instagram");
    expect(inAppBrowserKind("TikTok TTWebView")).toBe("tiktok");
    expect(inAppBrowserKind("FBAN/FBIOS")).toBe("facebook");
  });

  test("shouldEscape covers TikTok + Instagram", () => {
    expect(shouldEscapeInAppBrowser("TikTok TTWebView")).toBe(true);
    expect(shouldEscapeInAppBrowser("Instagram")).toBe(true);
  });

  test("Instagram iOS uses extbrowser scheme", () => {
    const href = escapeHrefForUa(
      "https://samurairesto.com/bio?src=ig-bio",
      "Mozilla/5.0 (iPhone) Instagram",
    );
    expect(href.startsWith("instagram://extbrowser/?url=")).toBe(true);
  });

  test("TikTok iOS uses x-safari-https", () => {
    const href = escapeHrefForUa(
      "https://samurairesto.com/bio?src=tiktok-bio",
      "Mozilla/5.0 (iPhone) TikTok TTWebView",
    );
    expect(href).toBe("x-safari-https://samurairesto.com/bio?src=tiktok-bio");
  });
});
