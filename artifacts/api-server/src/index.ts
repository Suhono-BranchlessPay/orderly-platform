import app from "./app";
import { logger } from "./lib/logger";
import { ensureDashboardSeedUsers } from "./lib/dashboardAuth";
import { ensureClientSeedUsers } from "./lib/clientAuth";
import { listSyncableTenants, syncSquareMenuForTenant } from "./lib/squareMenuSync";
import { syncGbpReviews } from "./lib/gbp";
import { GBP_TRIAL_TENANT_IDS } from "./lib/gbpConfig";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureDashboardSeedUsers()
  .then(() => logger.info("Dashboard seed users ensured"))
  .catch((err) => logger.warn({ err }, "Dashboard seed skipped or failed"));

ensureClientSeedUsers()
  .then(() => logger.info("Client owner seed users ensured"))
  .catch((err) => logger.warn({ err }, "Client seed skipped or failed"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

/**
 * Blok A — optional Square menu sync cron. Off by default (0). Never blocks
 * boot: the interval is only *scheduled* here, the actual HTTP calls to
 * Square happen later, off the startup path. See docs/BLOK_A_SQUARE_MENU_SYNC.md.
 */
const MENU_SYNC_INTERVAL_MS = Number(process.env.MENU_SYNC_INTERVAL_MS || "0");
if (MENU_SYNC_INTERVAL_MS > 0) {
  setInterval(() => {
    listSyncableTenants()
      .then(async (tenants) => {
        for (const t of tenants) {
          try {
            await syncSquareMenuForTenant({
              tenantId: t.tenantId,
              slug: t.slug,
              reason: "cron",
            });
          } catch (err) {
            logger.error({ err, tenantId: t.tenantId }, "Menu sync cron: tenant sync failed");
          }
        }
      })
      .catch((err) => {
        logger.error({ err }, "Menu sync cron: listSyncableTenants failed");
      });
  }, MENU_SYNC_INTERVAL_MS);
  logger.info({ intervalMs: MENU_SYNC_INTERVAL_MS }, "Square menu sync cron enabled");
} else {
  logger.info("Square menu sync cron disabled (set MENU_SYNC_INTERVAL_MS to enable, e.g. 900000 for 15min)");
}

/**
 * Blok 4.2 Stage 2 — optional Google Business Profile review sync cron. Off by
 * default (0). Google has no reliable push for reviews, so parity with the
 * Facebook webhook means polling. Each pull ingests new reviews into the inbox
 * and auto-drafts (still human-approve before anything is sent). Nothing is
 * ever sent from here. See docs/BLOK4_GBP_TRIAL.md.
 */
const GBP_SYNC_INTERVAL_MS = Number(process.env.GBP_SYNC_INTERVAL_MS || "0");
if (GBP_SYNC_INTERVAL_MS > 0) {
  setInterval(() => {
    (async () => {
      for (const tenantId of GBP_TRIAL_TENANT_IDS) {
        try {
          const result = await syncGbpReviews({ tenantId });
          if (!result.ok) {
            logger.warn({ tenantId, error: result.error }, "GBP review sync cron: skipped");
          } else if (result.ingested > 0) {
            logger.info(
              { tenantId, ingested: result.ingested, drafted: result.drafted },
              "GBP review sync cron: new reviews ingested",
            );
          }
        } catch (err) {
          logger.error({ err, tenantId }, "GBP review sync cron: tenant sync failed");
        }
      }
    })().catch((err) => logger.error({ err }, "GBP review sync cron failed"));
  }, GBP_SYNC_INTERVAL_MS);
  logger.info({ intervalMs: GBP_SYNC_INTERVAL_MS }, "GBP review sync cron enabled");
} else {
  logger.info("GBP review sync cron disabled (set GBP_SYNC_INTERVAL_MS to enable, e.g. 1800000 for 30min)");
}
