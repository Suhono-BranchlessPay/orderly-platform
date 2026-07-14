import { Router } from "express";
import {
  getSquarePublicConfig,
  isSquareConfigured,
} from "../integrations/square";
import { getTenantId } from "../lib/tenant";

const router = Router();

/** Public config for Square Web Payments SDK on checkout. */
router.get("/square/config", async (req, res): Promise<void> => {
  const slug = req.tenant?.slug ?? getTenantId();
  res.json(await getSquarePublicConfig(slug));
});

export default router;

export { isSquareConfigured };
