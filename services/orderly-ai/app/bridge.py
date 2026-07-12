from __future__ import annotations

import httpx

from .config import settings
from .schemas import MenuDraftItem


async def import_menu_to_orderly(
    *,
    tenant_id: str,
    draft_id: str,
    reviewed_by: str | None,
    items: list[MenuDraftItem],
    publish_to_square: bool,
) -> dict:
    if not settings.orderly_bridge_api_key:
        raise RuntimeError("ORDERLY_BRIDGE_API_KEY is not set")

    payload = {
        "tenant_id": tenant_id,
        "draft_id": draft_id,
        "reviewed_by": reviewed_by,
        "publish_to_square": publish_to_square,
        "items": [
            {
                "name": i.name,
                "description": i.description,
                "category": i.category,
                "price_cents": i.price_cents,
                "sku": i.sku,
                "available": i.available,
            }
            for i in items
            if i.include
        ],
    }
    if not payload["items"]:
        raise RuntimeError("No included items to import")

    base = settings.orderly_bridge_base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{base}/api/bridge/v1/menu/import",
            headers={
                "Authorization": f"Bearer {settings.orderly_bridge_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if res.status_code >= 400:
            raise RuntimeError(
                f"Bridge import failed ({res.status_code}): {res.text[:500]}"
            )
        return res.json()
