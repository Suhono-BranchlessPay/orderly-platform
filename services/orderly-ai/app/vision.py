from __future__ import annotations

import base64
import json
import re
from typing import Any

import httpx

from .config import settings
from .schemas import MenuDraftItem


EXTRACT_PROMPT = """You are extracting a restaurant menu from a photo.
Return ONLY valid JSON with this shape:
{
  "items": [
    {
      "name": "string",
      "description": "string or null",
      "category": "string",
      "price_cents": 1299,
      "sku": null
    }
  ],
  "notes": "optional string about OCR uncertainty"
}
Rules:
- price_cents is integer US cents (12.99 -> 1299). If price unclear, use 0 and mention in notes.
- Write short appetizing descriptions when the photo has little/no description text.
- Do not invent entire menu sections that are not visible.
- Keep category names short (e.g. Rolls, Entrees, Drinks).
"""


def _parse_items_payload(raw: str) -> tuple[list[MenuDraftItem], str | None]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    data = json.loads(text)
    items_raw = data.get("items") or []
    items: list[MenuDraftItem] = []
    for row in items_raw:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        price = row.get("price_cents", 0)
        try:
            price_cents = max(0, int(price))
        except (TypeError, ValueError):
            price_cents = 0
        items.append(
            MenuDraftItem(
                name=name,
                description=(str(row["description"]).strip() if row.get("description") else None),
                category=str(row.get("category") or "Uncategorized").strip()
                or "Uncategorized",
                price_cents=price_cents,
                sku=(str(row["sku"]).strip() if row.get("sku") else None),
                available=True,
                include=True,
            )
        )
    notes = data.get("notes")
    return items, (str(notes) if notes else None)


def mock_extract(_image_bytes: bytes, filename: str | None) -> tuple[list[MenuDraftItem], str | None]:
    label = (filename or "menu").rsplit(".", 1)[0]
    items = [
        MenuDraftItem(
            name="Dragon Roll",
            description="Shrimp tempura, avocado, eel sauce — rich and satisfying.",
            category="Rolls",
            price_cents=1499,
        ),
        MenuDraftItem(
            name="Chicken Teriyaki",
            description="Grilled chicken glazed in house teriyaki, steamed rice.",
            category="Entrees",
            price_cents=1599,
        ),
        MenuDraftItem(
            name="Miso Soup",
            description="Classic miso with tofu and scallion.",
            category="Starters",
            price_cents=299,
        ),
    ]
    notes = (
        f"MOCK vision provider used for '{label}'. "
        "Set ORDERLY_AI_VISION_PROVIDER=openai|anthropic for real extraction."
    )
    return items, notes


async def openai_extract(image_bytes: bytes, mime: str) -> tuple[list[MenuDraftItem], str | None]:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY required for openai vision provider")
    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": settings.openai_vision_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": EXTRACT_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{b64}",
                        },
                    },
                ],
            }
        ],
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
    content = data["choices"][0]["message"]["content"]
    return _parse_items_payload(content)


async def anthropic_extract(image_bytes: bytes, mime: str) -> tuple[list[MenuDraftItem], str | None]:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY required for anthropic vision provider")
    media = "image/jpeg" if mime == "image/jpg" else mime
    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload: dict[str, Any] = {
        "model": settings.anthropic_vision_model,
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": EXTRACT_PROMPT},
                ],
            }
        ],
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
    parts = data.get("content") or []
    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
    return _parse_items_payload(text)


async def extract_menu_from_image(
    image_bytes: bytes,
    *,
    mime: str,
    filename: str | None,
) -> tuple[list[MenuDraftItem], str | None, str]:
    provider = (settings.orderly_ai_vision_provider or "mock").strip().lower()
    if provider == "mock":
        items, notes = mock_extract(image_bytes, filename)
        return items, notes, "mock"
    if provider == "openai":
        items, notes = await openai_extract(image_bytes, mime)
        return items, notes, "openai"
    if provider == "anthropic":
        items, notes = await anthropic_extract(image_bytes, mime)
        return items, notes, "anthropic"
    raise RuntimeError(f"Unknown ORDERLY_AI_VISION_PROVIDER: {provider}")
