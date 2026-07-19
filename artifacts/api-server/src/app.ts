import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOADS_ROOT } from "./lib/uploads";
import { tenantMiddleware } from "./middleware/tenant";
import {
  createSpaHtmlHandler,
  getStorefrontDist,
} from "./middleware/spaHtml";
import { requireOrderlyDashboardHostPage } from "./lib/dashboardHost";
import qrRouter from "./routes/qr";
import bioRouter from "./routes/bio";
import {
  googleSiteVerificationHandler,
  robotsTxtHandler,
  sitemapXmlHandler,
} from "./routes/seoFiles";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = path.resolve(__dirname, "../public/dashboard");
const ONBOARDING_ROOT = path.resolve(__dirname, "../public/onboarding");
const LEGAL_ROOT = path.resolve(__dirname, "../public/legal");
const CLIENT_ROOT = path.resolve(__dirname, "../public/client");
const KDS_ROOT = path.resolve(__dirname, "../public/kds");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(cookieParser());
// Blok A — Square webhook signature verification needs the exact raw request
// bytes (HMAC-SHA256 over notification URL + raw body). Capture them here,
// scoped to this one path only, BEFORE the global JSON parser runs — Express
// body-parsers skip re-parsing once `req.body` is already set, so this does
// not affect any other route (doordash/branchlesspay webhooks, orders, etc).
app.use(
  "/api/webhooks/square",
  express.raw({ type: "*/*", limit: "2mb" }),
);
// Blok 4.1 — Meta webhook X-Hub-Signature-256 needs the same raw bytes treatment.
// Mounted on both social path aliases (nginx may proxy either).
app.use(
  "/api/social/webhooks/meta",
  express.raw({ type: "*/*", limit: "2mb" }),
);
app.use(
  "/api/dashboard/social/webhooks/meta",
  express.raw({ type: "*/*", limit: "2mb" }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic flyer QR + link-in-bio — must be before SPA catch-all.
app.use(qrRouter);
app.use(bioRouter);

// Per-tenant SEO files (must beat static robots.txt in storefront dist).
app.get("/robots.txt", robotsTxtHandler);
app.get("/sitemap.xml", sitemapXmlHandler);
// Google Search Console HTML-file verification (e.g. /google27c314f8a7bebb36.html).
app.get(/^\/google[0-9a-f]+\.html$/i, googleSiteVerificationHandler);

app.use("/api/uploads", express.static(UPLOADS_ROOT));
app.use("/api", tenantMiddleware, router);

// Orderly Foods console — ONLY on orderlyfoods.com (never restaurant domains).
app.use("/dashboard", requireOrderlyDashboardHostPage);
app.use("/dashboard", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});
app.get(["/dashboard", "/dashboard/"], (_req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(DASHBOARD_ROOT, "index.html"));
});
app.use(
  "/dashboard",
  express.static(DASHBOARD_ROOT, {
    index: false,
    setHeaders(res) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    },
  }),
);

// Self-serve onboarding wizard SKELETON (Blok 3.1) — same host gate as the
// console, since it is an internal/staff-facing prototype, not a restaurant
// storefront. The API itself (/api/onboarding/*) is not host-gated so it can
// be curl'd directly for verification.
app.use("/onboarding", requireOrderlyDashboardHostPage);
app.use("/onboarding", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});
app.get(["/onboarding", "/onboarding/"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(ONBOARDING_ROOT, "index.html"));
});
app.use("/onboarding", express.static(ONBOARDING_ROOT, { index: false }));

// Public legal pages (Meta App Review + App Store + storefront footer).
// Must be registered before the SPA catch-all so crawlers get real HTML.
const sendLegal =
  (file: string): RequestHandler =>
  (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(LEGAL_ROOT, file));
  };
app.get(["/privacy", "/privacy/"], sendLegal("privacy.html"));
app.get(["/terms", "/terms/"], sendLegal("terms.html"));
app.get(
  ["/data-deletion", "/data-deletion/", "/data_deletion", "/data_deletion/"],
  sendLegal("data-deletion.html"),
);
app.use("/legal", express.static(LEGAL_ROOT, { index: false }));

// Owner client dashboard (/client) + Kitchen Display System (/kds).
// Host-agnostic on purpose: these serve on restaurant domains (e.g.
// samurairesto.com/kds on the kitchen tablet) AND on orderlyfoods.com. Auth +
// tenant isolation are enforced by the /api/client session, not by Host.
// Registered before the storefront SPA catch-all so they win.
const sendClientApp =
  (root: string): RequestHandler =>
  (_req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(root, "index.html"));
  };
app.get(["/client", "/client/"], sendClientApp(CLIENT_ROOT));
app.use(
  "/client",
  express.static(CLIENT_ROOT, {
    index: false,
    setHeaders(res) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    },
  }),
);
app.get(["/kds", "/kds/"], sendClientApp(KDS_ROOT));
app.use(
  "/kds",
  express.static(KDS_ROOT, {
    index: false,
    setHeaders(res) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    },
  }),
);

// White-label SPA: static assets + Host-based tenant SEO injection into index.html.
// Requires STOREFRONT_DIST (path to Vite dist/public). Nginx should proxy document
// requests here so crawlers see per-tenant meta (not a shared static index.html).
const storefrontDist = getStorefrontDist();
if (storefrontDist) {
  app.use(express.static(storefrontDist, { index: false }));
  app.use(createSpaHtmlHandler(storefrontDist));
  logger.info({ storefrontDist }, "Storefront SPA + tenant SEO injection enabled");
}

export default app;
