import app from "./app";
import { logger } from "./lib/logger";
import { ensureDashboardSeedUsers } from "./lib/dashboardAuth";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
