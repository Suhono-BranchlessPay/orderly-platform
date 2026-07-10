"""DEPRECATED — do not generate a Samurai-clone menu for Kirin.

Kirin (and every tenant) must use its own Square catalog / menu data.
After TENANT_KIRIN_SQUARE_* credentials are connected, import that
restaurant's real items — never copy menu-data-export.sql from Samurai.

This script now only writes a clear-only SQL file.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
dest = ROOT / "scripts" / "seed-kirin-menu.sql"
dest.write_text(
    """-- Kirin menu: DO NOT clone from Samurai.
-- Each restaurant has its own catalog. Leave Kirin empty until Square POS
-- for Kirin is connected, then import/sync that tenant's real menu + SKUs.
--
-- This script only clears any accidental Samurai-clone seed.

DELETE FROM menu_items WHERE tenant_id = 'kirin';
DELETE FROM menu_categories WHERE tenant_id = 'kirin';

SELECT 'kirin categories' AS kind, count(*)::text AS n
FROM menu_categories WHERE tenant_id = 'kirin'
UNION ALL
SELECT 'kirin items', count(*)::text FROM menu_items WHERE tenant_id = 'kirin';
""",
    encoding="utf-8",
)
print(f"Wrote clear-only {dest} (no Samurai clone)")
