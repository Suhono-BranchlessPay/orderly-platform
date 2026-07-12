from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MenuDraftItem(BaseModel):
    name: str
    description: str | None = None
    category: str = "Uncategorized"
    price_cents: int = Field(ge=0)
    sku: str | None = None
    available: bool = True
    include: bool = True  # human can uncheck before approve


class MenuDraft(BaseModel):
    id: str
    tenant_id: str
    status: Literal["draft", "approved", "imported", "rejected"] = "draft"
    source_filename: str | None = None
    vision_provider: str
    notes: str | None = None
    items: list[MenuDraftItem] = Field(default_factory=list)
    created_at: str
    updated_at: str
    reviewed_by: str | None = None
    import_result: dict | None = None


class ExtractResponse(BaseModel):
    draft: MenuDraft
    warning: str = (
        "Draft only — human review required before import. Never auto-publish."
    )
