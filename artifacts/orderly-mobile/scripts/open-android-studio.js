#!/usr/bin/env node
/** Open the generated android/ folder in Android Studio (Windows). */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const androidDir = path.join(__dirname, "..", "android");
if (!fs.existsSync(androidDir)) {
  console.error("android/ missing. Run: npm run prebuild:android");
  process.exit(1);
}

const studio =
  process.env.ANDROID_STUDIO ||
  "C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe";

if (!fs.existsSync(studio)) {
  console.error(`Android Studio not found at: ${studio}`);
  console.error("Set ANDROID_STUDIO env or open android/ manually.");
  process.exit(1);
}

spawn(studio, [androidDir], { detached: true, stdio: "ignore" }).unref();
console.log(`Opened Android Studio → ${androidDir}`);
