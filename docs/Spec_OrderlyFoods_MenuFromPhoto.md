# Spec — Menu-from-photo (C1)

**Status:** Implemented scaffold in `services/orderly-ai` + Bridge import.  
**Architecture:** AI = separate FastAPI service. Orderly DB / Square secrets stay in Orderly.

## Flow

```
Photo → AI extract → draft (local JSON)
      → human review/edit (/review)
      → Approve
      → POST Orderly /api/bridge/v1/menu/import
      → Orderly menu_items (+ optional Square Catalog)
```

**Hard rule:** extraction never auto-publishes. Approve requires `reviewed_by`.

## AI endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/menu-from-photo` | multipart `tenant_id` + `image` → draft |
| GET | `/v1/menu-drafts` | list |
| GET/PATCH | `/v1/menu-drafts/{id}` | read / edit |
| POST | `/v1/menu-drafts/{id}/approve` | human gate → Bridge import |
| GET | `/review` | noindex review UI |

## Bridge

`POST /api/bridge/v1/menu/import` — see `docs/Spec_OrderlyFoods_API_Bridge.md`.

## Vision

- `mock` default (no key) for local wiring tests
- `openai` / `anthropic` for real menu photos
