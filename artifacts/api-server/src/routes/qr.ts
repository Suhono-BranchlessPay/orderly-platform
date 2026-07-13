/**
 * Dynamic QR redirect — GET /r/:tenantSlug
 * Print once; change landing URL via tenant config (domain + order path) without reprinting.
 * Optional ?src= (e.g. flyer|table|window) is logged and forwarded to the landing URL.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { eq, or } from "drizzle-orm";
import { db, tenantsTable, qrScansTable } from "@workspace/db";
import { logger } from "../lib/logger";

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

function orderLandingUrl(
  tenant: {
    domain: string;
    theme: Record<string, unknown> | null;
  },
  src: string | null,
): string {
  const theme = tenant.theme || {};
  const custom =
    typeof theme.qrRedirectUrl === "string" ? theme.qrRedirectUrl.trim() : "";
  let base: string;
  if (custom.startsWith("http://") || custom.startsWith("https://")) {
    base = custom;
  } else {
    const path =
      typeof theme.orderPath === "string" && theme.orderPath.trim()
        ? theme.orderPath.trim()
        : "/order";
    const host = tenant.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    base = `https://${host}${normalizedPath}`;
  }
  if (!src) return base;
  try {
    const u = new URL(base);
    if (!u.searchParams.has("src")) u.searchParams.set("src", src);
    return u.toString();
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}src=${encodeURIComponent(src)}`;
  }
}

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
          meta: { path_slug: raw, src: src ?? null },
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
