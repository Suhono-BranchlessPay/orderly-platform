# Deploy safety — avoid silent file overwrite

Hot-SCPing individual source files onto a live VPS is fast and also how
`routes/social.ts` was once overwritten by the wrong sibling file. The mistake
was caught in the same session; at 27 outlets that may not happen.

## Rules

1. **Prefer the named deploy script** (`scripts/deploy-samurai-main.sh` or the
   current sole path documented for the VPS). It pulls a git SHA, rebuilds
   `dist`, and recreates PM2 — atomic enough for one host.
2. **Never `cp` one package file over another path** during hotfix. If you must
   patch a single file, copy to the exact destination and immediately
   `head`/`grep` a unique string from that module before `pnpm build`.
3. **Rebuild is mandatory** after any `src/` change. Source-only edits leave
   old money/social logic live in `dist/index.mjs`.
4. **Smoke after restart**: hit one health + one tenant-scoped route; confirm
   `pm2 pid` changed and dist contains the new symbol (`grep` the function
   name in `dist/index.mjs`).
5. **Report mistakes**. A recovered overwrite is cheap; a hidden one is not.

## Optional preflight (recommended)

Before `pm2 restart`:

```bash
test -f artifacts/api-server/src/routes/social.ts
grep -q 'webhooks/meta' artifacts/api-server/src/routes/social.ts
grep -q 'buildSocialHealth' artifacts/api-server/src/lib/social.ts
pnpm --filter @workspace/api-server run build
grep -q 'backfillMetaTaggedPosts' artifacts/api-server/dist/index.mjs
```
