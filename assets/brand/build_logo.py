"""Rebuild Orderly lockup: ORIGINAL fork badge + precise ORDERLY / FOODS.COM."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "orderly-logo-original.png"
OUT_PNG = ROOT / "orderly-logo.png"
OUT_TRANSPARENT = ROOT / "orderly-logo-transparent.png"
OUT_POWERED = ROOT / "orderly-powered.png"
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
    bg = px[min(24, w - 1), min(24, h - 1)][:3]
    if sum(bg) < 500:
        bg = (252, 251, 248)

    def ink(c, thr=50):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > thr

    dens = [sum(1 for y in range(h) if ink(px[x, y])) for x in range(w)]
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

    opx = out.load()
    ow, oh = out.size
    for y in range(oh):
        for x in range(ow):
            c = opx[x, y]
            if c[3] == 0:
                continue
            if abs(c[0] - c[1]) < 8 and abs(c[1] - c[2]) < 8 and c[0] < 140 and c[1] > 70:
                if c[1] - c[0] < 5:
                    opx[x, y] = (0, 0, 0, 0)
    bbox2 = out.getbbox()
    return out.crop(bbox2) if bbox2 else out


def text_metrics(_draw, text, font):
    box = ImageDraw.Draw(Image.new("RGBA", (8, 8))).textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1], box


def draw_justified(draw, text, font, x, y, target_width, fill, probe, stroke=0):
    chars = list(text)
    advances = [
        probe.textbbox((0, 0), ch, font=font)[2] - probe.textbbox((0, 0), ch, font=font)[0]
        for ch in chars
    ]
    total = sum(advances)
    gaps = len(chars) - 1
    gap = (target_width - total) / gaps if gaps else 0
    cursor = float(x)
    for i, ch in enumerate(chars):
        bb = probe.textbbox((0, 0), ch, font=font)
        px = int(round(cursor - bb[0]))
        if stroke:
            for dx in (-stroke, 0, stroke):
                for dy in (-stroke, 0, stroke):
                    if dx or dy:
                        draw.text((px + dx, y + dy), ch, font=font, fill=fill)
        draw.text((px, y), ch, font=font, fill=fill)
        cursor += advances[i] + (gap if i < gaps else 0)


def measure_ink(canvas: Image.Image, box):
    l, t, r, b = box
    sample = canvas.crop((l, t, r, b))
    sp = sample.load()
    sw, sh = sample.size
    cols = []
    for x in range(sw):
        for y in range(sh):
            c = sp[x, y]
            # include soft AA teal edges
            if c[3] > 12 and c[0] < 160 and c[1] < 180 and c[2] < 180 and (c[1] + c[2]) > c[0]:
                cols.append(x)
                break
    if not cols:
        return l, r - l
    return l + cols[0], cols[-1] - cols[0] + 1


def trim_pad(im: Image.Image, pad: int = 16) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    cropped = im.crop(bbox)
    out = Image.new("RGBA", (cropped.size[0] + pad * 2, cropped.size[1] + pad * 2), (0, 0, 0, 0))
    out.alpha_composite(cropped, (pad, pad))
    return out


def compose_lockup(badge: Image.Image, background, scale_badge_h=640):
    """
    [fork]  ORDERLY
            FOODS.COM   ← left/right edges flush with ORDERLY
    """
    scale = scale_badge_h / badge.size[1]
    icon = badge.resize(
        (max(1, int(badge.size[0] * scale)), scale_badge_h),
        Image.Resampling.LANCZOS,
    )

    word, sub = "ORDERLY", "FOODS.COM"
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))

    # ORDERLY ≈ 52% badge height — proportional to icon
    target_h = int(scale_badge_h * 0.52)
    size = 240
    font_word = load_font(size, True)
    while True:
        _, h, _ = text_metrics(probe, word, font_word)
        if h <= target_h or size < 40:
            break
        size -= 2
        font_word = load_font(size, True)

    word_w, word_h, word_bb = text_metrics(probe, word, font_word)

    # FOODS.COM secondary but readable (~30%), full-justify to ORDERLY width
    sub_size = max(38, int(word_h * 0.30))
    font_sub = load_font(sub_size, True)
    _, sub_h, sub_bb = text_metrics(probe, sub, font_sub)

    gap_icon_text = int(scale_badge_h * 0.14)
    gap_lines = max(12, int(word_h * 0.16))
    text_block_h = word_h + gap_lines + sub_h
    pad = int(scale_badge_h * 0.08)
    canvas_h = max(scale_badge_h, text_block_h)
    canvas_w = pad + icon.size[0] + gap_icon_text + word_w + pad

    canvas = Image.new("RGBA", (canvas_w, canvas_h + pad * 2), background)
    draw = ImageDraw.Draw(canvas)

    # Optical center: badge mouth makes geometric center feel low — nudge up ~3%
    icon_y = pad + (canvas_h - scale_badge_h) // 2 - int(scale_badge_h * 0.03)
    canvas.alpha_composite(icon, (pad, icon_y))

    text_x = pad + icon.size[0] + gap_icon_text
    text_top = pad + (canvas_h - text_block_h) // 2
    # Draw ORDERLY so its ink starts at text_x (compensate font left bearing)
    draw.text((text_x - word_bb[0], text_top - word_bb[1]), word, font=font_word, fill=TEAL)

    # Measure actual rendered ORDERLY ink for pixel-perfect subtitle alignment
    ink_left, ink_w = measure_ink(
        canvas,
        (max(0, text_x - 8), max(0, text_top - 8), text_x + word_w + 16, text_top + word_h + 8),
    )
    # Fallback to metrics if sampling failed
    if ink_w < word_w * 0.7:
        ink_left, ink_w = text_x, word_w

    sub_y = text_top + word_h + gap_lines - sub_bb[1]
    draw_justified(draw, sub, font_sub, ink_left, sub_y, ink_w, TEAL, probe, stroke=0)

    if background[3] == 0:
        return trim_pad(canvas, pad=12)
    # cream: trim then put back on cream
    trimmed = trim_pad(canvas, pad=12)
    cream = Image.new("RGBA", trimmed.size, BG)
    cream.alpha_composite(trimmed)
    return cream


def make_powered(src_lockup: Image.Image, on_dark: bool = False) -> Image.Image:
    h = 160
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
                if (c[0] + c[1] + c[2]) / 3 < 200:
                    px[x, y] = (230, 230, 230, c[3])
    return img


def build():
    src = Image.open(SRC)
    badge = extract_original_badge(src)
    badge.save(ROOT / "orderly-fork-badge.png")
    print("badge", badge.size)

    transparent = compose_lockup(badge, (0, 0, 0, 0))
    with_bg = compose_lockup(badge, BG)
    transparent.save(OUT_PNG, "PNG")
    transparent.save(OUT_TRANSPARENT, "PNG")
    with_bg.save(ROOT / "orderly-logo-on-cream.png", "PNG")

    powered = make_powered(transparent, on_dark=False)
    powered_dark = make_powered(transparent, on_dark=True)
    powered.save(OUT_POWERED, "PNG")
    powered_dark.save(OUT_POWERED_WHITE, "PNG")

    print("wrote", OUT_PNG, "(transparent, justified FOODS.COM)")
    print("wrote", OUT_TRANSPARENT)
    print("wrote", ROOT / "orderly-logo-on-cream.png")
    print("wrote", OUT_POWERED)
    print("wrote", OUT_POWERED_WHITE)


if __name__ == "__main__":
    build()
