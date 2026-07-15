# Blok 6 — iOS store prep (Samurai pilot)

**Status:** Apple Developer membership **ACTIVE** (confirmation email received 15 Jul 2026).  
**Team ID:** `K4SAA2F25A`  
**Bundle ID:** `com.orderly.samurai.martinsville`  
**App name:** Samurai Martinsville  
**SKU:** `samurai-martinsville-ios`

## Already ready in repo

| Asset | Status |
|-------|--------|
| Icon 1024×1024 | ✅ `tenants/samurai-martinsville/assets/brand/icon.png` |
| Splash / brand | ✅ tenant assets |
| EAS profiles `preview` / `production` | ✅ `eas.json` |
| Push + Square native plugins | ✅ `app.config.ts` |
| Production API = `samurairesto.com` | ✅ tenant `config.json` |
| Public Privacy / Terms / Data deletion | ✅ `/privacy` `/terms` `/data-deletion` (after deploy) |

## Go-live steps (membership now Active)

1. developer.apple.com → Certificates, Identifiers & Profiles loads with Team `K4SAA2F25A` (no Team ID error).
2. App Store Connect → **My Apps** → New App:
   - Platforms: iOS
   - Name: Samurai Martinsville
   - Bundle ID: `com.orderly.samurai.martinsville` (create the App ID identifier first if it does not exist)
   - SKU: `samurai-martinsville-ios`
   - User Access: Full Access
   - After creation, copy the **Apple ID (ascAppId)** number from App Information — needed for `eas submit`.
3. Link EAS to Apple team + Expo project:
   ```bash
   cd artifacts/orderly-mobile
   eas login
   eas init            # writes EAS_PROJECT_ID into the project (extra.eas.projectId)
   eas credentials     # let EAS manage the iOS distribution cert + provisioning profile
   ```
4. Build a **TestFlight-eligible** binary — must be the `production` profile
   (App Store distribution). The `preview` profile is `distribution: internal`
   (ad-hoc, device-registered) and does NOT reach TestFlight:
   ```bash
   eas build --platform ios --profile production
   ```
5. Submit to TestFlight (uses `eas.json > submit.production.ios`; Team ID already set):
   ```bash
   eas submit --platform ios --profile production --latest
   ```
   EAS will prompt for `ascAppId` / Apple ID if not auto-detected from the bundle id.
6. In App Store Connect → TestFlight, add internal testers → run the smoke test
   (place an order + confirm pickup-ready push) before any external testers.
7. Store listing fields (for later App Store review, not needed for TestFlight):
   - Privacy Policy URL: `https://samurairesto.com/privacy`
   - Support URL: restaurant phone/site or `https://samurairesto.com`
   - Category: Food & Drink
   - Screenshots: capture from TestFlight/simulator (6.7" + 6.1" recommended)

## Meta Publish (parallel, same legal URLs)

In Meta Developer app settings:

- Privacy Policy URL → `https://samurairesto.com/privacy`
- User data deletion → `https://samurairesto.com/data-deletion`
- Then switch Development → **Live** so Page comment webhooks deliver.

## Explicit wait

Do **not** run `eas submit` until ASC app record exists and TestFlight smoke (order + push) passes.
