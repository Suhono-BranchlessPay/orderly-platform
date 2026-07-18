/**
 * Dynamic QR / short-link redirects:
 * - GET /r/:tenantSlug — flyer QR by tenant (optional ?src=&item=)
 * - GET /s/:itemSlug — OPSI A meaningful short link on the restaurant domain
 *   (Host → tenant; slug → menu item; preserves src+item attribution)
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { and, eq, or } from "drizzle-orm";
import {
  db,
  tenantsTable,
  qrScansTable,
  menuItemsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { resolveTenant } from "../lib/tenant";
import { slugifySeo } from "../lib/seoTags";

const router = Router();

const SLUG_ALIASES: Record<string, string> = {
  "samurai-martinsville": "samurai",
  martinsville: "samurai",
  "samurai-linton": "samurai-linton",
  linton: "samurai-linton",
};

const SRC_MAX = 64;
const SRC_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

function hashIp(raw: string | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() || raw;
  return createHash("sha256").update(first).digest("hex").slice(0, 32);
}

function sanitizeSrc(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, SRC_MAX);
  if (!s || !SRC_RE.test(s)) return null;
  return s.toLowerCase();
}

const ITEM_MAX = 128;
const ITEM_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function sanitizeItemId(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, ITEM_MAX);
  if (!s || !ITEM_RE.test(s)) return null;
  return s;
}

function orderLandingUrl(
  tenant: {
    domain: string;
    theme: Record<string, unknown> | null;
  },
  src: string | null,
  itemId: string | null,
): string {
  const theme = tenant.theme || {};
  const custom =
    typeof theme.qrRedirectUrl === "string" ? theme.qrRedirectUrl.trim() : "";
  let base: string;
  if (custom.startsWith("http://") || custom.startsWith("https://")) {
    base = custom;
  } else {
    // Flyer QR should land on the menu (browse), not empty Checkout (/order).
    const path =
      typeof theme.orderPath === "string" && theme.orderPath.trim()
        ? theme.orderPath.trim()
        : "/menu";
    const host = tenant.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    base = `https://${host}${normalizedPath}`;
  }
  if (!src && !itemId) return base;
  try {
    const u = new URL(base);
    if (src && !u.searchParams.has("src")) u.searchParams.set("src", src);
    if (itemId && !u.searchParams.has("item")) {
      u.searchParams.set("item", itemId);
    }
    return u.toString();
  } catch {
    const parts: string[] = [];
    if (src) parts.push(`src=${encodeURIComponent(src)}`);
    if (itemId) parts.push(`item=${encodeURIComponent(itemId)}`);
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}${parts.join("&")}`;
  }
}

/**
 * Meaningful short link: /s/shrimp-bento?src=fb-…&item=…
 * Resolves tenant from Host (white-label), item from hyphenated name slug.
 */
router.get(
  "/s/:itemSlug",
  async (req: Request, res: Response): Promise<void> => {
    const itemSlug = slugifySeo(String(req.params.itemSlug || ""));
    if (!itemSlug || itemSlug.length < 2) {
      res.status(400).send("Invalid short link");
      return;
    }

    const src = sanitizeSrc(req.query.src) ?? `s-${itemSlug}`.slice(0, SRC_MAX);
    const itemHint = sanitizeItemId(req.query.item);

    try {
      const tenant = await resolveTenant({
        host: req.headers.host,
        allowEnvFallback: true,
      });
      if (!tenant || tenant.status === "inactive") {
        res.status(404).send("Restaurant not found");
        return;
      }

      const items = await db
        .select({
          id: menuItemsTable.id,
          name: menuItemsTable.name,
          featured: menuItemsTable.featured,
        })
        .from(menuItemsTable)
        .where(
          and(
            eq(menuItemsTable.tenantId, tenant.id),
            eq(menuItemsTable.available, true),
          ),
        );

      const matches = items.filter((it) => slugifySeo(it.name) === itemSlug);
      let chosen =
        (itemHint && matches.find((it) => it.id === itemHint)) ||
        matches.find((it) => it.featured) ||
        matches[0] ||
        null;

      // Safety net: explicit item id that still matches this slug, or bare id fallback
      if (!chosen && itemHint) {
        const byId = items.find((it) => it.id === itemHint);
        if (byId && slugifySeo(byId.name) === itemSlug) chosen = byId;
      }

      const itemId = chosen?.id ?? null;
      const redirectUrl = orderLandingUrl(
        {
          domain: tenant.domain,
          theme: (tenant.theme as Record<string, unknown>) || {},
        },
        src,
        itemId,
      );

      void db
        .insert(qrScansTable)
        .values({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          redirectUrl,
          userAgent:
            String(req.headers["user-agent"] || "").slice(0, 500) || null,
          ipHash: hashIp(
            String(
              req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
            ),
          ),
          referer:
            String(req.headers.referer || req.headers.referrer || "").slice(
              0,
              500,
            ) || null,
          meta: {
            kind: "s",
            item_slug: itemSlug,
            src: src ?? null,
            item: itemId,
            match_count: matches.length,
          },
        })
        .catch((err: unknown) => {
          logger.warn({ err, itemSlug }, "qr_scans insert failed (/s)");
        });

      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, redirectUrl);
    } catch (err) {
      logger.error({ err, itemSlug }, "Short link /s/ redirect failed");
      res.status(500).send("Short link failed");
    }
  },
);

router.get(
  "/r/:tenantSlug",
  async (req: Request, res: Response): Promise<void> => {
    const raw = String(req.params.tenantSlug || "")
      .trim()
      .toLowerCase();
    if (!raw || raw.length > 64) {
      res.status(400).send("Invalid QR link");
      return;
    }

    const slug = SLUG_ALIASES[raw] || raw;
    const src = sanitizeSrc(req.query.src);
    const itemId = sanitizeItemId(req.query.item);

    try {
      const rows = await db
        .select()
        .from(tenantsTable)
        .where(or(eq(tenantsTable.slug, slug), eq(tenantsTable.id, slug)))
        .limit(1);

      const tenant = rows[0];
      if (!tenant || tenant.status === "inactive") {
        res.status(404).send("Restaurant not found");
        return;
      }

      const redirectUrl = orderLandingUrl(
        {
          domain: tenant.domain,
          theme: (tenant.theme as Record<string, unknown>) || {},
        },
        src,
        itemId,
      );

      // Fire-and-forget scan log — never block the diner.
      void db
        .insert(qrScansTable)
        .values({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          redirectUrl,
          userAgent:
            String(req.headers["user-agent"] || "").slice(0, 500) || null,
          ipHash: hashIp(
            String(
              req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
            ),
          ),
          referer:
            String(req.headers.referer || req.headers.referrer || "").slice(
              0,
              500,
            ) || null,
          meta: {
            path_slug: raw,
            src: src ?? null,
            item: itemId ?? null,
          },
        })
        .catch((err: unknown) => {
          logger.warn({ err, slug }, "qr_scans insert failed");
        });

      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, redirectUrl);
    } catch (err) {
      logger.error({ err, slug }, "QR redirect failed");
      res.status(500).send("QR redirect failed");
    }
  },
);

export default router;
