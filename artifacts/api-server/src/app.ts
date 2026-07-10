import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOADS_ROOT } from "./lib/uploads";
import { tenantMiddleware } from "./middleware/tenant";
import {
  createSpaHtmlHandler,
  getStorefrontDist,
} from "./middleware/spaHtml";

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/uploads", express.static(UPLOADS_ROOT));
app.use("/api", tenantMiddleware, router);

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
