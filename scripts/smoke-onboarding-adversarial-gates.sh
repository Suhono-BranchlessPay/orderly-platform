#!/usr/bin/env bash
# Adversarial proof for onboarding wizard hard gates (live API, not unit tests).
# Intentionally submits bad payloads and expects 400/409 — fail the script if any gate soft-passes.
#
# Usage (on VPS, after wizard code is deployed):
#   bash scripts/smoke-onboarding-adversarial-gates.sh
#
# Gates covered:
#   1) empty phone            → 400
#   2) timezone unconfirmed   → 400
#   3) tax NULL / missing     → 400
#   4) SKU prefix KRN / SAM   → 400 or 409
#   5) ambiguousReviewed=false→ 400  (ack required; rename in Square is still human — known limitation)
set -euo pipefail
cd /var/www/samurai-resto

PORT=$(node -e 'const e=require("./ecosystem.config.cjs"); const a=e.apps.find(x=>x.name==="samurai-api"); process.stdout.write(String((a&&a.env&&a.env.PORT)||8080))')
ADMIN=$(node -e 'const e=require("./ecosystem.config.cjs"); const a=e.apps.find(x=>x.name==="samurai-api"); process.stdout.write((a&&a.env&&a.env.ONBOARDING_INVITE_ADMIN_KEY)||"")')
DBURL=$(node -e 'const e=require("./ecosystem.config.cjs"); const a=e.apps.find(x=>x.name==="samurai-api"); process.stdout.write((a&&a.env&&a.env.DATABASE_URL)||"")')
test -n "$ADMIN" && test -n "$DBURL"
BASE="http://127.0.0.1:${PORT}/api/onboarding"
echo "PORT=$PORT BASE=$BASE"

WEEKLY='[{"day":"Monday","hours":"Closed"},{"day":"Tuesday","hours":"11:00 AM – 9:00 PM"},{"day":"Wednesday","hours":"11:00 AM – 9:00 PM"},{"day":"Thursday","hours":"11:00 AM – 9:00 PM"},{"day":"Friday","hours":"11:00 AM – 10:00 PM"},{"day":"Saturday","hours":"11:00 AM – 10:00 PM"},{"day":"Sunday","hours":"11:00 AM – 9:00 PM"}]'

expect_http() {
  local label="$1" want="$2" got="$3" body_file="$4"
  if [ "$got" != "$want" ]; then
    echo "FAIL $label expected_http=$want got=$got"
    head -c 400 "$body_file" || true
    echo
    exit 1
  fi
  echo "PASS $label http=$got"
  head -c 180 "$body_file"; echo
}

INV=$(curl -sS -m 15 -X POST "${BASE}/invites" \
  -H "Content-Type: application/json" \
  -H "X-Onboarding-Invite-Key: ${ADMIN}" \
  -d '{"label":"adversarial-gates","expiresInHours":24}')
TOKEN=$(echo "$INV" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{process.stdout.write(JSON.parse(s).invite?.token||"")})')
test -n "$TOKEN"
SID=$(curl -sS -m 15 -X POST "${BASE}/start-with-invite" \
  -H "Content-Type: application/json" \
  -d "{\"inviteToken\":\"${TOKEN}\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{process.stdout.write(JSON.parse(s).session?.id||"")})')
test -n "$SID"
echo "SESSION=$SID"

# --- 1) Empty phone must hard-reject Step 1 complete ---
PHONE_HTTP=$(curl -sS -m 15 -o /tmp/adv-phone.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/1/complete" \
  -H "Content-Type: application/json" \
  -d '{"legalBusinessName":"Adv Gate LLC","publicDisplayName":"Adv Gate","businessType":"restaurant","cuisine":"Japanese","addressMode":"physical","physicalAddress":"1 Main St, Linton, IN","phone":"","businessEmail":"adv-gates@example.com","websiteDomain":"adv-gates-example.com"}')
expect_http "step1_empty_phone" "400" "$PHONE_HTTP" /tmp/adv-phone.json

# Valid Step 1 so later gates can be reached
curl -sS -m 15 -X POST "${BASE}/${SID}/steps/1/complete" -H "Content-Type: application/json" \
  -d '{"legalBusinessName":"Adv Gate LLC","publicDisplayName":"Adv Gate","businessType":"restaurant","cuisine":"Japanese","addressMode":"physical","physicalAddress":"1 Main St, Linton, IN","phone":"+18125550999","businessEmail":"adv-gates@example.com","websiteDomain":"adv-gates-example.com"}' >/dev/null
curl -sS -m 15 -X POST "${BASE}/${SID}/steps/2/complete" -H "Content-Type: application/json" \
  -d '{"presentation":"plate","cookingShow":true,"dishTerm":"plates","dineIn":true,"outdoorSeating":false}' >/dev/null

# --- 2) Timezone without explicit confirm must hard-reject ---
TZ_HTTP=$(curl -sS -m 15 -o /tmp/adv-tz.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/3/complete" \
  -H "Content-Type: application/json" \
  -d "{\"timezone\":\"America/Indiana/Indianapolis\",\"timezoneConfirmed\":false,\"weekly\":${WEEKLY}}")
expect_http "step3_timezone_unconfirmed" "400" "$TZ_HTTP" /tmp/adv-tz.json

curl -sS -m 15 -X POST "${BASE}/${SID}/steps/3/complete" -H "Content-Type: application/json" \
  -d "{\"timezone\":\"America/Indiana/Indianapolis\",\"timezoneConfirmed\":true,\"weekly\":${WEEKLY}}" >/dev/null

# Square connected enough for Step 4 tax gate (location faked — same pattern as prior smokes)
psql "$DBURL" -v ON_ERROR_STOP=1 -c \
  "UPDATE onboarding_sessions SET square_merchant_id='M_ADV', square_location_id='L_ADV', square_connected_at=NOW() WHERE id='${SID}';" >/dev/null

# --- 3) Tax NULL / missing must hard-reject ---
TAX_NULL_HTTP=$(curl -sS -m 15 -o /tmp/adv-tax-null.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/4/complete" \
  -H "Content-Type: application/json" \
  -d '{"locationId":"L_ADV","taxConfirmed":true}')
expect_http "step4_tax_missing" "400" "$TAX_NULL_HTTP" /tmp/adv-tax-null.json

TAX_FALSE_HTTP=$(curl -sS -m 15 -o /tmp/adv-tax-false.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/4/complete" \
  -H "Content-Type: application/json" \
  -d '{"locationId":"L_ADV","taxRatePercent":7,"taxConfirmed":false}')
expect_http "step4_tax_unconfirmed" "400" "$TAX_FALSE_HTTP" /tmp/adv-tax-false.json

curl -sS -m 15 -X POST "${BASE}/${SID}/steps/4/complete" -H "Content-Type: application/json" \
  -d '{"locationId":"L_ADV","taxRatePercent":7,"taxConfirmed":true}' >/dev/null

# --- 4) Reserved SKU prefixes KRN / SAM must hard-reject ---
KRN_HTTP=$(curl -sS -m 15 -o /tmp/adv-krn.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/5/complete" \
  -H "Content-Type: application/json" \
  -d '{"skuPrefix":"KRN","skuPrefixUniqueConfirmed":true,"ambiguousReviewed":true,"pricesCheckedInSquare":true,"modifiersInSquareConfirmed":true}')
# Schema reserved → 400; live conflict path → 409. Either is fail-closed.
if [ "$KRN_HTTP" != "400" ] && [ "$KRN_HTTP" != "409" ]; then
  echo "FAIL step5_sku_krn expected 400|409 got=$KRN_HTTP"
  head -c 400 /tmp/adv-krn.json; echo
  exit 1
fi
echo "PASS step5_sku_krn http=$KRN_HTTP"
head -c 180 /tmp/adv-krn.json; echo

SAM_HTTP=$(curl -sS -m 15 -o /tmp/adv-sam.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/5/complete" \
  -H "Content-Type: application/json" \
  -d '{"skuPrefix":"SAM","skuPrefixUniqueConfirmed":true,"ambiguousReviewed":true,"pricesCheckedInSquare":true,"modifiersInSquareConfirmed":true}')
if [ "$SAM_HTTP" != "400" ] && [ "$SAM_HTTP" != "409" ]; then
  echo "FAIL step5_sku_sam expected 400|409 got=$SAM_HTTP"
  head -c 400 /tmp/adv-sam.json; echo
  exit 1
fi
echo "PASS step5_sku_sam http=$SAM_HTTP"
head -c 180 /tmp/adv-sam.json; echo

# --- 5) Ambiguous ack required (known limitation: does NOT prove Square rename) ---
AMB_HTTP=$(curl -sS -m 15 -o /tmp/adv-amb.json -w "%{http_code}" \
  -X POST "${BASE}/${SID}/steps/5/complete" \
  -H "Content-Type: application/json" \
  -d '{"skuPrefix":"LTN","skuPrefixUniqueConfirmed":true,"ambiguousReviewed":false,"pricesCheckedInSquare":true,"modifiersInSquareConfirmed":true}')
expect_http "step5_ambiguous_ack_required" "400" "$AMB_HTTP" /tmp/adv-amb.json

echo
echo "KNOWN_LIMITATION ambiguous_names: ack is hard-required; automatic proof that Square names were renamed is NOT enforced (human decision)."
echo "ADVERSARIAL_GATES_OK"
