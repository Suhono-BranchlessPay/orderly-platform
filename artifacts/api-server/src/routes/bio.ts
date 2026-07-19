/**
 * Link-in-bio landing for TikTok + Instagram (and FB).
 * GET /bio?src=tiktok-bio | ig-bio | fb-bio
 * Lists orderable items with tracked /s/{slug}?src=… links (reuses short-link infra).
 */
import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, menuItemsTable } from "@workspace/db";
import { resolveTenant } from "../lib/tenant";
import { buildBioSrcSlug } from "../lib/contentCalendar";
import { slugifyShortPath } from "../lib/socialPostDraft";
import {
  shouldEscapeInAppBrowser,
  escapeHrefForUa,
  isLikelyIosUa,
  renderWebviewEscapeHtml,
} from "../lib/webviewEscape";
import { logger } from "../lib/logger";

const router = Router();

const SRC_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

function sanitizeSrc(raw: unknown, fallback: string): string {
  const s = String(raw ?? "").trim().toLowerCase().slice(0, 64);
  if (s && SRC_RE.test(s)) return s;
  return fallback;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.get(["/bio", "/links"], async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await resolveTenant({
      host: req.headers.host,
      allowEnvFallback: true,
    });
    if (!tenant || tenant.status === "inactive") {
      res.status(404).send("Restaurant not found");
      return;
    }

    const host = tenant.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const ua = String(req.headers["user-agent"] || "");

    // Infer default bio src from referrer / query.
    const qSrc = typeof req.query.src === "string" ? req.query.src : "";
    const qFrom = String(req.query.from || "").toLowerCase();
    let defaultSrc = buildBioSrcSlug("tiktok");
    if (qFrom === "instagram" || qFrom === "ig") defaultSrc = buildBioSrcSlug("instagram");
    if (qFrom === "facebook" || qFrom === "fb") defaultSrc = buildBioSrcSlug("facebook");
    if (/tiktok/i.test(ua)) defaultSrc = buildBioSrcSlug("tiktok");
    if (/instagram/i.test(ua)) defaultSrc = buildBioSrcSlug("instagram");
    const src = sanitizeSrc(qSrc, defaultSrc);

    const items = await db
      .select({
        id: menuItemsTable.id,
        name: menuItemsTable.name,
        price: menuItemsTable.price,
        imageUrl: menuItemsTable.imageUrl,
        featured: menuItemsTable.featured,
      })
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.tenantId, tenant.id),
          eq(menuItemsTable.available, true),
        ),
      )
      .orderBy(desc(menuItemsTable.featured), desc(menuItemsTable.available))
      .limit(40);

    const featured = items.filter((i) => i.featured && i.imageUrl).slice(0, 8);
    const withPhoto = items.filter((i) => i.imageUrl).slice(0, 12);
    const picks = (featured.length >= 4 ? featured : withPhoto.length ? withPhoto : items).slice(
      0,
      10,
    );

    const menuUrl = `https://${host}/menu?src=${encodeURIComponent(src)}`;

    // Social WebView: one Continue gate (same as /s/) then land on /bio in Safari.
    if (shouldEscapeInAppBrowser(ua) && req.query.stay !== "1") {
      const selfUrl = `https://${host}/bio?src=${encodeURIComponent(src)}&stay=1`;
      res
        .status(200)
        .type("html")
        .send(
          renderWebviewEscapeHtml({
            brandName: tenant.name,
            httpsTarget: selfUrl,
            escapeHref: escapeHrefForUa(selfUrl, ua),
            ios: isLikelyIosUa(ua),
            src,
            itemId: null,
          }),
        );
      return;
    }

    const rows = picks
      .map((it) => {
        const slug = slugifyShortPath(it.name);
        const href = `https://${host}/s/${encodeURIComponent(slug)}?src=${encodeURIComponent(src)}&item=${encodeURIComponent(it.id)}`;
        const img = it.imageUrl
          ? `<img src="${escapeHtml(it.imageUrl)}" alt="" width="64" height="64" loading="lazy" style="border-radius:10px;object-fit:cover;width:64px;height:64px"/>`
          : `<div style="width:64px;height:64px;border-radius:10px;background:#222"></div>`;
        return `<a class="row" href="${escapeHtml(href)}">${img}<span class="meta"><span class="name">${escapeHtml(it.name)}</span><span class="price">$${Number(it.price).toFixed(2)}</span></span></a>`;
      })
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${escapeHtml(tenant.name)} — Order</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui,-apple-system,sans-serif; background:#0c0c0c; color:#f5f5f5; }
  .wrap { max-width:420px; margin:0 auto; padding:28px 18px 48px; }
  h1 { font-size:1.45rem; margin:0 0 6px; letter-spacing:-0.02em; }
  p { color:#a3a3a3; margin:0 0 22px; font-size:0.95rem; line-height:1.4; }
  a.row {
    display:flex; gap:14px; align-items:center; text-decoration:none; color:inherit;
    background:#161616; border:1px solid #2a2a2a; border-radius:14px; padding:12px;
    margin-bottom:10px;
  }
  a.row:active { opacity:0.92; }
  .meta { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .name { font-weight:650; font-size:1.02rem; }
  .price { color:#c41e3a; font-weight:650; font-size:0.92rem; }
  a.menu {
    display:block; text-align:center; margin-top:18px; padding:14px;
    background:#c41e3a; color:#fff; font-weight:650; border-radius:12px; text-decoration:none;
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(tenant.name)}</h1>
    <p>Tap an item to order — link opens our menu with tracking.</p>
    ${rows || "<p>Menu coming soon.</p>"}
    <a class="menu" href="${escapeHtml(menuUrl)}">View full menu</a>
  </div>
</body>
</html>`;

    res.setHeader("Cache-Control", "public, max-age=120");
    res.status(200).type("html").send(html);
  } catch (err) {
    logger.error({ err }, "bio page failed");
    res.status(500).send("Bio page failed");
  }
});

export default router;
