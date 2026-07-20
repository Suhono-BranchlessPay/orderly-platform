# Daily report correction policy

When a report already emailed to a restaurant contains wrong numbers (test orders counted as revenue, attribution leaks, etc.), Orderly **re-sends with an explicit correction note**. We do **not** silently replace the prior email.

## Why

Silent replacement destroys trust faster than admitting a mistake. Clients need to know which figures superseded which, and that we caught the error.

## What we send

1. **Subject** includes `Correction` (or locale equivalent) and the original report date.
2. **Opening line** states that this replaces the earlier report for that date, and names the material change (e.g. “ops test orders removed from online attribution”).
3. **Body** is the full rebuilt report (same template), not a diff-only patch.
4. **Internal log** records: tenant, report date, prior send id (if known), correction reason, who triggered (ops / system).

## What we do not do

- Edit or recall the original email in the client’s inbox without a replacement.
- Change historical Square totals in the narrative without saying so.
- Send a correction for cosmetic copy-only tweaks.

## Samurai / internal

Same rule applies even when the recipient is us. Practice the client path before multi-tenant scale.

## Trigger

After fixing data (e.g. `is_test` flags) or report logic, ops runs the daily-report send for that date with `correction=1` / correction reason once that flag exists on the send path. Until wired, document the reason in the Resend subject/body manually.
