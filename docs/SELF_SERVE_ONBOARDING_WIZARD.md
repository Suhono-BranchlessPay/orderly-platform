# Self-Serve Onboarding Wizard (11 steps)

**Date:** 23 Jul 2026  
**Trial tenant:** `samurai-linton`  
**Base:** [`TENANT_ONBOARDING_CHECKLIST.md`](./TENANT_ONBOARDING_CHECKLIST.md) + existing Blok 3.1 skeleton ([`SELF_SERVE_ONBOARDING.md`](./SELF_SERVE_ONBOARDING.md))

Build the UI **on top of** the checklist — do not replace ops truth with a marketing form.

## Hard rules

| Rule | Enforcement |
|------|-------------|
| Invite-only (not public signup) | `/onboarding?invite=<token>` required; no “Daftar” CTA on marketing site |
| Secrets never in git | Square / Meta tokens encrypted; invites are opaque tokens |
| Fail-closed | Phone, tax, timezone, ambiguous menu names block advance / Go Live |
| Human confirm before Go Live | `ONBOARDING_PUBLISH_ENABLED` + checklist gates; draft ≠ active |
| Branch + PR | Feature work on `feat/self-serve-onboarding-wizard` |

## Access model

1. Malik creates invite (script or master dashboard) → one-time token.  
2. Tenant opens `https://orderlyfoods.com/onboarding?invite=<token>`.  
3. Session created; invite marked claimed (not reusable).  
4. Draft save anytime; resume via `?session=<id>` (same invite session).

## Step map → storage / API

| Step | Name | Storage key (`wizard.*`) | Gate to leave step |
|------|------|--------------------------|--------------------|
| 1 | Identitas Bisnis | `identity` | Phone required; domain non-empty; address or host venue |
| 2 | Gaya Layanan | `serviceStyle` | All Y/N + presentation filled — **AI content blocked until set** |
| 3 | Lokasi & Jam | `hours` | Timezone **explicitly confirmed**; every weekday open/closed |
| 4 | Connect Square | existing OAuth + `taxConfirmed` | Location chosen; tax rate confirmed ≠ null |
| 5 | Menu / Katalog | `catalog` | Ambiguous names resolved; SKU prefix unique |
| 6 | Foto Menu | `photos` | Progress OK to continue (warn, not hard-block yet) |
| 7 | Connect Sosial | Meta OAuth or “contact us” fallback | IBA verified if connect path used |
| 8 | Google | GBP status + GSC OAuth | GBP can be “manual / pending” |
| 9 | Laporan & Ops | `ops` | Owner email + local send hour from Step 3 TZ |
| 10 | Compliance | `compliance` | Health Dept checkbox required |
| 11 | Review & Go Live | — | All P0 gates; Go Live ≠ Save draft |

## Checklist crosswalk (P0)

| Checklist # | Wizard step |
|-------------|-------------|
| 1–3 Square scoped / scopes | 4 |
| 4 Tax rate fail-closed | 4 + Go Live |
| 5 Paid smoke | Post Go Live (ops, not form) |
| 6–10 Identity / host / SEO | 1 + domain publish |
| 11–13 Catalog / modifiers | 5 |
| 14 Hours | 3 |
| 15–16 Photos | 6 |
| 21 Daily report | 9 |
| 22 Meta map | 7 |

## Implementation status

| Slice | Status |
|-------|--------|
| Invite table + gate | **Done (this branch)** |
| Step 1 identity API + UI | **Done (this branch)** |
| Step 2 service style + AI gate | **Done (this branch)** — `theme.serviceStyle`; AI tasks `social_draft` / `social_post` / `content_calendar` / `daily_report` fail with `service_style_required` until set; seed Samurai/Kirin via `scripts/migrate-seed-service-style-samurai-kirin.sql` |
| Step 3 hours + timezone | **Done (this branch)** — `wizard.hours` → `tenants.hours` `{timezone,weekly}`; complete requires `timezoneConfirmed` + 7 weekdays (no TBD); AI/report gate `timezone_required`; daily report prefers `hours.timezone`; seed via `scripts/migrate-seed-timezone-samurai-kirin.sql` |
| Step 4 Square + tax | **Done (this branch)** — OAuth start/callback + location list/set; `wizard.squareConnect` with `taxConfirmed` + `taxRate`; complete/publish refuse without Square location + confirmed rate; never prefills from another tenant (Linton stays NULL until Greene County confirmed) |
| Step 5 menu / catalog | **Done (this branch)** — `wizard.catalog` SKU prefix (+ reserved/live uniqueness check) + ambiguous-name review + prices/modifiers confirms; optional Square catalog preview; full `menu_items` sync still at publish (Blok A). **Known limitation:** ambiguous names require human ack (`ambiguousReviewed`) — wizard does not re-fetch Square to prove renames; future: second confirm of tagged names after fix. Adversarial live proof: `scripts/smoke-onboarding-adversarial-gates.sh` |
| Step 6 menu photos | **Done (this branch)** — soft/warn gate: `wizard.photos.coverageAcknowledged`; needs-photo plan required only when Square preview shows missing images; brand-assets checkbox; photo counts from catalog preview (`image_ids`) |
| Step 7 connect social | **Done (this branch)** — default `contact_us` (“Hubungi tim kami…”); OAuth path fail-closed (server-verified `meta_oauth_connections` for allow-listed invite target only); client cannot self-claim connected |
| Step 8 Google GBP+GSC | **Done (this branch)** — GBP `manual`/`pending`/`connected` (connected fail-closed); GSC `contact_us` or server-verified OAuth; `GET …/google/status` |
| Step 9 reports & ops | **Done (this branch)** — `wizard.ops` owner email + `sendHourLocal` (0–23) in Step 3 TZ (server-copied); `opsAck` for checklist #21 (`DAILY_REPORT_TENANTS` / FROM still ops-wired at Go Live); publish gate |
| Step 10 compliance | **Done (this branch)** — `wizard.compliance.healthDeptCleared` required; optional notes; publish gate |
| Step 11 Review & Go Live | **Done (this branch)** — `GET …/review` P0 gate summary; `wizard.review` dual ack; Mark ready → `status=ready` (≠ publish); `POST …/publish` still `ONBOARDING_PUBLISH_ENABLED` + draft/inactive shell only |
| Marketing refresh (Bagian 4) | Lower priority parallel |

## Linton trial notes

- Meta OAuth allow-list: may include `samurai-linton` for full test.  
- UI must still show **“Hubungi tim kami untuk mengaktifkan Facebook”** for non-controlled clients.  
- `tax_rate` for Linton must stay **NULL until Greene County rate confirmed** — never copy Martinsville 7%.
