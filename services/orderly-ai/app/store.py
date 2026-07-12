from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .config import settings
from .schemas import MenuDraft, MenuDraftItem


_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _drafts_dir() -> Path:
    path = Path(settings.data_dir) / "drafts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path(draft_id: str) -> Path:
    return _drafts_dir() / f"{draft_id}.json"


def save_draft(draft: MenuDraft) -> MenuDraft:
    draft.updated_at = _now()
    with _lock:
        _path(draft.id).write_text(
            draft.model_dump_json(indent=2), encoding="utf-8"
        )
    return draft


def create_draft(
    *,
    tenant_id: str,
    items: list[MenuDraftItem],
    vision_provider: str,
    source_filename: str | None,
    notes: str | None = None,
) -> MenuDraft:
    now = _now()
    draft = MenuDraft(
        id=str(uuid4()),
        tenant_id=tenant_id,
        status="draft",
        source_filename=source_filename,
        vision_provider=vision_provider,
        notes=notes,
        items=items,
        created_at=now,
        updated_at=now,
    )
    return save_draft(draft)


def get_draft(draft_id: str) -> MenuDraft | None:
    path = _path(draft_id)
    if not path.exists():
        return None
    return MenuDraft.model_validate_json(path.read_text(encoding="utf-8"))


def list_drafts(tenant_id: str | None = None) -> list[MenuDraft]:
    rows: list[MenuDraft] = []
    for path in sorted(_drafts_dir().glob("*.json"), reverse=True):
        try:
            draft = MenuDraft.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if tenant_id and draft.tenant_id != tenant_id:
            continue
        rows.append(draft)
    return rows


def update_draft(draft_id: str, **fields) -> MenuDraft | None:
    draft = get_draft(draft_id)
    if not draft:
        return None
    data = draft.model_dump()
    data.update({k: v for k, v in fields.items() if v is not None})
    updated = MenuDraft.model_validate(data)
    return save_draft(updated)
