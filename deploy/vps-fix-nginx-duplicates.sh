#!/usr/bin/env bash
# Fix remaining try_files + report duplicate server_name conflicts.
set -euo pipefail

echo "==> All nginx files mentioning the domains"
grep -rlE 'kirinhibachiexpress|samurairesto' /etc/nginx 2>/dev/null || true

echo "==> ALL try_files /index.html still present?"
grep -rn 'try_files \$uri /index.html' /etc/nginx 2>/dev/null || echo "(none)"

echo "==> Patch EVERY remaining try_files SPA fallback"
python3 <<'PY'
import re
from pathlib import Path

new_location = """
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
""".strip() + "\n"

pattern = re.compile(
    r"location\s+/\s*\{[^{}]*try_files\s+\$uri\s+/index\.html;[^{}]*\}",
    re.MULTILINE,
)

roots = [Path("/etc/nginx/sites-enabled"), Path("/etc/nginx/sites-available"), Path("/etc/nginx/conf.d")]
for root in roots:
    if not root.exists():
        continue
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        src = path.read_text(errors="ignore")
        if "try_files" not in src or "index.html" not in src:
            continue
        if not pattern.search(src):
            continue
        bak = path.with_suffix(path.suffix + f".bak2")
        if not bak.exists():
            bak.write_text(src)
        src2, n = pattern.subn(new_location, src)
        path.write_text(src2)
        print(f"patched {n} in {path}")
PY

echo "==> Remaining try_files?"
grep -rn 'try_files \$uri /index.html' /etc/nginx 2>/dev/null || echo "(none left)"

echo "==> Duplicate server_name map (which files define each host)"
python3 <<'PY'
from pathlib import Path
import re
hosts = {}
for root in [Path("/etc/nginx/sites-enabled"), Path("/etc/nginx/conf.d")]:
    if not root.exists():
        continue
    for path in root.iterdir():
        if not path.is_file():
            continue
        text = path.read_text(errors="ignore")
        for m in re.finditer(r"server_name\s+([^;]+);", text):
            for h in m.group(1).split():
                h = h.strip()
                if not h:
                    continue
                hosts.setdefault(h, []).append(str(path))
for h, files in sorted(hosts.items()):
    if "kirin" in h or "samurai" in h:
        print(f"{h}:")
        for f in files:
            print(f"  - {f}")
        if len(set(files)) > 1 or len(files) > 1:
            # count occurrences inside same file too
            pass
PY

echo "==> Count server { blocks per file"
for f in /etc/nginx/sites-enabled/kirin-resto /etc/nginx/sites-enabled/samurai-resto; do
  [ -f "$f" ] || continue
  echo -n "$f server_blocks="
  grep -c 'server_name' "$f" || true
  echo "---- location / in $f ----"
  grep -nE 'listen |server_name|location /|try_files|proxy_pass' "$f"
done

nginx -t
systemctl reload nginx

echo "==> Verify public + which upstream (via header if any)"
curl -s https://kirinhibachiexpress.com/ | grep -E '<title>|canonical' || true
curl -s https://samurairesto.com/ | grep -E '<title>|canonical' || true

# Confirm Express is hit: injected title length / Kirin brand
curl -s https://kirinhibachiexpress.com/ | head -c 200; echo
echo DONE
