/**
 * WCAG AA contrast check for tenant theme pairs.
 * Run: node scripts/check-contrast.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tenantsDir = path.join(__dirname, "../tenants");

function hexToRgb(h) {
  const x = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
}
function lin(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function rel(h) {
  const [r, g, b] = hexToRgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [L1, L2] = [rel(a), rel(b)].sort((x, y) => y - x);
  return (L1 + 0.05) / (L2 + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
let failed = 0;

for (const slug of fs.readdirSync(tenantsDir)) {
  const cfgPath = path.join(tenantsDir, slug, "config.json");
  if (!fs.existsSync(cfgPath)) continue;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const t = cfg.theme;
  if (!t) continue;
  console.log(`\n== ${slug} ==`);
  const pairs = [
    ["text / background", t.text, t.background, AA_NORMAL],
    ["muted / background", t.muted, t.background, AA_NORMAL],
    ["accent(=link) / background", t.accent, t.background, AA_NORMAL],
    ["primary / background (large OK)", t.primary, t.background, AA_LARGE],
    ["onPrimary / primary", "#FFFFFF", t.primary, AA_NORMAL],
    ["text / surface", t.text, t.surface, AA_NORMAL],
    ["muted / surface", t.muted, t.surface, AA_NORMAL],
  ];
  for (const [label, fg, bg, min] of pairs) {
    const ratio = contrast(fg, bg);
    const ok = ratio + 1e-9 >= min;
    if (!ok) failed++;
    console.log(
      `  ${ok ? "OK" : "FAIL"} ${label}: ${ratio.toFixed(2)} (need ≥${min})`,
    );
  }
}

if (failed) {
  console.error(`\n${failed} contrast pair(s) failed AA.`);
  process.exit(1);
}
console.log("\nAll checked pairs pass AA thresholds.");
