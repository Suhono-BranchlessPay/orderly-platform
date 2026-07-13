#!/usr/bin/env node
/**
 * Generate hi-res QR PNGs/SVGs for flyer print — points at dynamic /r/:slug.
 *
 * Usage:
 *   node scripts/generate-tenant-qr.mjs samurai
 *   node scripts/generate-tenant-qr.mjs samurai --base https://samurairesto.com
 *   node scripts/generate-tenant-qr.mjs samurai --base https://orderlyfoods.com --out artifacts/qr-print
 *
 * Print the URL once; change landing via tenant.theme.qrRedirectUrl or orderPath
 * without reprinting. Requires public /r/:slug on the chosen base host (nginx → API).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { slugs: [], base: "https://samurairesto.com", outDir: "artifacts/qr-print" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = String(argv[++i] || "").replace(/\/$/, "");
    else if (a === "--out") out.outDir = String(argv[++i] || "");
    else if (a.startsWith("-")) {
      console.error("Unknown flag:", a);
      process.exit(1);
    } else out.slugs.push(a.toLowerCase());
  }
  if (!out.slugs.length) out.slugs = ["samurai"];
  return out;
}

async function loadQrcode() {
  try {
    const require = createRequire(import.meta.url);
    return require("qrcode");
  } catch {
    /* try from repo root / npx-installed */
  }
  try {
    const require = createRequire(join(root, "package.json"));
    return require("qrcode");
  } catch {
    return null;
  }
}

async function writeWithLib(QRCode, url, pngPath, svgPath) {
  await QRCode.toFile(pngPath, url, {
    type: "png",
    width: 2048,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  await QRCode.toFile(svgPath, url, {
    type: "svg",
    width: 2048,
    margin: 2,
    errorCorrectionLevel: "H",
  });
}

function writeWithNpx(url, pngPath, svgPath) {
  const png = spawnSync(
    "npx",
    ["--yes", "qrcode", "-o", pngPath, "-w", "2048", "-q", "2", "-t", "png", url],
    { cwd: root, stdio: "inherit", shell: true },
  );
  if (png.status !== 0) throw new Error("npx qrcode PNG failed");
  const svg = spawnSync(
    "npx",
    ["--yes", "qrcode", "-o", svgPath, "-w", "2048", "-q", "2", "-t", "svg", url],
    { cwd: root, stdio: "inherit", shell: true },
  );
  if (svg.status !== 0) throw new Error("npx qrcode SVG failed");
}

const { slugs, base, outDir } = parseArgs(process.argv.slice(2));
const absOut = resolve(root, outDir);
mkdirSync(absOut, { recursive: true });

const QRCode = await loadQrcode();
const manifest = [];

for (const slug of slugs) {
  const url = `${base}/r/${slug}`;
  const pngPath = join(absOut, `${slug}-qr-2048.png`);
  const svgPath = join(absOut, `${slug}-qr.svg`);
  if (QRCode) await writeWithLib(QRCode, url, pngPath, svgPath);
  else writeWithNpx(url, pngPath, svgPath);
  manifest.push({ slug, url, png: pngPath, svg: svgPath });
  console.log(`OK ${slug} → ${url}`);
  console.log(`  PNG ${pngPath}`);
  console.log(`  SVG ${svgPath}`);
}

writeFileSync(
  join(absOut, "manifest.json"),
  JSON.stringify({ generated_at: new Date().toISOString(), base, tenants: manifest }, null, 2),
);
console.log(`\nHand these files to Malik for flyer print. Do not invent scan counts — scans start after /r is live.`);
