#!/usr/bin/env bash
# Delete a hard-coded list of TEST orders (legacy / never-anchored) and all rows
# that reference them. DESTRUCTIVE + IRREVERSIBLE.
#
# Safety model:
#   1. DRY-RUN by default: prints the exact orders + related-row counts. No writes.
#   2. Actual delete only when you pass --confirm AND the matched order count
#      equals the expected count (override with EXPECT=<n>).
#   3. Before any delete it takes a full pg_dump backup to /root/backups/.
#   4. All deletes run inside a single transaction (all-or-nothing).
#
# Usage (on the VPS):
#   export DATABASE_URL="$(pm2 env 0 | sed -n 's/^DATABASE_URL: //p')"
#   bash scripts/delete-test-orders.sh              # dry-run (safe)
#   bash scripts/delete-test-orders.sh --confirm    # actually delete (after review)
set -euo pipefail

# --- The 9 test orders to remove (8-char id prefixes from the anchor report) ---
PREFIXES=(
  49e959d0 0206c3f6 f86a15e4 ff5fef43 03743530 64be6d46   # 6 pending
  cc854d69 d1999f51 a9d9438f                               # 3 untracked
)
EXPECT="${EXPECT:-9}"

CONFIRM="no"
[ "${1:-}" = "--confirm" ] && CONFIRM="yes"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Hint:  export DATABASE_URL=\"\$(pm2 env 0 | sed -n 's/^DATABASE_URL: //p')\""
  exit 1
fi

# Build SQL list: ('49e959d0','0206c3f6',...)
IN_LIST=$(printf "'%s'," "${PREFIXES[@]}")
IN_LIST="(${IN_LIST%,})"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X)

echo "==================================================================="
echo " TEST-ORDER CLEANUP  (mode: $([ "$CONFIRM" = yes ] && echo DELETE || echo DRY-RUN))"
echo " Prefixes: ${PREFIXES[*]}"
echo "==================================================================="

echo
echo "-- Matched orders --------------------------------------------------"
"${PSQL[@]}" -P pager=off -c "
  SELECT left(id,8) AS id8, created_at, customer_name, total,
         status, payment_status, square_order_id,
         COALESCE(NULLIF(chain_tx_hash,''),'(none)') AS chain_tx
  FROM orders
  WHERE left(id,8) IN ${IN_LIST}
  ORDER BY created_at;"

MATCHED=$("${PSQL[@]}" -tA -c "SELECT count(*) FROM orders WHERE left(id,8) IN ${IN_LIST};")
MATCHED=$(echo "$MATCHED" | tr -d '[:space:]')
echo
echo "Matched order count: $MATCHED (expected: $EXPECT)"

echo
echo "-- Related rows that will also be removed --------------------------"
"${PSQL[@]}" -P pager=off -c "
  SELECT 'order_lines'               AS tbl, count(*) FROM order_lines               WHERE left(order_id,8) IN ${IN_LIST}
  UNION ALL SELECT 'analytics_events',        count(*) FROM analytics_events         WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST}
  UNION ALL SELECT 'bridge_webhook_deliveries',count(*) FROM bridge_webhook_deliveries WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST}
  UNION ALL SELECT 'gift_card_transactions',  count(*) FROM gift_card_transactions   WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST}
  UNION ALL SELECT 'loyalty_transactions',    count(*) FROM loyalty_transactions     WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST};"

if [ "$CONFIRM" != "yes" ]; then
  echo
  echo "DRY-RUN complete. Nothing was changed."
  echo "Review the rows above, then re-run with --confirm to delete."
  exit 0
fi

# ---- From here on: real delete ----
if [ "$MATCHED" != "$EXPECT" ]; then
  echo
  echo "ABORT: matched=$MATCHED but expected=$EXPECT. Refusing to delete a"
  echo "different set than reviewed. Set EXPECT=$MATCHED to override if intended."
  exit 1
fi

mkdir -p /root/backups
STAMP=$(date +%Y%m%d%H%M%S)
BACKUP="/root/backups/orders-before-testdelete-$STAMP.sql"
echo
echo "-- Full DB backup before delete → $BACKUP"
pg_dump "$DATABASE_URL" > "$BACKUP"
echo "Backup size: $(du -h "$BACKUP" | cut -f1)"

echo
echo "-- Deleting (single transaction) ----------------------------------"
"${PSQL[@]}" -c "
  BEGIN;
  DELETE FROM order_lines               WHERE left(order_id,8) IN ${IN_LIST};
  DELETE FROM analytics_events          WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST};
  DELETE FROM bridge_webhook_deliveries WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST};
  DELETE FROM gift_card_transactions    WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST};
  DELETE FROM loyalty_transactions      WHERE order_id IS NOT NULL AND left(order_id,8) IN ${IN_LIST};
  DELETE FROM orders                    WHERE left(id,8) IN ${IN_LIST};
  COMMIT;"

echo
echo "-- Verify (should be 0) -------------------------------------------"
"${PSQL[@]}" -tA -c "SELECT count(*) FROM orders WHERE left(id,8) IN ${IN_LIST};"
echo
echo "DONE. Backup at $BACKUP"
echo "Refresh dashboard → Anchor tab to confirm the rate reflects only real orders."
