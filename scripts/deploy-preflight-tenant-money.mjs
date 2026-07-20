/**
 * Preflight before activating fail-closed money code on a live VPS.
 *
 * 1) Mirror SQUARE_* → TENANT_SAMURAI_SQUARE_* if prefixed keys missing
 * 2) Verify ecosystem.config.cjs has all four TENANT_SAMURAI_SQUARE_* keys
 *
 * Exit 1 → deploy MUST NOT put new money-path code into the running process.
 *
 * Usage: node scripts/deploy-preflight-tenant-money.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const appRoot = process.env.APP_DIR || process.cwd();
const ecoPath = path.join(appRoot, "ecosystem.config.cjs");
const require = createRequire(import.meta.url);

const REQUIRED = [
  "TENANT_SAMURAI_SQUARE_ACCESS_TOKEN",
  "TENANT_SAMURAI_SQUARE_LOCATION_ID",
  "TENANT_SAMURAI_SQUARE_APPLICATION_ID",
  "TENANT_SAMURAI_SQUARE_ENVIRONMENT",
];

const mirror = path.join(
  appRoot,
  "scripts/vps-mirror-samurai-square-prefixed-env.mjs",
);
if (fs.existsSync(mirror)) {
  const r = spawnSync(process.execPath, [mirror], {
    cwd: appRoot,
    encoding: "utf8",
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) {
    console.error("ERROR: mirror script failed");
    process.exit(1);
  }
}

let eco;
try {
  eco = require(ecoPath);
} catch (err) {
  console.error("ERROR: cannot parse ecosystem.config.cjs:", err.message);
  process.exit(1);
}

const env = eco.apps?.find((a) => a.name === "samurai-api")?.env || {};
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error(
    "ERROR: Samurai Square prefixed env missing — refuse deploy:",
    missing.join(", "),
  );
  process.exit(1);
}

console.log("OK preflight money:");
console.log(
  "  TENANT_SAMURAI_SQUARE_LOCATION_ID=",
  String(env.TENANT_SAMURAI_SQUARE_LOCATION_ID),
);
console.log(
  "  TENANT_SAMURAI_SQUARE_ENVIRONMENT=",
  String(env.TENANT_SAMURAI_SQUARE_ENVIRONMENT),
);
console.log(
  "  TENANT_SAMURAI_SQUARE_APPLICATION_ID len=",
  String(env.TENANT_SAMURAI_SQUARE_APPLICATION_ID).length,
);
console.log(
  "  TENANT_SAMURAI_SQUARE_ACCESS_TOKEN len=",
  String(env.TENANT_SAMURAI_SQUARE_ACCESS_TOKEN).length,
);
