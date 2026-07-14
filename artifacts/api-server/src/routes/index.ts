import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import ordersRouter from "./orders";
import customersRouter from "./customers";
import settingsRouter from "./settings";
import versionRouter from "./version";
import squareRouter from "./square";
import configRouter from "./config";
import deliveryRouter from "./delivery";
import webhooksRouter from "./webhooks";
import bridgeRouter from "./bridge";
import dashboardRouter from "./dashboard";
import upsellRouter from "./upsell";
import analyticsRouter from "./analytics";
import onboardingRouter from "./onboarding";
import socialRouter from "./social";
import supportRouter from "./support";
import metaCapiRouter from "./metaCapi";
import seoRouter from "./seo";
import loyaltyRouter from "./loyalty";
import giftCardsRouter from "./giftCards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(ordersRouter);
router.use(customersRouter);
router.use(settingsRouter);
router.use(versionRouter);
router.use(squareRouter);
router.use(configRouter);
router.use(deliveryRouter);
router.use(webhooksRouter);
router.use(upsellRouter);
router.use(analyticsRouter);
router.use(metaCapiRouter);
router.use(seoRouter);
router.use(loyaltyRouter);
router.use(giftCardsRouter);
router.use("/bridge", bridgeRouter);
router.use("/dashboard", dashboardRouter);
router.use("/onboarding", onboardingRouter);
router.use("/social", socialRouter);
// Orderly VPS nginx currently proxies only /api/dashboard/* (not /api/social
// or /api/onboarding). Dual-mount so the console at orderlyfoods.com can
// reach the inbox / wizard with the same cookies. The Square OAuth callback
// itself stays registered at /api/onboarding/square/callback on
// samurairesto.com only (that's the exact SQUARE_OAUTH_REDIRECT_URI you
// register in the Square Developer Dashboard — see docs/SELF_SERVE_ONBOARDING.md).
router.use("/dashboard/social", socialRouter);
router.use("/dashboard/onboarding", onboardingRouter);
// Blok 3.2 — support KB/chat (console only; nginx proxies /api/dashboard/*).
router.use("/dashboard/support", supportRouter);

export default router;
