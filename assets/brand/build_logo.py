"""Rebuild Orderly lockup: ORIGINAL fork badge + aligned ORDERLY / FOODS.COM text."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "orderly-logo-original.png"
OUT_PNG = ROOT / "orderly-logo.png"
OUT_TRANSPARENT = ROOT / "orderly-logo-transparent.png"
OUT_POWERED = ROOT / "orderly-powered.png"  # compact for footers
OUT_POWERED_WHITE = ROOT / "orderly-powered-on-dark.png"

TEAL = (26, 74, 76, 255)
BG = (246, 244, 239, 255)


def load_font(size: int, bold: bool = True):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\seguisb.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def is_ink(c, bg, thr=40):
    return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > thr


def extract_original_badge(src: Image.Image) -> Image.Image:
    """Crop ONLY the original fork badge — do not redraw it."""
    im = src.convert("RGBA")
    px = im.load()
    w, h = im.size
    # Real cream bg (corners of this PNG are a gray frame — avoid them)
    bg = px[min(24, w - 1), min(24, h - 1)][:3]
    if sum(bg) < 500:  # still gray? fall back
        bg = (252, 251, 248)

    def ink(c, thr=50):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > thr

    # Gap between badge and ORDERLY ≈ columns with near-zero ink after the badge
    dens = [sum(1 for y in range(h) if ink(px[x, y])) for x in range(w)]
    # Find first run of low-density columns after some high density
    icon_right = None
    seen_icon = False
    run = 0
    for x, d in enumerate(dens):
        if d >= 20:
            seen_icon = True
            run = 0
        elif seen_icon:
            run += 1
            if run >= 4 and d <= 10:
                icon_right = x - run + 1
                break
    if icon_right is None:
        icon_right = 78

    rows = [y for y in range(h) if any(ink(px[x, y]) for x in range(icon_right))]
    top, bot = rows[0], rows[-1] + 1
    # slight pad inside icon_right so we don't clip AA
    crop = im.crop((0, top, icon_right, bot)).convert("RGBA")

    cpx = crop.load()
    cw, ch = crop.size
    for y in range(ch):
        for x in range(cw):
            c = cpx[x, y]
            if not ink(c, 45):
                cpx[x, y] = (0, 0, 0, 0)
            else:
                dist = abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2])
                a = min(255, max(c[3], int(dist * 2.5)))
                cpx[x, y] = (c[0], c[1], c[2], a)

    bbox = crop.getbbox()
    out = crop.crop(bbox) if bbox else crop

    # Strip gray UI/frame artifacts (corners of source PNG are ~rgb 94)
    opx = out.load()
    ow, oh = out.size
    for y in range(oh):
        for x in range(ow):
            c = opx[x, y]
            if c[3] == 0:
                continue
            # gray-ish neutral (not teal): R≈G≈B and not dark-teal
            if abs(c[0] - c[1]) < 8 and abs(c[1] - c[2]) < 8 and c[0] < 140 and c[1] > 70:
                # keep if it's anti-aliased teal edge (G slightly higher)? drop flat gray
                if c[1] - c[0] < 5:
                    opx[x, y] = (0, 0, 0, 0)
    bbox2 = out.getbbox()
    return out.crop(bbox2) if bbox2 else out


def text_metrics(draw, text, font):
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1], box


def draw_justified(draw, text, font, x, y, target_width, fill, probe):
    chars = list(text)
    advances = []
    for ch in chars:
        bb = probe.textbbox((0, 0), ch, font=font)
        advances.append(bb[2] - bb[0])
    total = sum(advances)
    gaps = len(chars) - 1
    gap = (target_width - total) / gaps if gaps else 0
    cursor = float(x)
    for i, ch in enumerate(chars):
        bb = probe.textbbox((0, 0), ch, font=font)
        draw.text((int(round(cursor - bb[0])), y), ch, font=font, fill=fill)
        cursor += advances[i] + (gap if i < gaps else 0)


def compose_lockup(badge: Image.Image, background, scale_badge_h=520):
    # Upscale original badge (LANCZOS) — keep mark intact
    scale = scale_badge_h / badge.size[1]
    icon = badge.resize(
        (max(1, int(badge.size[0] * scale)), scale_badge_h),
        Image.Resampling.LANCZOS,
    )

    word, sub = "ORDERLY", "FOODS.COM"
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))

    target_h = int(scale_badge_h * 0.56)
    size = 220
    font_word = load_font(size, True)
    while True:
        _, h, _ = text_metrics(probe, word, font_word)
        if h <= target_h or size < 40:
            break
        size -= 2
        font_word = load_font(size, True)

    word_w, word_h, word_bb = text_metrics(probe, word, font_word)
    # FOODS.COM must read clearly on mobile (~40px logo height)
    sub_size = max(48, int(word_h * 0.44))
    font_sub = load_font(sub_size, True)
    _, sub_h, sub_bb = text_metrics(probe, sub, font_sub)
    # Moderate tracking — still aligns near ORDERLY width without thinning glyphs
    track = max(2, int(sub_size * 0.10))

    gap_icon_text = int(scale_badge_h * 0.12)
    gap_lines = int(word_h * 0.10)
    text_block_h = word_h + gap_lines + sub_h
    pad = int(scale_badge_h * 0.10)
    canvas_h = max(scale_badge_h, text_block_h)
    canvas_w = pad + icon.size[0] + gap_icon_text + word_w + pad

    canvas = Image.new("RGBA", (canvas_w, canvas_h + pad * 2), background)
    draw = ImageDraw.Draw(canvas)

    icon_y = pad + (canvas_h - scale_badge_h) // 2
    canvas.alpha_composite(icon, (pad, icon_y))

    text_x = pad + icon.size[0] + gap_icon_text
    text_top = pad + (canvas_h - text_block_h) // 2
    draw.text((text_x - word_bb[0], text_top - word_bb[1]), word, font=font_word, fill=TEAL)

    # Measure ORDERLY ink left; draw FOODS.COM flush-left with readable tracking
    sample = canvas.crop((text_x - 2, text_top - 2, text_x + word_w + 8, text_top + word_h + 8))
    sp = sample.load()
    sw, sh = sample.size
    ink_cols = []
    for x in range(sw):
        for y in range(sh):
            c = sp[x, y]
            if c[3] > 20 and c[0] < 90 and c[1] < 130 and c[2] < 130:
                ink_cols.append(x)
                break
    ink_left = text_x - 2 + ink_cols[0] if ink_cols else text_x

    sub_y = text_top + word_h + gap_lines - sub_bb[1]
    # tracked draw (not full-justify) + 1px stroke for weight
    chars = list(sub)
    widths = [probe.textbbox((0, 0), ch, font=font_sub)[2] - probe.textbbox((0, 0), ch, font=font_sub)[0] for ch in chars]
    cursor = float(ink_left)
    for i, ch in enumerate(chars):
        bb = probe.textbbox((0, 0), ch, font=font_sub)
        x = int(round(cursor - bb[0]))
        for dx, dy in ((0, 0), (1, 0), (0, 1)):
            draw.text((x + dx, sub_y + dy), ch, font=font_sub, fill=TEAL)
        cursor += widths[i] + (track if i < len(chars) - 1 else 0)
    return canvas


def make_powered(src_lockup: Image.Image, on_dark: bool = False) -> Image.Image:
    """Compact footer mark from full lockup — high-res so CSS can scale cleanly."""
    h = 160  # retina-friendly; display ~32–40px in footer
    scale = h / src_lockup.size[1]
    img = src_lockup.resize(
        (max(1, int(src_lockup.size[0] * scale)), h),
        Image.Resampling.LANCZOS,
    )
    if on_dark:
        px = img.load()
        for y in range(img.size[1]):
            for x in range(img.size[0]):
                c = px[x, y]
                if c[3] < 10:
                    continue
                lum = (c[0] + c[1] + c[2]) / 3
                if lum < 200:
                    a = c[3]
                    px[x, y] = (230, 230, 230, a)
    return img


def build():
    src = Image.open(SRC)
    badge = extract_original_badge(src)
    badge.save(ROOT / "orderly-fork-badge.png")
    print("badge", badge.size)

    # Website primary mark = transparent (no cream box on header/footer)
    transparent = compose_lockup(badge, (0, 0, 0, 0))
    with_bg = compose_lockup(badge, BG)
    transparent.save(OUT_PNG, "PNG")
    transparent.save(OUT_TRANSPARENT, "PNG")
    with_bg.save(ROOT / "orderly-logo-on-cream.png", "PNG")

    powered = make_powered(transparent, on_dark=False)
    powered_dark = make_powered(transparent, on_dark=True)
    powered.save(OUT_POWERED, "PNG")
    powered_dark.save(OUT_POWERED_WHITE, "PNG")

    print("wrote", OUT_PNG, "(transparent)")
    print("wrote", OUT_TRANSPARENT)
    print("wrote", ROOT / "orderly-logo-on-cream.png")
    print("wrote", OUT_POWERED)
    print("wrote", OUT_POWERED_WHITE)


if __name__ == "__main__":
    build()
