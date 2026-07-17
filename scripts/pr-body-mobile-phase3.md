## Summary
- **Modifiers:** Item bottom sheet checklist from Square `squareModifiers` (hidden when empty); live unit/total price; cart lines keyed by `lineId` so same item + different mods stay separate; mods folded into `specialInstructions` + `unitPrice` for the order API
- **Explore content:** Samurai Martinsville `config.json` now has real deals / partner promo / events / sponsors (no invented ratings)
- **Motion polish:** Sheet spring + backdrop fade (respects reduce-motion); tab icons scale on focus; product cards already had press spring

## Test plan
- [ ] Open an item with no modifiers → no Options section; Add to Cart works
- [ ] (When Square syncs mods) select options → CTA price updates; cart shows note + correct line price
- [ ] Two lines same item / different mods stay separate; qty/remove use `lineId`
- [ ] Explore tab shows deals, events, partners (not empty-state)
- [ ] Sheet open/close animation; Reduce Motion → no spring
- [ ] Tab switch: focused icon slightly scales
