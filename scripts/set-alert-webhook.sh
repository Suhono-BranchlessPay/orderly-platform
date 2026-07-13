#!/usr/bin/env bash
# Set ORDERLY_ALERT_WEBHOOK_URL on Samurai VPS without printing the URL.
# Usage on VPS:
#   bash set-alert-webhook.sh 'https://hooks.slack.com/services/...'
set -euo pipefail
URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Usage: $0 <webhook_url>"
  exit 1
fi
APP=/var/www/samurai-resto
ECO="$APP/ecosystem.config.cjs"
if [ ! -f "$ECO" ]; then
  echo "missing ecosystem.config.cjs"
  exit 1
fi
cp -a "$ECO" "$ECO.bak-alert-$(date +%F-%H%M)"
node -e '
const fs = require("fs");
const path = process.argv[1];
const url = process.argv[2];
let src = fs.readFileSync(path, "utf8");
if (/ORDERLY_ALERT_WEBHOOK_URL\s*:/.test(src)) {
  src = src.replace(
    /ORDERLY_ALERT_WEBHOOK_URL\s*:\s*["'\''][^"'\'']*["'\'']/,
    "ORDERLY_ALERT_WEBHOOK_URL: " + JSON.stringify(url),
  );
} else {
  src = src.replace(
    /(name:\s*["'\'']samurai-api["'\''][\s\S]*?env:\s*\{)/,
    "$1\n      ORDERLY_ALERT_WEBHOOK_URL: " + JSON.stringify(url) + ",",
  );
}
fs.writeFileSync(path, src);
console.log("ORDERLY_ALERT_WEBHOOK_URL updated (value not printed)");
' "$ECO" "$URL"

cd "$APP"
pm2 restart ecosystem.config.cjs --update-env || pm2 restart samurai-api --update-env
sleep 2
node -e '
const e = require("/var/www/samurai-resto/ecosystem.config.cjs");
const p = e.apps.find((a) => a.name === "samurai-api");
const v = p && p.env && p.env.ORDERLY_ALERT_WEBHOOK_URL;
console.log("ORDERLY_ALERT_WEBHOOK_URL_set:", Boolean(v && String(v).trim()));
console.log("length:", v ? String(v).length : 0);
'
echo "Done."
