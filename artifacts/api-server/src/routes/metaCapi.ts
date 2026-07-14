import { Router } from "express";
import { flushMetaCapiOutbox, metaCapiHealth } from "../lib/metaCapi";
import { resolveMetaCapiCreds } from "../lib/metaCapiConfig";

/**
 * Meta CAPI ops endpoints — no secrets returned.
 * Mounted at /api/meta-capi (exempt from restaurant host tenant hard-fail).
 */
const router = Router();

router.get("/meta-capi/health", (req, res): void => {
  const tenantHint =
    typeof req.query.tenant_id === "string" ? req.query.tenant_id.trim() : "samurai";
  const creds = resolveMetaCapiCreds(tenantHint);
  res.json({
    ok: true,
    service: "orderly-meta-capi",
    ...metaCapiHealth(),
    tenant_hint: tenantHint,
    creds_configured: Boolean(creds),
    pixel_id_prefix: creds ? creds.pixelId.slice(0, 6) + "…" : null,
  });
});

/** Manual flush of pending outbox (ops). Idempotent. */
router.post("/meta-capi/flush", async (req, res): Promise<void> => {
  try {
    const result = await flushMetaCapiOutbox({ limit: 50 });
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error({ err }, "meta CAPI flush failed");
    res.status(500).json({ error: "Flush failed" });
  }
});

export default router;
