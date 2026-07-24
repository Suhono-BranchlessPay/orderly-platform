#!/usr/bin/env bash
# Create a one-time onboarding invite (staff).
# Requires ONBOARDING_INVITE_ADMIN_KEY on the API + this shell.
set -euo pipefail
BASE="${ONBOARDING_API_BASE:-https://orderlyfoods.com}"
KEY="${ONBOARDING_INVITE_ADMIN_KEY:?Set ONBOARDING_INVITE_ADMIN_KEY}"
LABEL="${1:-Samurai Linton trial}"
SLUG="${2:-samurai-linton}"

curl -sS -X POST "${BASE}/api/onboarding/invites" \
  -H "Content-Type: application/json" \
  -H "X-Onboarding-Invite-Key: ${KEY}" \
  -d "$(jq -n --arg l "$LABEL" --arg s "$SLUG" '{label:$l,targetSlug:$s,createdBy:"ops-script",expiresInDays:14}')" \
  | jq .
