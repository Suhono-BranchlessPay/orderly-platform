import {
  inAppBrowserKind,
  isLikelyIosUa,
  isSocialInAppBrowserUa,
} from "./inAppBrowserUa";

export { isLikelyIosUa };

/** Facebook / Instagram / TikTok / LINE in-app browsers — card iframes often fail. */
export function shouldEscapeInAppBrowser(ua: string | null | undefined): boolean {
  return isSocialInAppBrowserUa(ua);
}

/** Best-effort Safari handoff (Facebook iOS WebView often honors this). */
export function toSafariSchemeUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//i, "x-safari-https://");
}

/** Instagram iOS native external-browser host (best-effort). */
export function toInstagramExtBrowserUrl(httpsUrl: string): string {
  return `instagram://extbrowser/?url=${encodeURIComponent(httpsUrl)}`;
}

/** Android Chrome/default browser via intent. */
export function toAndroidIntentUrl(httpsUrl: string): string {
  try {
    const u = new URL(httpsUrl);
    const path = `${u.host}${u.pathname}${u.search}${u.hash}`;
    return `intent://${path}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
  } catch {
    return httpsUrl;
  }
}

export function escapeHrefForUa(
  httpsUrl: string,
  ua: string | null | undefined,
): string {
  const kind = inAppBrowserKind(ua);
  // Instagram: prefer its native extbrowser scheme on iOS (user-gesture tap).
  if (kind === "instagram" && isLikelyIosUa(ua)) {
    return toInstagramExtBrowserUrl(httpsUrl);
  }
  if (/Android/i.test(ua || "")) return toAndroidIntentUrl(httpsUrl);
  if (isLikelyIosUa(ua)) return toSafariSchemeUrl(httpsUrl);
  return toSafariSchemeUrl(httpsUrl);
}

/**
 * One-screen handoff — not a warning lecture.
 * Auto-attempts Safari on iOS Meta WebViews; one primary tap as fallback.
 *
 * Continue targets /menu?src=… (never /s/ again) so qr_scans is not double-counted.
 */
export function renderWebviewEscapeHtml(input: {
  brandName: string;
  httpsTarget: string;
  escapeHref: string;
  ios: boolean;
  src?: string | null;
  itemId?: string | null;
}): string {
  const brand = escapeHtml(input.brandName || "Order online");
  const httpsTarget = escapeHtmlAttr(input.httpsTarget);
  const escapeHref = escapeHtmlAttr(input.escapeHref);
  const trackMeta = JSON.stringify({
    surface: "s_continue",
    src: input.src ?? null,
    item: input.itemId ?? null,
    https_target: input.httpsTarget,
  });
  const script = `<script>(function(){
  var meta=${trackMeta};
  var sid='wv_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
  function track(type, extra){
    try{
      var body=JSON.stringify({
        session_id:sid,
        event_type:type,
        item_id: meta.item,
        meta: Object.assign({}, meta, extra||{})
      });
      if(navigator.sendBeacon){
        navigator.sendBeacon('/api/analytics/events', new Blob([body],{type:'application/json'}));
      } else {
        fetch('/api/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){});
      }
    }catch(e){}
  }
  track('webview_continue_shown');
  document.addEventListener('DOMContentLoaded',function(){
    var btn=document.getElementById('wv-continue');
    if(btn) btn.addEventListener('click',function(){ track('webview_continue_tap'); });
    var stay=document.getElementById('wv-stay');
    if(stay) stay.addEventListener('click',function(){ track('webview_continue_stay'); });
  });
  ${
    input.ios
      ? `setTimeout(function(){ try{ track('webview_continue_auto'); location.href=${JSON.stringify(input.escapeHref)}; }catch(e){} }, 80);`
      : ""
  }
})();</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${brand} — Continue</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; font-family: system-ui, -apple-system, sans-serif;
    background: #0c0c0c; color: #f5f5f5;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card { max-width: 360px; width: 100%; text-align: center; }
  h1 { font-size: 1.5rem; font-weight: 650; margin: 0 0 8px; letter-spacing: -0.02em; }
  p { color: #a3a3a3; font-size: 0.95rem; line-height: 1.45; margin: 0 0 28px; }
  a.btn {
    display: block; width: 100%; padding: 16px 18px; border-radius: 12px;
    background: #c41e3a; color: #fff; font-weight: 650; font-size: 1.05rem;
    text-decoration: none; margin-bottom: 12px;
  }
  a.btn:active { opacity: 0.9; }
  a.quiet {
    display: inline-block; margin-top: 8px; color: #737373; font-size: 0.8rem;
    text-decoration: underline; text-underline-offset: 3px;
  }
</style>
${script}
</head>
<body>
  <div class="card">
    <h1>${brand}</h1>
    <p>Tap once to continue to secure checkout.</p>
    <a class="btn" id="wv-continue" href="${escapeHref}" rel="noopener">Continue</a>
    <a class="quiet" id="wv-stay" href="${httpsTarget}">Stay in this browser</a>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
