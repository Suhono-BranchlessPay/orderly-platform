## Summary

- Square Gift Cards foundation (Part 3): schema, migrate SQL, OAuth `GIFTCARDS_READ`/`WRITE`, Square API client, gated engine (`ORDERLY_GIFT_CARDS_ENABLED` default off).
- Public APIs: program, balance-by-GAN, quote/redeem, purchase (charge → DIGITAL → ACTIVATE). Dashboard program panel + master-only migrate append (no Owner auto-import).
- Docs + VPS deploy script. Lawyer/CPA HOLD before enabling; no CrustnRoll migrate.

## Test plan

- [ ] `psql … -f scripts/migrate-gift-cards.sql` on staging/VPS
- [ ] Ensure `ORDERLY_GIFT_CARDS_ENABLED=0` in ecosystem
- [ ] `GET /api/gift-cards/program` → `engineEnabled: false`
- [ ] Dashboard → Gift cards panel loads for Samurai; save draft program
- [ ] Do **not** flip engine on without legal sign-off
- [ ] Confirm Samurai checkout / Square payments unchanged
