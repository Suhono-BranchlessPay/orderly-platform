import { createHash } from "node:crypto";
import { Router } from "express";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db, qrScansTable } from "@workspace/db";
import { findTenantBySlug } from "../lib/tenant";
import { logger } from "../lib/logger";

const router = Router();

const FALLBACK_URL =
  process.env.ORDERLY_QR_FALLBACK_URL?.trim() || "https://orderlyfoods.com";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

/**
 * Resolve redirect target for a packaging QR slug.
 * Config: tenants.theme.qr.target (preferred) or https://{domain}/order
 */
export function resolveQrTarget(
  _slug: string,
  theme: Record<string, unknown> | null | undefined,
  domain: string | null | undefined,
): string {
  const qr = asRecord(theme?.qr);
  const fromConfig =
    (typeof qr?.target === "string" && qr.target.trim()) ||
    (typeof theme?.qr_target === "string" && theme.qr_target.trim()) ||
    null;
  if (fromConfig) {
    try {
      if (fromConfig.startsWith("/")) {
        const host = domain?.trim() || "samurairesto.com";
        return `https://${host}${fromConfig}`;
      }
      const u = new URL(fromConfig);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      /* fall through */
    }
  }
  if (domain?.trim()) {
    return `https://${domain.trim().replace(/^www\./, "")}/order`;
  }
  return FALLBACK_URL;
}

function coarseIpHash(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(ip.split(",")[0]!.trim())
    .digest("hex")
    .slice(0, 16);
}

async function logScan(opts: {
  tenantId: string;
  slug: string;
  userAgent: string | undefined;
  referer: string | undefined;
  ip: string | undefined;
}) {
  try {
    await db.insert(qrScansTable).values({
      tenantId: opts.tenantId,
      slug: opts.slug,
      userAgent: opts.userAgent?.slice(0, 512) || null,
      referer: opts.referer?.slice(0, 512) || null,
      ipHash: coarseIpHash(opts.ip),
    });
  } catch (err) {
    logger.warn({ err, slug: opts.slug }, "Failed to log QR scan");
  }
}

/**
 * GET /r/:tenantSlug — dynamic packaging QR redirect.
 * Example: /r/samurai → 302 → https://samurairesto.com/order
 */
router.get("/r/:tenantSlug", async (req, res) => {
  const slug = String(req.params.tenantSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!slug) {
    res.redirect(302, FALLBACK_URL);
    return;
  }

  const tenant = await findTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    logger.info({ slug }, "QR scan for unknown slug — fallback");
    res.redirect(302, FALLBACK_URL);
    return;
  }

  const target = resolveQrTarget(slug, tenant.theme, tenant.domain);

  void logScan({
    tenantId: tenant.id,
    slug,
    userAgent: req.get("user-agent") || undefined,
    referer: req.get("referer") || undefined,
    ip: req.ip || req.socket.remoteAddress,
  });

  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, target);
});

/** GET /r/:tenantSlug/stats — scan counts for ops / future dashboard */
router.get("/r/:tenantSlug/stats", async (req, res) => {
  const slug = String(req.params.tenantSlug || "")
    .trim()
    .toLowerCase();
  const tenant = await findTenantBySlug(slug);
  if (!tenant) {
    res.status(404).json({ error: "Unknown tenant" });
    return;
  }

  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalRow] = await db
      .select({ n: count() })
      .from(qrScansTable)
      .where(eq(qrScansTable.tenantId, tenant.id));

    const [dayRow] = await db
      .select({ n: count() })
      .from(qrScansTable)
      .where(
        and(
          eq(qrScansTable.tenantId, tenant.id),
          gte(qrScansTable.scannedAt, dayAgo),
        ),
      );

    const [weekRow] = await db
      .select({ n: count() })
      .from(qrScansTable)
      .where(
        and(
          eq(qrScansTable.tenantId, tenant.id),
          gte(qrScansTable.scannedAt, weekAgo),
        ),
      );

    const [lastRow] = await db
      .select({ scannedAt: qrScansTable.scannedAt })
      .from(qrScansTable)
      .where(eq(qrScansTable.tenantId, tenant.id))
      .orderBy(desc(qrScansTable.scannedAt))
      .limit(1);

    res.json({
      tenantId: tenant.id,
      slug,
      target: resolveQrTarget(slug, tenant.theme, tenant.domain),
      publicUrl:
        (asRecord(tenant.theme.qr)?.public_url as string) ||
        `${process.env.ORDERLY_QR_BASE_URL || "https://orderlyfoods.com"}/r/${slug}`,
      stats: {
        total: totalRow?.n ?? 0,
        last_24_hours: dayRow?.n ?? 0,
        last_7_days: weekRow?.n ?? 0,
        last_scan_at: lastRow?.scannedAt ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "QR stats failed");
    res.status(500).json({ error: "Failed to load QR stats" });
  }
});

export default router;
