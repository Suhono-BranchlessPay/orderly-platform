from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .bridge import import_menu_to_orderly
from .config import settings
from .schemas import ExtractResponse, MenuDraft, MenuDraftItem
from .store import create_draft, get_draft, list_drafts, update_draft
from .vision import extract_menu_from_image

app = FastAPI(
    title="Orderly AI",
    version="0.1.0",
    description="Separate AI service. Talks to Orderly only via API Bridge.",
)

STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _check_review_token(token: str | None) -> None:
    expected = (settings.orderly_ai_review_token or "").strip()
    if not expected:
        return
    if not token or token.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid review token")


@app.get("/healthz")
async def healthz() -> dict:
    return {
        "ok": True,
        "service": "orderly-ai",
        "vision_provider": settings.orderly_ai_vision_provider,
        "bridge_configured": bool(settings.orderly_bridge_api_key),
    }


@app.get("/review", response_class=HTMLResponse)
async def review_page() -> FileResponse:
    path = STATIC_DIR / "review.html"
    return FileResponse(
        path,
        media_type="text/html",
        headers={"X-Robots-Tag": "noindex, nofollow, noarchive"},
    )


@app.post("/v1/menu-from-photo", response_model=ExtractResponse)
async def menu_from_photo(
    tenant_id: str = Form(...),
    image: UploadFile = File(...),
    x_orderly_review_token: str | None = Header(default=None),
) -> ExtractResponse:
    _check_review_token(x_orderly_review_token)
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="image file required")
    raw = await image.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="image too large (max 12MB)")
    if len(raw) < 32:
        raise HTTPException(status_code=400, detail="empty image")

    try:
        items, notes, provider = await extract_menu_from_image(
            raw,
            mime=image.content_type,
            filename=image.filename,
        )
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Vision extract failed: {err}") from err

    if not items:
        raise HTTPException(status_code=422, detail="No menu items detected")

    draft = create_draft(
        tenant_id=tenant_id.strip(),
        items=items,
        vision_provider=provider,
        source_filename=image.filename,
        notes=notes,
    )
    return ExtractResponse(draft=draft)


@app.get("/v1/menu-drafts")
async def menu_drafts(
    tenant_id: str | None = None,
    x_orderly_review_token: str | None = Header(default=None),
) -> dict:
    _check_review_token(x_orderly_review_token)
    return {"drafts": [d.model_dump() for d in list_drafts(tenant_id)]}


@app.get("/v1/menu-drafts/{draft_id}", response_model=MenuDraft)
async def menu_draft_get(
    draft_id: str,
    x_orderly_review_token: str | None = Header(default=None),
) -> MenuDraft:
    _check_review_token(x_orderly_review_token)
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


class PatchDraftBody(BaseModel):
    items: list[MenuDraftItem] | None = None
    notes: str | None = None
    reviewed_by: str | None = None
    status: str | None = None


@app.patch("/v1/menu-drafts/{draft_id}", response_model=MenuDraft)
async def menu_draft_patch(
    draft_id: str,
    body: PatchDraftBody,
    x_orderly_review_token: str | None = Header(default=None),
) -> MenuDraft:
    _check_review_token(x_orderly_review_token)
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status == "imported":
        raise HTTPException(status_code=409, detail="Draft already imported")

    fields: dict = {}
    if body.items is not None:
        fields["items"] = body.items
    if body.notes is not None:
        fields["notes"] = body.notes
    if body.reviewed_by is not None:
        fields["reviewed_by"] = body.reviewed_by
    if body.status in {"draft", "approved", "rejected"}:
        fields["status"] = body.status

    updated = update_draft(draft_id, **fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Draft not found")
    return updated


class ApproveBody(BaseModel):
    reviewed_by: str = Field(min_length=1)
    publish_to_square: bool = False
    items: list[MenuDraftItem] | None = None


@app.post("/v1/menu-drafts/{draft_id}/approve")
async def menu_draft_approve(
    draft_id: str,
    body: ApproveBody,
    x_orderly_review_token: str | None = Header(default=None),
) -> dict:
    """Human approve gate — only then call Orderly Bridge import."""
    _check_review_token(x_orderly_review_token)
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status == "imported":
        raise HTTPException(status_code=409, detail="Draft already imported")

    items = body.items if body.items is not None else draft.items
    if not any(i.include for i in items):
        raise HTTPException(status_code=400, detail="Select at least one item")

    # Persist approved edits first (still not live until Bridge succeeds).
    update_draft(
        draft_id,
        items=items,
        reviewed_by=body.reviewed_by,
        status="approved",
    )

    try:
        result = await import_menu_to_orderly(
            tenant_id=draft.tenant_id,
            draft_id=draft.id,
            reviewed_by=body.reviewed_by,
            items=items,
            publish_to_square=body.publish_to_square,
        )
    except Exception as err:
        update_draft(draft_id, status="approved")
        raise HTTPException(status_code=502, detail=str(err)) from err

    update_draft(
        draft_id,
        status="imported",
        reviewed_by=body.reviewed_by,
        items=items,
        import_result=result,
    )
    return {
        "status": "imported",
        "draft_id": draft_id,
        "publish_to_square": body.publish_to_square,
        "bridge": result,
        "message": "Imported via Orderly Bridge after human approval.",
    }
