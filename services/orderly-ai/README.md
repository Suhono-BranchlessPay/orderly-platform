# Orderly AI Service (Phase C)

**Rule:** This service never touches Orderly Postgres or Square secrets.  
It talks to Orderly **only** via the API Bridge (`ORDERLY_BRIDGE_*`).

## C1 — Menu-from-photo

1. Upload a menu photo → vision extract → **draft** (not live).
2. Human reviews / edits in `/review`.
3. Approve → Bridge `POST /api/bridge/v1/menu/import` writes Orderly menu.
4. Optional `publish_to_square=true` after human confirm (still via Orderly backend).

## Run locally

```bash
cd services/orderly-ai
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8090
```

Open http://127.0.0.1:8090/review

### Vision providers

| `ORDERLY_AI_VISION_PROVIDER` | Notes |
|------------------------------|--------|
| `mock` (default) | Deterministic sample extract — no API key |
| `openai` | Needs `OPENAI_API_KEY` (GPT-4o vision) |
| `anthropic` | Needs `ANTHROPIC_API_KEY` (Claude vision) |

### Bridge

```
ORDERLY_BRIDGE_BASE_URL=http://127.0.0.1:8080
ORDERLY_BRIDGE_API_KEY=dev-bridge-key-change-me
```
