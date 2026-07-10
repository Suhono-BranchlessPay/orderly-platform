# Samurai Resto

Website pemesanan online untuk Samurai Hibachi & Sushi — restoran Jepang di Martinsville, Indiana. Pelanggan bisa melihat menu lengkap dan melakukan order online (pickup/delivery).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/samurai-resto run dev` — run the frontend (port 26204)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/menu.ts` — DB schema: menu_categories, menu_items, orders, order_lines
- `artifacts/api-server/src/routes/` — API route handlers (menu.ts, orders.ts)
- `artifacts/samurai-resto/src/pages/` — Frontend pages (home.tsx, menu.tsx, order.tsx)
- `artifacts/samurai-resto/src/components/` — Shared components (MenuItemCard, layout)
- `artifacts/samurai-resto/src/lib/cart.tsx` — Cart state context (localStorage backed)
- `attached_assets/` — Food photos from the restaurant

## Architecture decisions

- OpenAPI-first: spec in `lib/api-spec/openapi.yaml` gates codegen which gates the frontend
- **Multi-tenant white-label:** one codebase; tenant from `Host` → `req.tenant`. SEO/meta injected server-side into SPA `index.html` when `STOREFRONT_DIST` is set (see `deploy/nginx-multi-tenant.conf.md`). Theme/identity live in `tenants.theme` JSONB — never hardcode Samurai into Kirin's HTML.
- Cart is client-side (React Context + localStorage per tenant key `orderly-cart-{tenantId}`)
- Square POS integration is planned for future — orders currently stored in DB only
- Tax rate hardcoded at 7% in the orders route — adjust as needed
- Menu photos: priority is `item.imageUrl` (DB, owner-uploaded) → `IMAGE_MAP[item.name]` (hardcoded `@assets` import) → styled placeholder
- Owner-protected endpoints (PIN-based, under `/owner/*`) are intentionally NOT in the OpenAPI spec/codegen pipeline — they're plain Express routes, matching the existing pattern for orders/customers owner routes
- Owner PIN storage: DB-backed (`app_settings` table, key `owner_pin`) via `artifacts/api-server/src/lib/ownerAuth.ts` (`checkPin`/`setOwnerPin`, in-memory cached). Seeded once from `process.env.OWNER_PIN || "samurai2024"` on first read only — changing the env var afterwards has no effect. Owner Dashboard → "Ganti PIN Owner" card calls `PATCH /api/owner/settings/pin` (`{currentPin, newPin}`) to change it without touching server files/VPS SSH.
- `GET /api/version` returns `{ buildTime, startedAt }` — `buildTime` is injected at esbuild-time via `define: { __BUILD_TIME__ }` in `build.mjs` (declared in `src/global.d.ts`). Lets the owner check from a browser (no SSH) whether a VPS deployment is running freshly-built code after an upload.
- Menu photo uploads: Owner Dashboard → "Kelola Menu" section → multipart upload to `POST /api/owner/menu/items/:id/image?pin=...`, stored on local disk at `artifacts/api-server/uploads/menu/` (outside `dist/`, survives rebuilds), served statically at `/api/uploads/menu/...`. Plain local disk storage was chosen over Replit Object Storage since the app is self-hosted on the owner's own VPS.
- Menu item editing: Owner Dashboard → "Kelola Menu" section → per-item "Edit" button expands an inline form (name, description, price, category, available, featured) that saves via `PATCH /api/owner/menu/items/:id` (PIN in JSON body). Plain Express route, not in the OpenAPI spec, matching the `/owner/*` convention.

## Product

- Landing page with hero, featured dishes, about section, footer with contact info
- Full menu page with category filtering (10 categories, 79 items)
- Online order page: add items to cart, choose pickup/delivery, submit order
- Order confirmation screen with order ID
- DoorDash ordering link visible in header/footer

## Restaurant Info

- Name: Samurai Hibachi & Sushi
- Address: 789 E Morgan St, Martinsville, IN 46151
- Phone: +1 765-315-0073
- Email: samurairesromartins@gmail.com
- Facebook: https://www.facebook.com/samuraimartinsville
- Website: samurairesto.com

## Gotchas

- `zod/v4` can't be resolved by esbuild — use `import { z } from "zod"` in api-server routes
- After each OpenAPI spec change, re-run codegen before using the updated types
- Run `pnpm run typecheck:libs` after changing lib packages

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Square integration connector: `connector:ccfg_squareup_01KQJJZ4WZS6MZPFYE36MH0MB9`
