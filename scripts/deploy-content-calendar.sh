#!/usr/bin/env bash
# Deploy Content Engine Phase 1 schema on VPS (api rebuild separate).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL}"
psql "$DATABASE_URL" -f "$ROOT/scripts/migrate-content-calendar.sql"
echo "OK: content_calendar + content_calendar_config ready"
