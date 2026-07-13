# Go-live checklist (per tenant)

SOP before any restaurant goes live on Orderly. Use for **Kirin**, **Samurai Linton**, and every later tenant. Do not invent “ready” — check each box against real config / a real paid test order.

---

## 1. Identity & access

- [ ] Tenant row exists (`slug`, `name`, `status=active`)
- [ ] Correct `domain` / DNS A|CNAME → production engine (or storefront host)
- [ ] Owner PIN set (not a shared default in chat/docs)
- [ ] Dashboard manager login works for this tenant scope (orderlyfoods.com/dashboard)
- [ ] BP license / tenant secrets only in server env (never git, never client JS)

## 2. Square

- [ ] Square application + location wired for this tenant
- [ ] Sandbox vs production credentials match intended environment
- [ ] Catalog / menu items match Orderly menu IDs (or push path documented)
- [ ] Test card charge succeeds on the storefront for this host
- [ ] Square POS / Order Hub receives the order (items + notes + tip if tipped)

## 3. Menu & catalog

- [ ] Full menu entered (or C1 draft reviewed by a human)
- [ ] **Every price double-checked** (wrong price = real loss / trust damage)
- [ ] Unavailable / 86 items marked correctly
- [ ] Modifiers / required options work on web (and mobile if in scope)
- [ ] Photos: no gaping empty heroes; missing photo → minimal-center variant (not giant “Photo Needed”)
- [ ] Empty sections auto-hidden

## 4. Storefront & SEO

- [ ] Theme (colors, logo, fonts) looks like the brand
- [ ] Hours of operation correct (timezone checked)
- [ ] Address / phone / pickup instructions correct
- [ ] `curl -sI https://<domain>/` returns 200
- [ ] HTML `<title>` / Open Graph meta match this restaurant (Host-based injection)
- [ ] Mobile viewport usable (order path reachable in ≤2 taps from home)

## 5. Ordering & money path

- [ ] Pickup (and only enabled fulfillment modes) end-to-end: cart → pay → confirmation
- [ ] Tax + tip math matches expectation on a low-value **test** order
- [ ] Order appears in Live Orders (Pending → …) on dashboard
- [ ] `orders.channel` is honest (`web` / `android` / …) — do not invent channels
- [ ] Refund path known: owner `POST /api/owner/orders/:id/refund` (PIN) **or** support SOP — refunds set `refund_cents` / `payment_status=refunded` and do **not** inflate paid sales

## 6. Anchor (Audit Shield)

- [ ] `anchor_mode` set intentionally (`pos-native` / `create` / documented mode for this tenant)
- [ ] After paid: BP create-anchor runs when license key present (`metadata.tenant_id` = slug)
- [ ] Callback and/or poll fills `chain_tx_hash` / `bp_anchor_status`
- [ ] Dashboard Anchor verification shows proof (not permanent “—” / untracked for new paid orders)
- [ ] Anchor health card: no pile of pending >1h after smoke test
- [ ] `ORDERLY_ALERT_WEBHOOK_URL` set if ops wants Slack/Discord pings (optional but recommended)

## 7. Dynamic QR (flyers)

- [ ] Public `GET https://<domain>/r/<slug>` redirects to order landing
- [ ] Nginx (or edge) proxies `/r/` to api-server **before** SPA catch-all
- [ ] Landing overridable via `tenants.theme.qrRedirectUrl` or `theme.orderPath` (no reprint)
- [ ] Scan row appears in `qr_scans` + dashboard **QR scans** after one phone scan
- [ ] Print assets generated: `node scripts/generate-tenant-qr.mjs <slug> --base https://<domain>`

## 8. Ops & support

- [ ] One named person on call for launch day
- [ ] Kill / pause path known (tenant `inactive` or Square location pause)
- [ ] Owner can update status (kitchen) without engineering
- [ ] No C5 marketing send until consent + counsel clear
- [ ] No Stripe Connect / marketplace payouts until legal clear

## 9. Launch-day smoke (do not skip)

1. Phone on cellular (not restaurant Wi‑Fi only): open site → order → pay $1–few dollars test → confirm.
2. Dashboard: Live Orders + Payments/tips update within refresh window.
3. Anchor: proof or honest pending (not silent 401).
4. Scan printed QR once → lands on order page → one `qr_scans` row.
5. Refund **only if** planned: refund test order → `refund_cents` set → dashboard refunds line → negative BP refund anchor when BP configured.

---

## Hold (do not block go-live on these)

- Stripe Connect live / delivery payouts (legal)
- C5 marketing SEND (consent + lawyer)
- Gelombang 2 funnel / kitchen-time boards (need volume)
- Full grocery features (inventory/shipping) — seams only

---

*Last updated: 13 Jul 2026 — Orderly Platform*
