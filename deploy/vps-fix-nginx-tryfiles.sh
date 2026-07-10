#!/usr/bin/env bash
# Replace try_files SPA fallback with Express proxy in Kirin + Samurai nginx sites.
set -euo pipefail

patch_file() {
  local f="$1"
  if [ ! -f "$f" ]; then
    echo "SKIP missing: $f"
    return
  fi
  cp -a "$f" "$f.bak.$(date +%Y%m%d%H%M%S)"

  python3 - "$f" <<'PY'
import re, sys
from pathlib import Path
path = Path(sys.argv[1])
src = path.read_text()

new_location = """
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
""".rstrip() + "\n"

# Replace each "location / { ... try_files ... }" block (non-greedy within braces)
pattern = re.compile(
    r"location\s+/\s*\{[^{}]*try_files\s+\$uri\s+/index\.html;[^{}]*\}",
    re.MULTILINE,
)
count = len(pattern.findall(src))
if count == 0:
    print(f"WARN: no try_files location / found in {path}")
else:
    src2, n = pattern.subn(new_location.strip() + "\n", src)
    path.write_text(src2)
    print(f"OK: patched {n} location / block(s) in {path}")
PY
}

patch_file /etc/nginx/sites-enabled/kirin-resto
patch_file /etc/nginx/sites-enabled/samurai-resto

echo "==> Show location / after patch"
grep -nE 'location /|try_files|proxy_pass' /etc/nginx/sites-enabled/kirin-resto /etc/nginx/sites-enabled/samurai-resto || true

nginx -t
systemctl reload nginx

echo "==> Public SEO check"
curl -s https://kirinhibachiexpress.com/ | grep -E '<title>|canonical' || true
curl -s https://samurairesto.com/ | grep -E '<title>|canonical' || true
echo DONE
