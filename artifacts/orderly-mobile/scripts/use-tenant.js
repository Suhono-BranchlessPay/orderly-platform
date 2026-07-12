#!/usr/bin/env node
/**
 * Select white-label app variant.
 * Usage:
 *   node scripts/use-tenant.js samurai-martinsville
 *   node scripts/use-tenant.js samurai-linton
 *   node scripts/use-tenant.js kirin
 */
const fs = require("fs");
const path = require("path");

const aliases = {
  samurai: "samurai-martinsville",
  martinsville: "samurai-martinsville",
  linton: "samurai-linton",
};

let slug = (process.argv[2] || "samurai-martinsville").toLowerCase();
slug = aliases[slug] || slug;

const root = path.join(__dirname, "..");
const tenantDir = path.join(root, "tenants", slug);
if (!fs.existsSync(path.join(tenantDir, "config.json"))) {
  console.error(`Unknown tenant: ${slug}`);
  console.error("Try: samurai-martinsville | samurai-linton | kirin");
  process.exit(1);
}

const cfg = JSON.parse(
  fs.readFileSync(path.join(tenantDir, "config.json"), "utf8"),
);

const envPath = path.join(root, ".env");
const lines = [
  `EXPO_PUBLIC_TENANT_SLUG=${slug}`,
  `EXPO_PUBLIC_PAYMENT_PROVIDER=square`,
  `# Square Application ID + sandbox/production come from GET /api/square/config (backend).`,
  `# Stage 1: set EXPO_PUBLIC_API_BASE_URL to local/staging — NEVER flip production Square env.`,
  `# Never put Square access tokens or fake nonces in the app.`,
];
fs.writeFileSync(envPath, lines.join("\n") + "\n");
console.log(`App variant: ${slug}`);
console.log(`Store name: ${cfg.appName}`);
console.log(`Android package: ${cfg.androidPackage}`);
console.log(`API default: ${cfg.apiBaseUrl || "(none — coming soon)"} → backend slug=${cfg.slug}`);
console.log(`Wrote ${envPath}`);
console.log(`Stage 1: add EXPO_PUBLIC_API_BASE_URL=<local-or-staging> (do not touch live Square env)`);
console.log(`Next: npx expo prebuild --platform android && npm run studio`);
