#!/usr/bin/env node
/**
 * Generate print-ready packaging QR images for a tenant slug.
 *
 * Usage:
 *   node scripts/generate-qr.mjs samurai
 *   node scripts/generate-qr.mjs kirin
 *   node scripts/generate-qr.mjs samurai-linton
 *
 * Output: assets/qr/{slug}.svg + assets/qr/{slug}-print.png (1024px)
 * Encodes: https://orderlyfoods.com/r/{slug}  (override with ORDERLY_QR_BASE_URL)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "qr");

const slug = (process.argv[2] || "samurai").trim().toLowerCase();
const base = (process.env.ORDERLY_QR_BASE_URL || "https://orderlyfoods.com").replace(
  /\/$/,
  "",
);
const url = `${base}/r/${slug}`;

fs.mkdirSync(OUT_DIR, { recursive: true });

const svgPath = path.join(OUT_DIR, `${slug}.svg`);
const pngPath = path.join(OUT_DIR, `${slug}-print.png`);

const svg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "H",
  margin: 2,
  color: { dark: "#000000", light: "#FFFFFF" },
});
fs.writeFileSync(svgPath, svg, "utf8");

await QRCode.toFile(pngPath, url, {
  type: "png",
  errorCorrectionLevel: "H",
  width: 1024,
  margin: 2,
  color: { dark: "#000000", light: "#FFFFFF" },
});

console.log("QR URL:", url);
console.log("Wrote:", svgPath);
console.log("Wrote:", pngPath);
console.log("Print tip: use SVG for sharp large prints; PNG 1024px for proofs.");
