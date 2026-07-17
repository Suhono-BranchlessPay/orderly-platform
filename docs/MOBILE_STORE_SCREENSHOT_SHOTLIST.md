# Mobile store screenshot shot-list (Samurai pilot)

Capture on device / Simulator after a production or preview build with real menu photos.  
**Do not** submit gray skeleton-only frames or any crypto/explorer UI.

## Required frames

| # | Screen | Show | Avoid |
|---|--------|------|-------|
| 1 | **Home** — Visual Food Feed | Hero food photo, category bubbles, 2-col cards with real dishes | Empty gray boxes, loading skeleton as hero |
| 2 | **Item sheet** | Photo + Add to Cart (modifiers OK if fixture/dev) | Cut-off sheet, system alerts |
| 3 | **Explore** | Deals / events from tenant config | Empty-state “No promos” (config is filled) |
| 4 | **Cart / Checkout** | Line items + Pickup CTA | Test card numbers readable in crop |
| 5 | **Confirmation** | “Ready / confirmed” + human ETA | Any “record / blockchain / explorer” |
| 6 | **Receipt** | Readable struk (#order, items, total) | Hash / explorer links |
| 7 | **Profile** (optional) | Hours + Legal links visible | — |

## Sizes

| Store | Devices |
|-------|---------|
| Apple | 6.7" (iPhone 15 Pro Max class) **and** 6.1" (iPhone 15 / 14 class) |
| Google | Phone screenshot set (same frames; 16:9 or device native) |

## Copy rules on marketing text (listing)

- Pickup-first, restaurant brand first.
- No star ratings you did not earn; no crypto/blockchain wording.
- Privacy URL: `https://samurairesto.com/privacy`

## Capture tips

1. `EXPO_PUBLIC_TENANT_SLUG=samurai-martinsville` production API.
2. Warm the menu so images are loaded before shooting Home.
3. Prefer dark Samurai theme as shipping UI (D6 locked).
4. Store PNGs outside git until marketing approves (large binaries); this doc is the checklist only.
