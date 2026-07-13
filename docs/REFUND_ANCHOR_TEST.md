# Refund + negative BP anchor — test procedure

Money path. Run only with Malik/Verry OK, restaurant open, **small test order** ($1–few dollars).

## What this proves

1. Square refund succeeds for a paid Orderly order  
2. `orders.payment_status = refunded` and `refund_cents` set (cents)  
3. Paid sales reports still use `payment_status=paid` only — refunds show separately  
4. BranchlessPay gets `POST /api/v1/anchor` with **negative** `amount` and `reference_id = {orderId}:refund`

## Steps

1. Place a small **pickup** paid test order on https://samurairesto.com (web or app).  
2. Note `order_id` (confirmation page / dashboard Live Orders).  
3. Wait until payment shows paid + (ideally) anchor proof — not required for refund itself.  
4. Call owner refund (PIN = restaurant owner PIN from VPS env — never paste PIN in chat/docs):

```bash
curl -sS -X POST "https://samurairesto.com/api/owner/orders/<ORDER_ID>/refund" \
  -H "Content-Type: application/json" \
  -H "Host: samurairesto.com" \
  -d '{"pin":"<OWNER_PIN>"}'
```

Expect JSON like:

```json
{
  "ok": true,
  "refund_cents": 134,
  "bp_refund_anchor": { "ok": true, "anchorId": "...", "status": "..." }
}
```

5. Dashboard → Payments: refunds line increases; sales totals do not re-count the refunded order as paid.  
6. BP / explorer: refund anchor exists (negative amount).

## Do not

- Refund a real diner order without owner ask  
- Commit PIN / keys  
- Invent success if BP returns error — log and fix

## After pass

OK to hand flyer QR print assets to Malik (`artifacts/qr-print/`).
