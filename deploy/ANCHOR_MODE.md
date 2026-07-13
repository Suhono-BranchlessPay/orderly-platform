# Anchor mode + proof-back (Orderly)

## Modes (updated Jul 2026 — BP contract)

| Mode | Meaning | Tenants |
|------|---------|---------|
| `platform` | Orderly `POST /api/v1/anchor` after paid | Default for new restos |
| `pos-native` | Historical label for Samurai (Square also anchors) | **Samurai** — **still POSTs** Orderly `reference_id` to BP |

**Jul 2026 fix:** poll-only for Samurai meant BP never received Orderly order UUIDs.  
After card pay, Orderly **always** `POST /api/v1/anchor` when `BRANCHLESSPAY_LICENSE_KEY` is set, then polls / accepts webhook for `chain_tx_hash`.

## Create anchor (required)

```
POST https://branchlesspay.com/api/v1/anchor
Authorization: Bearer <BRANCHLESSPAY_LICENSE_KEY>
Content-Type: application/json

{
  "reference_id": "<orderly-order-uuid>",
  "amount": 1.34,
  "currency": "USD",
  "merchant_id": "orderly",
  "metadata": {
    "tenant_id": "samurai",
    "restaurant_name": "Samurai Martinsville",
    "source": "android"
  }
}
```

## Proof-back

1. **Webhook (preferred):** BP → `POST /api/anchor-callback`  
   - Auth: `Authorization: Bearer <BRANCHLESSPAY_WEBHOOK_SECRET>`  
     or header `X-BranchlessPay-Secret: <secret>`  
   - Body: `reference_id`, `tx_hash` / `chain_tx_hash`, `status`, optional `explorer_url`, `anchor_id`
2. **Poll:** after POST, or dashboard **Sync anchors**  
   - Prefer `GET /api/v1/anchor/by-reference/{ref}?tenant_id=<slug>`  
   - Auth: **same** `Authorization: Bearer <BRANCHLESSPAY_LICENSE_KEY>` (never omit)  
   - Platform keys: `tenant_id` query narrows to restaurant slug (required for reliable lookup)

## Env

```
BRANCHLESSPAY_LICENSE_KEY=<platform key>
BRANCHLESSPAY_WEBHOOK_SECRET=<shared secret with BP>
BRANCHLESSPAY_MERCHANT_ID=orderly
```

Do **not** commit the license key to git. Set it only in VPS `ecosystem.config.cjs`.

## Monitoring (Blok 1.3)

Optional ops alerts (log always; HTTP ping if URL set):

```
ORDERLY_ALERT_WEBHOOK_URL=https://hooks.slack.com/...   # or Discord-compatible
ORDERLY_ANCHOR_RATE_ALERT_PCT=90                          # alert if rate below this (n≥3 paid/24h)
ORDERLY_ANCHOR_STALE_HOURS=1
```

Triggers: low 24h anchor rate · stale pending > N hours · repeated `/api/anchor-callback` failures · BP 401/403 on POST/GET.

Dashboard: **Anchor health** + `GET /api/dashboard/reports/anchor-health`.

## Refund anchors

After Square refund, Orderly may `POST /api/v1/anchor` with **negative** `amount` and `reference_id` = `{orderId}:refund`.  
Owner path: `POST /api/owner/orders/:id/refund` + PIN. Sales reports stay on `payment_status=paid`; refunds show as separate `refund_cents`.
