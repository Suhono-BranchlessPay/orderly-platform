# Blok 4.1 — Social Media TRIAL (skeleton)

**Scope:** ONE tenant only — Samurai Martinsville (`samurai`). Facebook Page +
Instagram (Meta). This is a **skeleton that can grow**, not the full Meta
OAuth / multi-tenant build. GBP (Google Business Profile, Blok 4.2) is **not**
implemented — see "Next" at the bottom.

## Hard rules (enforced in code, not just policy)

| Rule | Where it's enforced |
| --- | --- |
| MODE AWAL: every reply needs human approval. No auto-send. | `/inbox/:id/approve` never calls Meta; `/inbox/:id/send` is a separate, explicit, human-triggered step. **It now calls the real Meta Graph API — but only once every gate below has already passed.** |
| Hard gate order (ALL must pass before any HTTP call). | `sendApprovedReply()` in `lib/social.ts`, in order: (1) kill switch OFF for the tenant, (2) classification not `allergy_health`/`complaint`/`spam`, (3) row `status === "approved"` (a human ran `/approve`), (4) `SOCIAL_SEND_ENABLED=1`, (5) a Page access token is configured, (6) the row has the id Graph needs (comment id or Messenger PSID). Any failure short-circuits — no network call is made. |
| 🚫 Complaint / negative review → never auto-send. Alert owner + draft only. | `sendApprovedReply()` hard-blocks `classification === "complaint"` with `403`, even if approved. |
| 🚫 Allergy / health / halal → never auto-answer. Escalate only. | `draftReplyForRow()` refuses to generate a draft for `classification === "allergy_health"`; row is marked `blocked` and the response includes `escalate: true` + a note. `/send` also hard-blocks this classification with `403`. |
| 🚫 Spam / troll → never reply. | `draftReplyForRow()` sets `status: "skipped"`, `draft_reply: null` for `classification === "spam"`. `/send` also hard-blocks it. |
| Tokens in SECRETS / env only, never plaintext in DB. | No token column exists in `social_inbox` / `social_reply_audit`. Tokens are read via `tenantSecret()` (env only) in `lib/socialConfig.ts`, and never appear in a log line, thrown `Error`, or `social_reply_audit.meta`. |
| Kill switch per tenant. | `SOCIAL_KILL_SWITCH_<TENANT_ID>=1` checked first in `sendApprovedReply()` — `403` regardless of anything else. |
| Missing Meta id → fail honestly, never guess. | If the row's `external_message_id` (comment id) or `external_thread_id` (Messenger PSID) needed for its kind of reply is missing, `/send` returns `400` and writes a `send_failed` audit row — it never falls back to a different id or skips the check. |
| Audit log of everything sent. | Every approve / edit / skip / block / kill_switch / send / **send_failed** writes a `social_reply_audit` row (`before_body`, `after_body`, `actor`, `meta`). |

## What is STUB vs REAL right now

**Real (working today):**
- DB schema (`social_inbox`, `social_reply_audit`) + Drizzle types.
- Webhook receive + row creation (idempotent on `tenant_id, platform, external_message_id`).
- Heuristic (keyword) classification — praise / question / complaint /
  allergy_health / spam / unknown.
- Draft template generation (per classification).
- Human approve/edit/skip flow + full audit trail.
- Kill switch, send-enabled gate, tenant-scoped dashboard auth.
- **`/inbox/:id/send` now calls the real Meta Graph API** (`src/integrations/metaGraph.ts`)
  — but only after every hard gate above passes:
  - **Page/IG feed comment** (`raw.kind === "comment"`, the default): `POST
    https://graph.facebook.com/{version}/{comment-id}/comments` with
    `message` + `access_token`, using the row's `external_message_id` as the
    comment id.
  - **Messenger / IG DM** (`raw.kind === "message"`): `POST
    https://graph.facebook.com/{version}/me/messages` with `recipient.id` +
    `message.text`, using the row's `external_thread_id` as the PSID.
  - `META_GRAPH_API_VERSION` overrides the default (`v21.0`) if Meta ships a
    newer version during the trial.
  - Success writes a `send` audit row with the returned Meta id
    (`external_reply_id`) and flips `status` to `sent`. Failure (missing id,
    Meta 4xx/5xx, network error) writes a `send_failed` audit row and returns
    a `400`/`502` — the row's `status` stays `approved` so it can be retried.
  - **This is still single-tenant (Samurai) and still 100% human-gated.**
    Nothing in the webhook path or the draft/approve flow changed — a human
    must approve, then a human must separately click `/send`.

**Stub (intentionally not implemented yet):**
- **No real Meta OAuth.** There's no "Connect Facebook Page" flow. Malik gets
  a Page Access Token manually from Meta's Graph API Explorer / a Meta
  developer app and puts it in env (see below).
- **Webhook signature verification (`X-Hub-Signature-256`) is not enforced.**
  `express.json()` has already parsed the body by the time our route runs,
  and re-serializing JSON isn't guaranteed to byte-match Meta's original raw
  request — attempting HMAC verification on the re-serialized body would
  produce false negatives. The helper (`verifyMetaSignature` in
  `lib/socialWebhook.ts`) exists but isn't wired in. Closing this gap needs a
  raw-body-capture middleware scoped to this one route, mounted *before*
  `express.json()`.
- **Classification is keyword heuristics, not ML.** It is intentionally
  biased toward the "safer" bucket (e.g. any allergy/halal keyword wins over
  everything else). It will have false positives — that's the point; a human
  reviews every single reply anyway.
- **Page ID → tenant mapping** defaults to `samurai` unless
  `META_PAGE_ID_TENANT_MAP_JSON` is set. Fine for a single-tenant trial; do
  **not** rely on the fallback once a second tenant is onboarded.

## Setup steps for Malik

1. **Create/reuse a Meta developer app** (developers.facebook.com) with the
   Facebook Page + Instagram Messaging products added.
   - **Publish status note:** while the app is in **Development mode**
     (unpublished), Meta only delivers webhooks for Pages/Instagram accounts
     where an app admin/developer/tester role is added on
     developers.facebook.com → App roles. Comments/DMs from the *public* on
     a live Page may **not** arrive as webhooks until the app is either
     published or the commenter's account is added as a tester — this is a
     Meta platform limitation, not a bug in this code. Budget for this when
     smoke-testing with real public traffic.
   - **App Review is still required later**, before this can be turned on
     for any *client* Page (i.e. a Page Orderly does not itself administer).
     Meta requires Advanced Access to `pages_messaging` and
     `pages_manage_engagement` (or equivalent permissions) via App Review
     before a non-admin/tester Page can receive webhooks or accept replies
     from this app in production. The Samurai trial works without App Review
     only because Samurai's Page has Orderly staff added with a role on the
     app. **Do not assume this same setup works for a new client Page
     without going through App Review first.**
2. **Get a Page Access Token** for the Samurai Facebook Page (Graph API
   Explorer, or a proper long-lived token via the app). Put it in env —
   **never in git, never in the DB**:
   ```
   META_PAGE_ACCESS_TOKEN=<token>
   ```
   (Optional per-tenant override pattern used elsewhere in this codebase:
   `TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN=<token>` — checked first.)
3. **Set a webhook verify token** (any string you choose) and put it in env:
   ```
   META_WEBHOOK_VERIFY_TOKEN=<pick-a-random-string>
   ```
4. **Subscribe the webhook** in the Meta app dashboard to:
   `https://<your-api-domain>/api/social/webhooks/meta`
   Meta will call this URL with `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
   to verify it — our server echoes `hub.challenge` back only if the token
   matches `META_WEBHOOK_VERIFY_TOKEN`.
5. **Subscribe to fields**: `feed` (Page comments) and/or `messages`
   (Messenger), plus the Instagram equivalents if testing IG too.
6. **(Optional) App secret** for future signature verification:
   ```
   META_APP_SECRET=<app secret>
   ```
7. **Leave sending OFF** until everything above is proven safe:
   ```
   SOCIAL_SEND_ENABLED=0
   SOCIAL_KILL_SWITCH_SAMURAI=0
   ```
   (Kill switch `=1` forcibly blocks sending regardless of anything else —
   use it as a big red button if something looks wrong.)
8. **Dashboard access**: use your existing Orderly console login
   (`/dashboard`) — master sees all tenants, manager is locked to `samurai`.
   For quick curl testing without a browser session, set:
   ```
   SOCIAL_INTERNAL_API_KEY=<pick-a-random-string>
   ```
   and send header `X-Social-Internal-Key: <that string>`. **Internal use
   only — never expose this key to a browser or to a restaurant.**

## AI Gateway draft (Fase 1)

Draft replies go through `ai.run("social_draft")` (`docs/SPEC_AI_GATEWAY.md`):

- Default provider: **local** rules (peer-to-peer → **skip**, no generic follow-up)
- Optional: `AI_SOCIAL_DRAFT_PROVIDER=openai|anthropic` + API key
- Prompt: `docs/prompts/PROMPT_Social_Inbox_Draft.txt` (also under `artifacts/api-server/config/prompts/`)
- Allergy/spam still hard-blocked in `social.ts` **before** any vendor call
- Emergency rollback: `AI_GATEWAY_ENABLED=0` → legacy templates only

## Human-approve flow (MODE AWAL)

```
Meta webhook → social_inbox (status=new, classification=heuristic)
                     │
                     ▼
        POST /inbox/:id/draft   (human clicks "Draft reply" in dashboard)
                     │
        ┌────────────┼─────────────────────────────┐
        ▼            ▼                              ▼
  allergy_health   spam                    everything else
  status=blocked   status=skipped          status=pending_approval
  escalate=true    (never drafted)         draft_reply=<template>
  (owner must      (never drafted,                  │
   answer directly, never replied to)                ▼
   verbatim, off-                          POST /inbox/:id/approve
   platform if                             { edited_body? }  (human edits/approves)
   needed)                                            │
                                                       ▼
                                            status=approved
                                            send: "deferred_until_token_and_human_mode_proven"
                                                       │
                                                       ▼
                                            POST /inbox/:id/send  (separate explicit click)
                                            → real Meta Graph API call, but ONLY if kill switch
                                              is off AND SOCIAL_SEND_ENABLED=1 AND token is set
                                              AND classification is safe AND row is "approved"
                                              AND the row has the id Graph needs. Any missing
                                              gate or id → 400/403/501, audited as send_failed
                                              (or the specific gate's action), status unchanged.
```

At every arrow, a `social_reply_audit` row is written (actor + before/after
body + action). Nothing skips this trail.

## Env vars needed from Malik

| Var | Required? | Notes |
| --- | --- | --- |
| `META_PAGE_ACCESS_TOKEN` | For real webhook data & the real send gate | Never commit. Can be per-tenant: `TENANT_SAMURAI_META_PAGE_ACCESS_TOKEN`. |
| `META_WEBHOOK_VERIFY_TOKEN` | Yes, to subscribe the webhook | Any random string you pick. |
| `META_APP_SECRET` | Optional (future signature check) | Not enforced yet — see "Stub" section. |
| `META_PAGE_ID_TENANT_MAP_JSON` | Optional | `{"<pageId>":"samurai"}`. Defaults to `samurai` without it. |
| `META_GRAPH_API_VERSION` | Optional | Default `v21.0`. Override if Meta deprecates that version mid-trial. |
| `SOCIAL_DEFAULT_TENANT_ID` | Optional | Default `samurai`. |
| `SOCIAL_KILL_SWITCH_SAMURAI` | Recommended `=0` while testing | `1` = hard-block all sends for `samurai`, independent of everything else. |
| `SOCIAL_SEND_ENABLED` | **Keep `=0` (or unset) in production until you have explicitly decided to go live** | Global gate; `/send` returns `501` without it. **Do not enable by default** — this PR intentionally leaves it off. |
| `SOCIAL_INTERNAL_API_KEY` | Optional, curl testing only | Never expose to a browser. |

None of these are committed anywhere — see `artifacts/api-server/.env.sandbox.example` for the documented (non-secret) template.

## How to verify with curl

Set `BASE=https://<your-api-domain>` (or `http://localhost:8080` locally) and
either a dashboard session cookie or `X-Social-Internal-Key: <key>` header.

**1. Health (no auth, no secrets leaked):**
```bash
curl -s "$BASE/api/social/health" | jq
# { "ok": true, "service": "orderly-social-trial",
#   "send_globally_enabled": false,
#   "tenants": [{ "tenant_id": "samurai", "kill_switch": false,
#                 "send_globally_enabled": false, "meta_token_configured": false }] }
```

**2. Webhook verify challenge (what Meta calls when you subscribe):**
```bash
curl -s "$BASE/api/social/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=12345"
# -> 12345 (plain text) if the token matches META_WEBHOOK_VERIFY_TOKEN
```

**3. Simulate an inbound Facebook comment (no real Meta call needed):**
```bash
curl -s -X POST "$BASE/api/social/webhooks/meta" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "123456789",
      "changes": [{
        "field": "feed",
        "value": {
          "item": "comment",
          "comment_id": "cmt_test_1",
          "post_id": "post_test_1",
          "from": { "id": "u1", "name": "Jane Doe" },
          "message": "This was delicious, thank you!"
        }
      }]
    }]
  }'
# -> { "ok": true, "ingested": 1, "duplicates": 0, "note": "receive-only — no reply sent" }
```
Try again with `"message": "I have a peanut allergy, does this have peanuts?"`
to see `classification: "allergy_health"`, or `"message": "Buy followers now http://spam.example"`
for `classification: "spam"`.

**4. List the inbox (dashboard session or internal key):**
```bash
curl -s "$BASE/api/social/inbox?tenant_id=samurai" \
  -H "X-Social-Internal-Key: $SOCIAL_INTERNAL_API_KEY" | jq
```

**5. Draft a reply for a `new` row:**
```bash
curl -s -X POST "$BASE/api/social/inbox/<id>/draft" \
  -H "X-Social-Internal-Key: $SOCIAL_INTERNAL_API_KEY" | jq
```

**6. Approve (optionally with an edited body):**
```bash
curl -s -X POST "$BASE/api/social/inbox/<id>/approve" \
  -H "Content-Type: application/json" \
  -H "X-Social-Internal-Key: $SOCIAL_INTERNAL_API_KEY" \
  -d '{"edited_body": "Thanks so much for the kind words! 🙏"}' | jq
# -> send: "deferred_until_token_and_human_mode_proven"
```

**7. Send (real Meta Graph API call — will 400/403/501 until every gate passes):**
```bash
curl -s -X POST "$BASE/api/social/inbox/<id>/send" \
  -H "X-Social-Internal-Key: $SOCIAL_INTERNAL_API_KEY" | jq
# With SOCIAL_SEND_ENABLED unset/0: -> 501 "Sending is disabled..."
# With SOCIAL_SEND_ENABLED=1 but no token: -> 501 "No META_PAGE_ACCESS_TOKEN configured..."
# With everything set but the row missing external_message_id: -> 400 "Missing external_message_id..."
# On success: -> 200 { "inbox": {...status:"sent"}, "sent": "sent", "external_reply_id": "<meta-id>" }
```

**How to smoke-test the REAL send path on a non-sensitive test row:**
1. Pick (or create via the webhook simulate call in step 3) a `praise` or
   `question` row for a **test post/comment you own** — never a real
   customer's comment while testing the send path for the first time.
2. Draft → approve it (steps 5–6) so `status === "approved"`.
3. In a **non-production** env only, set:
   ```
   SOCIAL_SEND_ENABLED=1
   SOCIAL_KILL_SWITCH_SAMURAI=0
   META_PAGE_ACCESS_TOKEN=<a real Page token for a Page/post you control>
   ```
4. Run step 7's curl against that row's `id`. Check the Page/post directly
   (or Graph API Explorer: `GET /{external_reply_id}`) to confirm the reply
   actually landed.
5. Immediately set `SOCIAL_SEND_ENABLED=0` (or `SOCIAL_KILL_SWITCH_SAMURAI=1`)
   again afterward — this repo does **not** enable sending by default, and
   this smoke test should not leave it on.
6. Check `GET /api/social/inbox/<id>` — the `audit` array should show a
   `send` action with `meta.external_reply_id` set (no token anywhere in it).

**8. Skip:**
```bash
curl -s -X POST "$BASE/api/social/inbox/<id>/skip" \
  -H "X-Social-Internal-Key: $SOCIAL_INTERNAL_API_KEY" | jq
```

## Dashboard

`/dashboard` → "Social inbox (trial)" panel shows `new` / `pending_approval` /
`drafted` rows for the scoped tenant, with **Draft reply / Approve / Skip**
buttons (Approve posts whatever text is currently in the editable textarea —
edit before approving to send something different from the template). Honest
empty state when there are zero rows (no invented demo data), and a separate
"no pending approvals" state when rows exist but are all already
handled/blocked/skipped.

## Next (not built yet)

- **Blok 4.2 — Google Business Profile (GBP)** reviews/Q&A — Stage 1 skeleton
  in `docs/BLOK4_GBP_TRIAL.md` (inbox + human approve; Google send stubbed).
- **Meta App Review** for any client Page beyond Samurai (see the Publish
  status note under "Setup steps for Malik" above) — required before this
  can be turned on for a Page Orderly doesn't itself administer.
- ~~Raw-body webhook signature verification (`X-Hub-Signature-256`).~~ **DONE** —
  `express.raw` on the Meta webhook path + `verifyMetaSignature` (requires
  `META_APP_SECRET` in production).
- Moving from single-tenant defaults (`SOCIAL_DEFAULT_TENANT_ID`) to a real
  Page-ID → tenant registry once a second social tenant is onboarded.
- Retry/backoff for transient Meta 5xx/network failures on `/send` (today a
  failed send just stays `approved` for a human to retry manually).
