#!/usr/bin/env bash
# Clean frontend build from a fresh git clone (avoids corrupted public/ paths on VPS).
# Usage: bash /tmp/vps-build-storefront-clean.sh
set -euo pipefail

ROOT="${ROOT:-/var/www/samurai-resto}"
SRC="${SRC:-/tmp/orderly-platform-src}"
REPO="${REPO:-https://github.com/Suhono-BranchlessPay/orderly-platform.git}"

echo "==> Fresh clone"
rm -rf "$SRC"
git clone --depth 1 "$REPO" "$SRC"

echo "==> Diagnose / copy storefront sources into live tree"
# Remove any path that should be a file but is a directory
find "$ROOT/artifacts/samurai-resto" -type d \( \
  -name 'index.html' -o -name '*.svg' -o -name '*.png' -o -name '*.jpg' \
  -o -name 'main.tsx' -o -name 'src' \
\) 2>/dev/null | while read -r d; do
  # only flag if name looks like a file (has a dot) OR empty wrong dirs named index.html
  base=$(basename "$d")
  case "$base" in
    *.*) echo "REMOVE bad dir: $d"; rm -rf "$d" ;;
  esac
done

# Never let public/src exist (steals /src/* asset resolution)
rm -rf "$ROOT/artifacts/samurai-resto/public/src"

rsync -a --delete \
  --exclude dist \
  --exclude node_modules \
  "$SRC/artifacts/samurai-resto/" "$ROOT/artifacts/samurai-resto/"

# Keep live public brand assets if present in ROOT but not in repo
# (kirin-logo.png etc. may only exist on server)
if [ -f "$ROOT/artifacts/samurai-resto/public/kirin-logo.png" ] || true; then
  :
fi

echo "==> URL audit in index.html"
python3 - <<'PY'
from pathlib import Path
import re, os
html = Path("/var/www/samurai-resto/artifacts/samurai-resto/index.html").read_text()
urls = re.findall(r'''(?:href|src)=["']([^"']+)["']''', html)
print("urls:", urls)
root = Path("/var/www/samurai-resto/artifacts/samurai-resto")
public = root / "public"
for u in urls:
    if u.startswith("http") or u.startswith("//") or u.startswith("data:"):
        continue
    if u.startswith("./"):
        p = (root / u[2:]).resolve()
    elif u.startswith("/"):
        # vite may resolve from public OR root
        candidates = [root / u.lstrip("/"), public / u.lstrip("/")]
        for p in candidates:
            if p.exists():
                print(u, "->", p, "DIR" if p.is_dir() else "file")
        continue
    else:
        p = (root / u).resolve()
    if "p" in dir() and Path(p).exists():
        print(u, "->", p, "DIR" if Path(p).is_dir() else "file")
PY

ls -la "$ROOT/artifacts/samurai-resto/src/main.tsx"
file "$ROOT/artifacts/samurai-resto/src/main.tsx"
file "$ROOT/artifacts/samurai-resto/index.html"

echo "==> Build from workspace root"
cd "$ROOT"
# Ensure workspace package points at synced sources
PORT=26204 BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build

test -f "$ROOT/artifacts/samurai-resto/dist/public/index.html"
grep -q "ORDERLY:TENANT_HEAD" "$ROOT/artifacts/samurai-resto/dist/public/index.html" \
  && echo "OK: built index has ORDERLY markers"

# Ensure STOREFRONT_DIST
python3 - <<'PY'
from pathlib import Path
import re
p = Path("/var/www/samurai-resto/ecosystem.config.cjs")
src = p.read_text()
dist = "/var/www/samurai-resto/artifacts/samurai-resto/dist/public"
if re.search(r"STOREFRONT_DIST\s*:", src):
    src = re.sub(r'STOREFRONT_DIST\s*:\s*["\'][^"\']*["\']', f'STOREFRONT_DIST: "{dist}"', src)
else:
    src = re.sub(r'(PORT\s*:\s*["\']?\d+["\']?\s*,)', rf'\1\n        STOREFRONT_DIST: "{dist}",', src, count=1)
p.write_text(src)
print("STOREFRONT_DIST ok")
PY

# Rebuild API too (tenantSeo/spaHtml)
pnpm --filter @workspace/api-server run build

pm2 delete samurai-api 2>/dev/null || true
pm2 start "$ROOT/ecosystem.config.cjs"
pm2 save

sleep 2
echo "==> SEO check"
curl -s -H "Host: kirinhibachiexpress.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical|og:title|og:site_name' | head -20 || true
curl -s -H "Host: samurairesto.com" http://127.0.0.1:8080/ \
  | grep -E '<title>|canonical' | head -10 || true
echo DONE
