# Blok 6 — iOS store prep (Samurai pilot)

**Status:** ✅ **First TestFlight build uploaded 16 Jul 2026** (build `51550f08`, v1.0.0 build 1).
Now processing on Apple's side → add internal testers once "Ready to Test".

**Apple Developer membership** ACTIVE (confirmation 15 Jul 2026).
**Team ID:** `XNFX86V44H`  ⚠️ *(the previously documented `K4SAA2F25A` was WRONG — the
account is only associated with `XNFX86V44H`; using the wrong ID caused an Apple
Developer Portal auth failure during push setup.)*
**Bundle ID:** `com.orderly.samurai.martinsville`
**App name:** Samurai Martinsville
**SKU:** `samurai-martinsville-ios`
**Apple App ID (ascAppId):** `6791791471`
**TestFlight:** https://appstoreconnect.apple.com/apps/6791791471/testflight/ios

## App Store Connect API key (for non-interactive CI builds/submits)

Team key created under **Users and Access → Integrations → App Store Connect API**:

- **Key ID:** `Z4D5VMS4ZB`
- **Issuer ID:** `19d9d090-391c-4de8-aaa6-0d6c209d5d5c`
- **Role:** Admin
- **Private key:** `AuthKey_Z4D5VMS4ZB.p8` — store securely OUTSIDE the repo (it is git-ignored;
  local copy at `C:\Users\Thinkbook\Downloads\apple dev\`). Never commit `.p8`.

Set these env vars before `eas build`/`eas submit` for non-interactive Apple auth
(cert + provisioning profile ops; **note:** APNs push-key creation still requires a
one-time interactive Apple ID login — see gotcha #3):

```powershell
$env:EXPO_ASC_API_KEY_PATH="<path>\AuthKey_Z4D5VMS4ZB.p8"
$env:EXPO_ASC_KEY_ID="Z4D5VMS4ZB"
$env:EXPO_ASC_ISSUER_ID="19d9d090-391c-4de8-aaa6-0d6c209d5d5c"
$env:EXPO_APPLE_TEAM_ID="XNFX86V44H"
```

## Already ready in repo

| Asset | Status |
|-------|--------|
| Icon 1024×1024 | ✅ `tenants/samurai-martinsville/assets/brand/icon.png` |
| Splash / brand | ✅ tenant assets |
| EAS profiles `preview` / `production` | ✅ `eas.json` |
| Push + Square native plugins | ✅ `app.config.ts` |
| Production API = `samurairesto.com` | ✅ tenant `config.json` |
| `ITSAppUsesNonExemptEncryption: false` (skips export-compliance prompt) | ✅ `app.config.ts` |
| `submit.production.ios` with `appleTeamId` + `ascAppId` | ✅ `eas.json` |
| Public Privacy / Terms / Data deletion | ✅ `/privacy` `/terms` `/data-deletion` |

## Repeatable build + submit (now that credentials + ASC app exist)

```powershell
cd artifacts/orderly-mobile
# (set the EXPO_ASC_* + EXPO_APPLE_TEAM_ID env vars above)
npx eas-cli build --platform ios --profile production --non-interactive --auto-submit
```

`ascAppId` and `appleTeamId` are pinned in `eas.json`, so submit no longer prompts.

## Gotchas hit on the first build (READ before re-building — avoid repeating the pain)

1. **pnpm v11 `allowBuilds` (Install dependencies phase failed).**
   EAS workers run pnpm 11.9.0, which **removed** `onlyBuiltDependencies` in favor of
   `allowBuilds` (and `strictDepBuilds` now defaults to `true` → a missing entry is a
   HARD error `ERR_PNPM_IGNORED_BUILDS`). Root `pnpm-workspace.yaml` now has BOTH keys
   (`@swc/core`, `esbuild`, `msw`, `unrs-resolver`) so every pnpm version works.

2. **Correct Apple Team ID is `XNFX86V44H`, not `K4SAA2F25A`.**
   The wrong ID caused `Your account is not associated with Apple Team ID: K4SAA2F25A`
   and a cert(K4SAA2F25A)/profile(XNFX86V44H) team mismatch. Fixed in `eas.json`.

3. **Push Notifications capability + provisioning profile.**
   - EAS's push wizard creates the APNs key only via **interactive Apple ID login**
     (the ASC API key is NOT accepted for APNs key creation — "Only user authentication
     is supported"). One-time login with the real Apple ID (`suhono.nyc@icloud.com`) +
     2FA is required.
   - EAS's push setup did **not** enable the `PUSH_NOTIFICATIONS` capability on the App
     ID, so the generated profile lacked `aps-environment` and Xcode signing failed.
     Fixed by enabling the capability via the App Store Connect API and deleting the
     stale profile so EAS regenerated one WITH push. If this recurs:
     `POST /v1/bundleIdCapabilities` (capabilityType `PUSH_NOTIFICATIONS`) then delete
     the old `IOS_APP_STORE` profile, then rebuild interactively.

4. **EAS fingerprint reuse hid new builds.**
   Re-running `eas build` with an unchanged fingerprint made EAS reuse the previous
   (failed) build instead of creating a new one. Force a fresh build with
   `EAS_SKIP_AUTO_FINGERPRINT=1` (or change a fingerprint-affecting file).

5. **App creation is NOT possible via the ASC API** ("resource 'apps' does not allow
   'CREATE'"). The App Store Connect app record must be created by the first
   **interactive** `eas submit` (it also enables TestFlight access) or via the web
   "Add App" button. After that, `ascAppId` is pinned in `eas.json` for automation.

## Next steps (in App Store Connect)

1. Wait for Apple "processing complete" email, then open the TestFlight link above.
2. Export compliance auto-answered (`ITSAppUsesNonExemptEncryption: false`) → no prompt.
3. Add yourself as **Internal Tester** (Users and Access → TestFlight) → smoke test:
   place an order + confirm pickup-ready push on a real device.
4. External testers / public link → requires **Beta App Review** (usually quick).
5. Store listing (for full App Store review later, not needed for TestFlight):
   - Privacy Policy URL: `https://samurairesto.com/privacy`
   - Support URL: `https://samurairesto.com`
   - Category: Food & Drink
   - Screenshots: 6.7" + 6.1"

## Meta Publish (parallel, same legal URLs)

- Privacy Policy URL → `https://samurairesto.com/privacy`
- User data deletion → `https://samurairesto.com/data-deletion`
- Switch Development → **Live** so Page comment webhooks deliver.
