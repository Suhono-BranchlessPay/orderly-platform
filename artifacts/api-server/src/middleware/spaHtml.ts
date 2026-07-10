import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import { resolveTenant } from "../lib/tenant";
import { buildTenantSeo, injectTenantHead } from "../lib/tenantSeo";
import { logger } from "../lib/logger";

/**
 * Directory of the Vite storefront build (contains index.html + assets).
 * Set STOREFRONT_DIST in production so Express can inject per-tenant SEO.
 */
export function getStorefrontDist(): string | null {
  const fromEnv = process.env.STOREFRONT_DIST?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return null;
}

function isAssetPath(urlPath: string): boolean {
  return /\.[a-z0-9]+$/i.test(urlPath) && !urlPath.endsWith(".html");
}

/**
 * Serve SPA index.html with Host-resolved tenant meta injected server-side.
 * Static assets under STOREFRONT_DIST are left to express.static.
 */
export function createSpaHtmlHandler(
  storefrontDist: string,
): RequestHandler {
  const indexPath = path.join(storefrontDist, "index.html");
  let cachedTemplate: string | null = null;
  let cachedMtimeMs = 0;

  function loadTemplate(): string {
    const stat = fs.statSync(indexPath);
    if (cachedTemplate && stat.mtimeMs === cachedMtimeMs) {
      return cachedTemplate;
    }
    cachedTemplate = fs.readFileSync(indexPath, "utf8");
    cachedMtimeMs = stat.mtimeMs;
    return cachedTemplate;
  }

  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const urlPath = req.path || "/";
    if (urlPath.startsWith("/api")) {
      next();
      return;
    }
    if (isAssetPath(urlPath)) {
      next();
      return;
    }

    try {
      if (!fs.existsSync(indexPath)) {
        res.status(503).send("Storefront build not found. Run frontend build.");
        return;
      }

      const tenant = await resolveTenant({
        host: req.headers.host,
        slugHint:
          typeof req.headers["x-tenant-slug"] === "string"
            ? req.headers["x-tenant-slug"]
            : typeof req.query.tenant === "string"
              ? req.query.tenant
              : undefined,
        allowEnvFallback: true,
      });

      if (!tenant) {
        res.status(404).send("Unknown restaurant domain.");
        return;
      }

      const seo = buildTenantSeo(tenant);
      const html = injectTenantHead(loadTemplate(), seo);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(html);
    } catch (err) {
      logger.error({ err }, "SPA tenant HTML injection failed");
      next(err);
    }
  };
}
