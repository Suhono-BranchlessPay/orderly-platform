# Mobile store — Privacy Nutrition Label (Apple) & Data safety (Google)

**Pilot:** Samurai Martinsville · `com.orderly.samurai.martinsville`  
**Login:** none (guest checkout) → no Account Deletion / Sign in with Apple requirement.  
**Public URLs:** `https://samurairesto.com/privacy` · `/terms` · `/data-deletion`

Fill App Store Connect / Play Console from this sheet. Do **not** invent tracking or account features.

---

## Data the app collects / processes

| Data | Collected? | Purpose | Linked to identity? | Tracking? |
|------|------------|---------|---------------------|-----------|
| Name | Yes (checkout) | Fulfill pickup order | Yes (order) | No |
| Phone | Yes (checkout) | Order contact / SMS readiness | Yes | No |
| Email | Optional (checkout) | Receipt / contact | Yes if provided | No |
| Payment info | Via **Square In-App Payments SDK** only — card data does **not** hit Orderly servers as PAN | Process payment | Payment processor | No (Orderly) |
| Precise location | **No** | — | — | — |
| Coarse location | **No** (maps open externally) | — | — | — |
| Photos / camera | **No** | — | — | — |
| Contacts | **No** | — | — | — |
| Push token (Expo) | Optional, if user grants notifications | Pickup-ready alerts for an order | Tied to device + order id | No |
| Device identifiers | Expo / OS as needed for push | Notifications | Device | No |
| Purchase history | On device (recent orders) + server orders | Show Orders tab / status | Yes | No |
| Diagnostics | Optional OS crash (if enabled later) | Stability | No | No |

**Not used:** advertising ID for ads, third-party ad SDKs, crypto/blockchain UI, social login.

---

## Apple App Privacy (Nutrition Label) — suggested answers

- **Privacy Policy URL:** `https://samurairesto.com/privacy`
- **Data used to track you:** None
- **Data linked to you:**
  - Contact Info — Name, Phone Number, Email Address (optional)
  - Purchases — Purchase History
  - Identifiers — Device ID (for push, if enabled)
- **Data not linked to you:** (leave empty unless you enable anonymous analytics later)
- **Product Page / Review notes:** Pickup ordering; card via Square; no account required.

---

## Google Play Data safety — suggested answers

- **Privacy policy:** `https://samurairesto.com/privacy`
- **Data collected:** Personal info (name, phone, email optional); Financial info handled by Square (declare “Payment info” if Play requires processor disclosure — follow Square’s guidance); App activity / purchase history; Device or other IDs (push).
- **Data shared:** Shared with payment processor (Square) to complete the charge; shared with restaurant backend to fulfill the order. **Not** sold; **not** used for advertising.
- **Security practices:** Data encrypted in transit (HTTPS/TLS).
- **Account deletion:** N/A — app does not create user accounts. Point to `https://samurairesto.com/data-deletion` for order/PII requests.
- **Children:** Not primarily directed at children (declare per counsel).

---

## In-app (repo)

Profile tab → Privacy Policy / Terms / Data deletion (opens tenant domain pages).

## Console remaining (human)

- [ ] Paste answers into App Store Connect → App Privacy
- [ ] Paste answers into Play Console → Data safety
- [ ] Confirm support URL + marketing URL on both listings
