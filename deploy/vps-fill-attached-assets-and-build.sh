#!/usr/bin/env bash
# Fill any missing attached_assets imports so Vite can build.
# Prefers previous dist hashes; falls back to copying a sibling image.
set -euo pipefail
ROOT="${ROOT:-/var/www/samurai-resto}"
SRC="$ROOT/artifacts/samurai-resto/src"
DIST="$ROOT/artifacts/samurai-resto/dist/public/assets"
DEST="$ROOT/attached_assets"
mkdir -p "$DEST"

python3 <<'PY'
from pathlib import Path
import re, shutil

root = Path("/var/www/samurai-resto")
src = root / "artifacts/samurai-resto/src"
dist = root / "artifacts/samurai-resto/dist/public/assets"
dest = root / "attached_assets"
dest.mkdir(parents=True, exist_ok=True)

needed = sorted({
    m.group(1)
    for p in src.rglob("*")
    if p.suffix in {".ts", ".tsx", ".js", ".jsx"}
    for m in re.finditer(r"""@assets/([^"'\s]+)""", p.read_text(encoding="utf-8", errors="ignore"))
})

dist_files = list(dist.glob("*")) if dist.is_dir() else []
existing = {p.name: p for p in dest.iterdir() if p.is_file()}

def find_dist(name: str):
    base, ext = Path(name).stem, Path(name).suffix
    variants = [base, base.replace(" ", "_"), base.replace("(", "").replace(")", "")]
    for f in dist_files:
        stem = f.stem  # may include -hash
        # strip vite hash (-8+ hex at end)
        core = re.sub(r"-[A-Za-z0-9_]{6,}$", "", stem)
        for v in variants:
            if core == v or core.startswith(v) or v.startswith(core[:24]):
                if f.suffix.lower() == ext.lower() or True:
                    return f
        # prefix match on original whatsapp date stamp
        if "WhatsApp_Image_2026-07-07" in name and "WhatsApp_Image_2026-07-07" in f.name:
            return f
        if "WhatsApp_Image_2026-06-10" in name and "WhatsApp_Image_2026-06-10" in f.name:
            return f
    return None

fallback = None
for cand in existing.values():
    if cand.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        fallback = cand
        break
if fallback is None:
    for f in dist_files:
        if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
            fallback = f
            break

ok = filled = miss = 0
for name in needed:
    target = dest / name
    if target.exists() and target.stat().st_size > 0:
        print("HAVE", name)
        ok += 1
        continue
    src_file = find_dist(name)
    # also try other existing attached file with same date prefix
    if src_file is None:
        prefix = name[:28]
        for n, p in existing.items():
            if n.startswith(prefix[:20]) or (
                "WhatsApp_Image_2026-07-07" in name and "WhatsApp_Image_2026-07-07" in n
            ):
                src_file = p
                break
    if src_file is None:
        src_file = fallback
    if src_file is None:
        print("MISS", name)
        miss += 1
        continue
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_file, target)
    print("FILL", name, "<=", getattr(src_file, "name", src_file))
    filled += 1
    existing[name] = target

print(f"have={ok} filled={filled} miss={miss}")
if miss:
    raise SystemExit(2)
PY

echo
echo "==> Rebuild storefront"
cd "$ROOT"
PORT=26204 BASE_PATH=/ pnpm --filter @workspace/samurai-resto run build
ls -la artifacts/samurai-resto/dist/public/orderly-powered*.png
pm2 restart samurai-api --update-env
echo DONE
