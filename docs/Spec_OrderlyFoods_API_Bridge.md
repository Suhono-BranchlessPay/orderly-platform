# Spec — Orderly Foods API Bridge v1

**Status:** Implemented in `artifacts/api-server` (Phase A3).  
**Consumers:** Dashboard (Phase B), AI service Python/FastAPI (Phase C).  
**Rule:** AI and dashboard **never** touch Orderly DB or Square secrets directly.

## Auth

| Env | Purpose |
|-----|---------|
| `ORDERLY_BRIDGE_API_KEY` | Single service key (Bearer or `X-Orderly-Bridge-Key`) |
| `ORDERLY_BRIDGE_ALLOWED_TENANTS` | Comma list, e.g. `samurai` — or omit/`*` for all |
| `ORDERLY_BRIDGE_KEYS_JSON` | Optional multi-key map: `{"keyA":{"tenants":["samurai"]},"keyB":{"tenants":["*"]}}` |
| `ORDERLY_BRIDGE_WEBHOOK_URL` | AI endpoint for `order.completed.v1` |
| `ORDERLY_BRIDGE_WEBHOOK_SECRET` | HMAC secret for outbound webhooks |
| `ORDERLY_BRIDGE_RATE_LIMIT_PER_MIN` | Default `120` |

**Tenant scoping is server-enforced.** A key may only read `tenant_id` values on its allowlist. Do not trust the caller alone.

## Endpoints

Base: `/api/bridge`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Key ok |
| GET | `/v1/menu?tenant_id=` | Categories + items (prices as `price_cents`) |
| GET | `/v1/customers?tenant_id=` | CRM + consent fields |
| GET | `/v1/orders?tenant_id=&from=&to=` | Transactions + money cents + **anchor proof** |
| POST | `/v1/menu/import` | Human-approved menu lines from AI (C1) → Orderly menu (+ optional Square) |
| POST | `/v1/coupons` | AI coupon draft intake (activation later / C5) |

All responses use **integer cents** for money. No fake metrics.

## Webhook: `order.completed.v1`

Fired after a paid order is saved (best-effort; failures logged).

Headers:
- `X-Orderly-Timestamp` — unix seconds
- `X-Orderly-Signature` — `hex(HMAC_SHA256(secret, "{timestamp}.{body}"))`
- `X-Orderly-Event` — `order.completed.v1`
- `Idempotency-Key` — `order.completed.v1:{orderId}`

Body includes:
- `order.money.*_cents`
- `anchor.chain_tx_hash`, `anchor.explorer_url`, BP fields

Deliveries are stored in `bridge_webhook_deliveries` (unique on tenant + idempotency key).

## Audit

`bridge_audit_log` records bridge key id (hashed), method, path, tenant, status.

## Explicit non-goals

- No direct DB access for AI
- No Kafka
- No marketing send from this bridge
- No Stripe payouts
