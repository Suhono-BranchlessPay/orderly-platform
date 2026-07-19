# Samurai VPS deploy (sole path)

**One command. No parallel flows.**

```bash
# On VPS (root), after the change is merged to origin/main:
cd /var/www/samurai-resto
bash scripts/deploy-samurai-main.sh
```

Fixed order inside the script:

1. `git fetch` + `reset --hard origin/main`
2. Build `@workspace/api-server`
3. **Always** restore storefront images from `dist` → `attached_assets/` (fails if restore yields zero files)
4. `pm2 restart samurai-api`

Do **not**:

- Run ad-hoc `tmp-deploy-*.sh` for production
- `git pull` + build + PM2 without the script
- Call `deploy-samurai-assets.sh` by hand as “the deploy” (it is an internal helper only)

Host: `46.202.179.234` · app dir `/var/www/samurai-resto` · PM2 app `samurai-api`
