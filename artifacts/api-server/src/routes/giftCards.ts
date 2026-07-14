import { Router } from "express";
import {
  getGiftCardBalanceByGan,
  getGiftCardProgram,
  isGiftCardEngineEnabled,
  purchaseGiftCard,
  quoteGiftCardRedeem,
  redeemGiftCardForOrder,
} from "../lib/giftCardEngine";
import { logger } from "../lib/logger";

const router = Router();

/** Public program config for storefront / app (no secrets). */
router.get("/gift-cards/program", async (req, res): Promise<void> => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      res.status(404).json({ error: "Unknown tenant" });
      return;
    }
    const program = await getGiftCardProgram(tenantId);
    const engineOn = isGiftCardEngineEnabled();
    const active = Boolean(
      program?.enabled && program.status === "active" && program.sellOnline,
    );
    res.json({
      engineEnabled: engineOn,
      program: program
        ? {
            enabled: active && engineOn,
            status: program.status,
            sellOnline: program.sellOnline,
            allowedAmountsCents: program.allowedAmountsCents,
            minAmountCents: program.minAmountCents,
            maxAmountCents: program.maxAmountCents,
          }
        : null,
    });
  } catch (err) {
    logger.error({ err }, "GET /gift-cards/program failed");
    res.status(500).json({ error: "Failed to load gift card program" });
  }
});

/** Balance by GAN (masked response). Square tenants only when engine can resolve. */
router.get("/gift-cards/balance", async (req, res): Promise<void> => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      res.status(404).json({ error: "Unknown tenant" });
      return;
    }
    const gan =
      typeof req.query.gan === "string" ? req.query.gan.trim() : "";
    if (!gan) {
      res.status(400).json({ error: "gan required" });
      return;
    }
    const result = await getGiftCardBalanceByGan({ tenantId, gan });
    res.json({
      ...result,
      engineEnabled: isGiftCardEngineEnabled(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load balance";
    if (msg.includes("Square POS") || msg.includes("not configured")) {
      res.status(400).json({ error: msg });
      return;
    }
    logger.error({ err }, "GET /gift-cards/balance failed");
    res.status(500).json({ error: "Failed to load balance" });
  }
});

/** Quote redeem — does not commit. */
router.post("/gift-cards/quote-redeem", async (req, res): Promise<void> => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      res.status(404).json({ error: "Unknown tenant" });
      return;
    }
    const gan = String(req.body?.gan || "").trim();
    const amountCents = Number(req.body?.amount_cents);
    const orderTotalCents = Number(req.body?.order_total_cents);
    if (!gan || !Number.isFinite(amountCents) || amountCents <= 0) {
      res.status(400).json({ error: "gan and amount_cents required" });
      return;
    }
    const quote = await quoteGiftCardRedeem({
      tenantId,
      gan,
      amountCents,
      orderTotalCents: Number.isFinite(orderTotalCents)
        ? orderTotalCents
        : undefined,
    });
    res.json(quote);
  } catch (err) {
    logger.error({ err }, "POST /gift-cards/quote-redeem failed");
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to quote redeem",
    });
  }
});

/**
 * Purchase digital gift card (Square charge → CreateGiftCard → ACTIVATE).
 * Requires ORDERLY_GIFT_CARDS_ENABLED=1 + program active. Legal HOLD before prod.
 */
router.post("/gift-cards/purchase", async (req, res): Promise<void> => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      res.status(404).json({ error: "Unknown tenant" });
      return;
    }
    if (!isGiftCardEngineEnabled()) {
      res.status(503).json({
        error: "Gift card engine disabled (ORDERLY_GIFT_CARDS_ENABLED)",
      });
      return;
    }
    const amountCents = Number(req.body?.amount_cents);
    const sourceId = String(
      req.body?.square_payment_source_id || req.body?.source_id || "",
    ).trim();
    if (!sourceId || !Number.isFinite(amountCents)) {
      res.status(400).json({
        error: "amount_cents and square_payment_source_id required",
      });
      return;
    }
    const result = await purchaseGiftCard({
      tenantId,
      amountCents,
      squarePaymentSourceId: sourceId,
      purchaserEmail:
        typeof req.body?.purchaser_email === "string"
          ? req.body.purchaser_email
          : undefined,
      purchaserCustomerId:
        typeof req.body?.purchaser_customer_id === "string"
          ? req.body.purchaser_customer_id
          : undefined,
      recipientEmail:
        typeof req.body?.recipient_email === "string"
          ? req.body.recipient_email
          : undefined,
      recipientName:
        typeof req.body?.recipient_name === "string"
          ? req.body.recipient_name
          : undefined,
      buyerName:
        typeof req.body?.buyer_name === "string"
          ? req.body.buyer_name
          : undefined,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /gift-cards/purchase failed");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Purchase failed",
    });
  }
});

/** Commit redeem at checkout (Square REDEEM activity). */
router.post("/gift-cards/redeem", async (req, res): Promise<void> => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      res.status(404).json({ error: "Unknown tenant" });
      return;
    }
    if (!isGiftCardEngineEnabled()) {
      res.status(503).json({ error: "Gift card engine disabled" });
      return;
    }
    const gan = String(req.body?.gan || "").trim();
    const amountCents = Number(req.body?.amount_cents);
    const orderId =
      typeof req.body?.order_id === "string" ? req.body.order_id : undefined;
    if (!gan || !Number.isFinite(amountCents)) {
      res.status(400).json({ error: "gan and amount_cents required" });
      return;
    }
    const result = await redeemGiftCardForOrder({
      tenantId,
      gan,
      amountCents,
      orderId,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /gift-cards/redeem failed");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Redeem failed",
    });
  }
});

export default router;
