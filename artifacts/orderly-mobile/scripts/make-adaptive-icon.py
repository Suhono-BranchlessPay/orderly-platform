"""
Build Android adaptive-icon foregrounds with a safe-zone inset.

Android adaptive icons crop to a circle/squircle; keep brand art in the
center ~66% so launchers don't clip the logo.

Usage:
  python scripts/make-adaptive-icon.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TENANTS = [
    ("samurai-martinsville", "#0F0F0F"),
    ("samurai-linton", "#0F0F0F"),
    ("kirin", "#F5EEE0"),
]
SIZE = 1024
# Content diameter ≈ 66% of canvas (Android safe zone guidance).
CONTENT = int(SIZE * 0.66)


def make_adaptive(logo_path: Path, bg_hex: str, out_path: Path) -> None:
    bg = Image.new("RGBA", (SIZE, SIZE), hex_to_rgba(bg_hex))
    logo = Image.open(logo_path).convert("RGBA")
    logo.thumbnail((CONTENT, CONTENT), Image.Resampling.LANCZOS)
    x = (SIZE - logo.width) // 2
    y = (SIZE - logo.height) // 2
    bg.paste(logo, (x, y), logo)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"wrote {out_path.relative_to(ROOT)} ({out_path.stat().st_size} bytes)")


def hex_to_rgba(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def main() -> None:
    for slug, bg in TENANTS:
        brand = ROOT / "tenants" / slug / "assets" / "brand"
        logo = brand / "logo.png"
        icon = brand / "icon.png"
        src = logo if logo.exists() else icon
        if not src.exists():
            print(f"skip {slug}: no logo/icon")
            continue
        make_adaptive(src, bg, brand / "adaptive-icon.png")


if __name__ == "__main__":
    main()
