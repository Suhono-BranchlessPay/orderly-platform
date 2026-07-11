#!/usr/bin/env bash
# Restore /var/www/samurai-resto/attached_assets after an rsync --delete wipe.
# Strategy: pull hashed files from the last successful Vite dist and rename via
# the import basenames expected by samurai-resto source.
set -euo pipefail

ROOT="${ROOT:-/var/www/samurai-resto}"
DIST_ASSETS="$ROOT/artifacts/samurai-resto/dist/public/assets"
DEST="$ROOT/attached_assets"
SRC_ROOT="$ROOT/artifacts/samurai-resto/src"

mkdir -p "$DEST"

if [ ! -d "$DIST_ASSETS" ]; then
  echo "ERROR: no previous dist assets at $DIST_ASSETS"
  echo "You need a backup of attached_assets (Hostinger snapshot / local machine / Replit)."
  exit 1
fi

echo "==> Scanning source for @assets imports..."
mapfile -t NEEDED < <(
  grep -rhoE '@assets/[^"'\'' ]+' "$SRC_ROOT" 2>/dev/null \
    | sed 's|^@assets/||' \
    | sort -u
)

echo "Needed ${#NEEDED[@]} files:"
printf '  - %s\n' "${NEEDED[@]}"

echo "==> Matching against previous dist hashes..."
shopt -s nullglob
DIST_FILES=("$DIST_ASSETS"/*)

restored=0
missing=0
for name in "${NEEDED[@]}"; do
  base="${name%.*}"
  ext="${name##*.}"
  # Vite usually emits: OriginalName-HASH.ext  (spaces often become _)
  candidate=""
  for f in "${DIST_FILES[@]}"; do
    bn=$(basename "$f")
    # strip vite hash: name-8hex.ext
    if [[ "$bn" == "$base-"*".$ext" ]] || [[ "$bn" == "${base// /_}-"*".$ext" ]]; then
      candidate="$f"
      break
    fi
    # looser: startswith first 20 chars of base
    prefix="${base:0:20}"
    if [[ "$bn" == "$prefix"*".$ext" ]]; then
      candidate="$f"
      break
    fi
  done

  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    cp -a "$candidate" "$DEST/$name"
    echo "OK  $name  <=  $(basename "$candidate")"
    restored=$((restored + 1))
  else
    echo "MISS $name"
    missing=$((missing + 1))
  fi
done

echo
echo "Restored: $restored  Missing: $missing"
ls -la "$DEST" | head -50

if [ "$missing" -gt 0 ]; then
  echo
  echo "Some files still missing. List dist assets for manual mapping:"
  ls -1 "$DIST_ASSETS" | head -80
  exit 2
fi

echo
echo "All attached_assets restored. Rebuild storefront:"
echo "  cd $ROOT && PORT=26204 BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build"
echo "  pm2 restart samurai-api --update-env"
