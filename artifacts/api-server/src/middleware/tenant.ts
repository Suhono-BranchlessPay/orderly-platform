import type { RequestHandler } from "express";
import { resolveTenant, type TenantContext } from "../lib/tenant";

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

function isExemptPath(path: string): boolean {
  return (
    path === "/healthz" ||
    path === "/version" ||
    path.startsWith("/webhooks/") ||
    path.startsWith("/bridge") ||
    path.startsWith("/dashboard")
  );
}

/**
 * Resolve active tenant from Host (or X-Tenant-Slug) and attach req.tenant.
 * Health/webhooks skip hard failure so probes and DoorDash callbacks still work.
 */
export const tenantMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const slugHint =
      (typeof req.headers["x-tenant-slug"] === "string"
        ? req.headers["x-tenant-slug"]
        : undefined) ||
      (typeof req.query.tenant === "string" ? req.query.tenant : undefined);

    const host = req.headers.host;
    const exempt = isExemptPath(req.path);

    const tenant = await resolveTenant({
      host,
      slugHint,
      allowEnvFallback: true,
    });

    if (!tenant) {
      if (exempt) {
        next();
        return;
      }
      res.status(404).json({
        error: "Unknown restaurant domain. Check the URL and try again.",
      });
      return;
    }

    if (tenant.status !== "active" && !exempt) {
      res.status(503).json({
        error: "This restaurant is temporarily unavailable online.",
      });
      return;
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    req.log?.error({ err }, "Tenant resolution failed");
    if (isExemptPath(req.path)) {
      next();
      return;
    }
    res.status(500).json({ error: "Failed to resolve restaurant" });
  }
};
