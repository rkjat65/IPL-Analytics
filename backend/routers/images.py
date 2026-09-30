"""Image generation endpoints: branded stat card images and social preview (OG) images."""

import os
import io
import hashlib
import math
import random
import base64
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ..tournaments import get_tournament

try:
    from PIL import Image, ImageDraw, ImageFont
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
from ..brand import draw_mark

router = APIRouter(prefix="/api/images", tags=["Images"])

# ── Cache dir ─────────────────────────────────────────────────────────────────
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache", "images")
os.makedirs(CACHE_DIR, exist_ok=True)

# ── Neon Noir palette ─────────────────────────────────────────────────────────
PALETTE = {
    "bg": (10, 10, 15),
    "card": (17, 17, 24),
    "cyan": (0, 229, 255),
    "magenta": (255, 45, 120),
    "lime": (184, 255, 0),
    "amber": (255, 184, 0),
    "text": (224, 224, 240),
    "muted": (136, 136, 160),
    "border": (42, 42, 60),
}

STYLE_THEMES = {
    "neon": {
        "accent1": PALETTE["cyan"],
        "accent2": PALETTE["magenta"],
        "glow": True,
        "grid": True,
        "particles": True,
    },
    "minimal": {
        "accent1": (180, 180, 200),
        "accent2": (120, 120, 150),
        "glow": False,
        "grid": False,
        "particles": False,
    },
    "vintage": {
        "accent1": (255, 184, 0),
        "accent2": (200, 120, 60),
        "glow": True,
        "grid": False,
        "particles": True,
    },
    "electric": {
        "accent1": PALETTE["lime"],
        "accent2": PALETTE["cyan"],
        "glow": True,
        "grid": True,
        "particles": True,
    },
}


# ── Models ────────────────────────────────────────────────────────────────────

class ImageGenRequest(BaseModel):
    style: str = "neon"
    width: int = 1200
    height: int = 675
    title: Optional[str] = None
    subtitle: Optional[str] = None
    hero_stat: Optional[str] = None
    hero_label: Optional[str] = None
    stats: Optional[dict] = None
    team_color: Optional[str] = None
    watermark: bool = True


class OGImageRequest(BaseModel):
    title: str
    subtitle: Optional[str] = None
    stat: Optional[str] = None


# ── Drawing Helpers ───────────────────────────────────────────────────────────

def hex_to_rgb(hex_color: str) -> tuple:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def draw_dot_grid(draw, width, height, color, spacing=30, radius=1, opacity=40):
    dot_color = (*color[:3], opacity)
    for x in range(0, width, spacing):
        for y in range(0, height, spacing):
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=dot_color)


def draw_glow_circle(img, cx, cy, radius, color, alpha=30):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for r in range(radius, 0, -3):
        a = int(alpha * (r / radius))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*color, a))
    return Image.alpha_composite(img, overlay)


def draw_accent_bar(draw, x, y, width, height, color1, color2):
    for i in range(width):
        ratio = i / max(width, 1)
        r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
        g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
        b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
        draw.line([(x + i, y), (x + i, y + height)], fill=(r, g, b, 220))


def draw_particles(draw, width, height, color, count=30):
    random.seed(42)
    for _ in range(count):
        x = random.randint(0, width)
        y = random.randint(0, height)
        size = random.randint(2, 5)
        alpha = random.randint(30, 100)
        draw.ellipse([x - size, y - size, x + size, y + size], fill=(*color, alpha))


FONTS_DIR = os.path.join(os.path.dirname(__file__), "..", "fonts")
_font_cache: dict = {}


def get_font(size: int, bold: bool = False, family: str = "SpaceGrotesk"):
    """Load a bundled font (SIL OFL) so images render the same on every host.

    Falls back to Pillow's built-in font only if the bundled files are missing.
    """
    key = (family, size, bold)
    if key in _font_cache:
        return _font_cache[key]
    try:
        font = ImageFont.truetype(os.path.join(FONTS_DIR, f"{family}.ttf"), size)
        try:
            font.set_variation_by_axes([700 if bold else 400])
        except (OSError, AttributeError, ValueError):
            pass
    except (OSError, IOError):
        font = ImageFont.load_default(size=size)
    _font_cache[key] = font
    return font


# ── Generate Functions ────────────────────────────────────────────────────────

def generate_stat_card_image(req: ImageGenRequest) -> bytes:
    """Generate a branded stat card image — fills the entire card with big readable text."""
    w, h = req.width, req.height
    theme = STYLE_THEMES.get(req.style, STYLE_THEMES["neon"])
    accent1, accent2 = theme["accent1"], theme["accent2"]

    # Scale factor relative to Twitter default (1200x675)
    sf = min(w, h) / 675.0

    if req.team_color:
        try:
            accent1 = hex_to_rgb(req.team_color)
        except (ValueError, IndexError):
            pass

    img = Image.new("RGBA", (w, h), (*PALETTE["bg"], 255))
    draw = ImageDraw.Draw(img, "RGBA")

    # Background effects
    if theme["grid"]:
        draw_dot_grid(draw, w, h, PALETTE["muted"], spacing=int(28 * sf), radius=max(1, int(1.5 * sf)), opacity=30)

    if theme["glow"]:
        img = draw_glow_circle(img, int(w * 0.82), int(h * 0.18), int(280 * sf), accent1, alpha=25)
        img = draw_glow_circle(img, int(w * 0.08), int(h * 0.85), int(220 * sf), accent2, alpha=18)
        draw = ImageDraw.Draw(img, "RGBA")

    if theme["particles"]:
        draw_particles(draw, w, h, accent1, count=int(50 * sf))

    # Top accent bar (thick)
    bar_h = max(5, int(6 * sf))
    draw_accent_bar(draw, 0, 0, w, bar_h, accent1, accent2)

    # Left vertical accent bar
    left_bar_w = max(5, int(5 * sf))
    draw.rectangle([0, int(h * 0.15), left_bar_w, int(h * 0.95)], fill=(*accent1, 200))

    # ── Content Layout ─────────────────────────────────────
    pad_x = int(60 * sf)
    pad_y = int(50 * sf)
    content_w = w - 2 * pad_x

    # Subtitle / category label
    if req.subtitle:
        font_sub = get_font(max(18, int(22 * sf)), bold=True)
        draw.text((pad_x, pad_y), req.subtitle.upper(), fill=(*accent1, 255), font=font_sub)
        pad_y += int(40 * sf)

    # Title — large and bold
    if req.title:
        title_size = max(42, int(56 * sf))
        font_title = get_font(title_size, bold=True)
        # Word-wrap if too wide
        title_text = req.title
        title_bbox = draw.textbbox((0, 0), title_text, font=font_title)
        title_w = title_bbox[2] - title_bbox[0]
        max_title_w = int(content_w * 0.65)  # Leave room for hero stat

        if title_w > max_title_w and " " in title_text:
            words = title_text.split()
            line1 = ""
            line2 = ""
            for word in words:
                test = f"{line1} {word}".strip()
                tw = draw.textbbox((0, 0), test, font=font_title)[2]
                if tw <= max_title_w:
                    line1 = test
                else:
                    line2 += f" {word}"
            line2 = line2.strip()
            draw.text((pad_x, pad_y), line1, fill=(*PALETTE["text"], 255), font=font_title)
            if line2:
                draw.text((pad_x, pad_y + int(title_size * 1.15)), line2, fill=(*PALETTE["text"], 255), font=font_title)
                pad_y += int(title_size * 2.3)
            else:
                pad_y += int(title_size * 1.3)
        else:
            draw.text((pad_x, pad_y), title_text, fill=(*PALETTE["text"], 255), font=font_title)
            pad_y += int(title_size * 1.3)

    # Hero stat — massive number on the right
    if req.hero_stat:
        hero_size = max(72, int(100 * sf))
        font_hero = get_font(hero_size, bold=True)
        hero_bbox = draw.textbbox((0, 0), req.hero_stat, font=font_hero)
        hero_w = hero_bbox[2] - hero_bbox[0]
        hero_h = hero_bbox[3] - hero_bbox[1]
        hero_x = w - pad_x - hero_w
        hero_y = int(40 * sf)
        draw.text((hero_x, hero_y), req.hero_stat, fill=(*accent1, 255), font=font_hero)

        if req.hero_label:
            label_size = max(16, int(20 * sf))
            font_label = get_font(label_size)
            label_bbox = draw.textbbox((0, 0), req.hero_label.upper(), font=font_label)
            label_w = label_bbox[2] - label_bbox[0]
            draw.text(
                (w - pad_x - label_w, hero_y + hero_h + int(8 * sf)),
                req.hero_label.upper(),
                fill=(*PALETTE["muted"], 220), font=font_label
            )

    # Gradient divider line
    divider_y = pad_y + int(8 * sf)
    div_thickness = max(2, int(3 * sf))
    for i in range(min(int(content_w * 0.6), w - pad_x)):
        alpha_val = max(0, 200 - int(i * 200 / (content_w * 0.6)))
        for t in range(div_thickness):
            draw.point((pad_x + i, divider_y + t), fill=(*accent1, alpha_val))
    pad_y = divider_y + int(28 * sf)

    # Stats grid — fills remaining space fully
    if req.stats:
        items = list(req.stats.items())
        num_items = min(len(items), 9)
        cols = min(3, num_items)
        rows_count = math.ceil(num_items / cols)

        # Fill ALL remaining vertical space
        available_h = h - pad_y - int(55 * sf)  # Leave space for watermark + bottom bar
        col_w = content_w // cols
        row_h = available_h // max(rows_count, 1)

        # Start stats right after divider — no centering gap
        stats_start_y = pad_y

        for idx, (key, val) in enumerate(items[:num_items]):
            col = idx % cols
            row = idx // cols
            x = pad_x + col * col_w
            y = stats_start_y + row * row_h

            gap = int(8 * sf)
            card_x1 = x + gap
            card_y1 = y + gap
            card_x2 = x + col_w - gap
            card_y2 = y + row_h - gap
            card_h = card_y2 - card_y1

            # Card background with subtle border
            draw.rounded_rectangle(
                [card_x1, card_y1, card_x2, card_y2],
                radius=int(12 * sf),
                fill=(*PALETTE["card"], 220),
                outline=(*PALETTE["border"], 120),
                width=max(1, int(1.5 * sf)),
            )

            # Accent left edge on card
            accent_bar_h = max(card_h - int(24 * sf), int(30 * sf))
            draw.rectangle(
                [card_x1, card_y1 + (card_h - accent_bar_h) // 2,
                 card_x1 + max(4, int(4 * sf)),
                 card_y1 + (card_h + accent_bar_h) // 2],
                fill=(*accent1, 180),
            )

            # Label — scaled to card height for readability
            label_font_size = max(18, int(min(card_h * 0.16, 24 * sf)))
            font_lbl = get_font(label_font_size, bold=True)
            label_x = card_x1 + int(22 * sf)
            label_y = card_y1 + int(card_h * 0.18)
            draw.text((label_x, label_y), str(key).upper(), fill=(*PALETTE["muted"], 255), font=font_lbl)

            # Value — fills most of card height
            val_font_size = max(38, int(min(card_h * 0.40, 56 * sf)))
            font_val = get_font(val_font_size, bold=True)
            val_y = card_y1 + int(card_h * 0.42)
            draw.text((label_x, val_y), str(val), fill=(*PALETTE["text"], 255), font=font_val)

    # Watermark — always visible
    wm_size = max(14, int(16 * sf))
    font_wm = get_font(wm_size)
    wm_text = "crickrida.com • Cricket via Stats"
    wm_bbox = draw.textbbox((0, 0), wm_text, font=font_wm)
    wm_w = wm_bbox[2] - wm_bbox[0]
    draw.text((w - wm_w - int(24 * sf), h - int(36 * sf)), wm_text, fill=(*PALETTE["muted"], 150), font=font_wm)

    # Bottom accent line
    draw_accent_bar(draw, 0, h - max(3, int(3 * sf)), w, max(3, int(3 * sf)), accent2, accent1)

    output = io.BytesIO()
    img = img.convert("RGB")
    img.save(output, format="PNG", quality=95)
    return output.getvalue()


def _wrap(draw, text: str, font, max_width: int, max_lines: int) -> list[str]:
    """Greedy word wrap; the last line is ellipsised if the text doesn't fit."""
    words, lines, current = (text or "").split(), [], ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textlength(test, font=font) <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > max_width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def generate_og_image(
    title: str,
    subtitle: str = None,
    stat: str = None,
    *,
    kicker: str = None,
    stats: list | None = None,
    accent: tuple = None,
) -> bytes:
    """1200x630 social preview card: brand, kicker, title, subtitle, stat tiles."""
    w, h = 1200, 630
    pad = 64
    accent = accent or PALETTE["cyan"]
    img = Image.new("RGBA", (w, h), (*PALETTE["bg"], 255))
    draw = ImageDraw.Draw(img, "RGBA")

    draw_dot_grid(draw, w, h, PALETTE["muted"], spacing=30, opacity=18)
    img = draw_glow_circle(img, 1040, 90, 300, accent, alpha=28)
    img = draw_glow_circle(img, 80, 600, 240, PALETTE["magenta"], alpha=18)
    draw = ImageDraw.Draw(img, "RGBA")
    draw_accent_bar(draw, 0, 0, w, 6, accent, PALETTE["magenta"])

    # Brand + kicker
    mark_w = draw_mark(img, pad, 40, 34)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.text((pad + mark_w + 10, 40), "crickrida", fill=(*PALETTE["text"], 255), font=get_font(30, bold=True))
    kicker = kicker or f"{get_tournament().short_name} analytics"
    draw.text((pad, 88), kicker.upper(), fill=(*PALETTE["muted"], 230),
              font=get_font(18, family="JetBrainsMono"))

    # Title (shrinks for long names)
    y = 150
    for size in (72, 62, 54):
        font_title = get_font(size, bold=True)
        lines = _wrap(draw, title, font_title, w - 2 * pad, 2)
        if len(lines) == 1 or size == 54:
            break
    for line in lines:
        draw.text((pad, y), line, fill=(*PALETTE["text"], 255), font=font_title)
        y += int(font_title.size * 1.12)

    if subtitle:
        font_sub = get_font(28, family="Inter")
        for line in _wrap(draw, subtitle, font_sub, w - 2 * pad, 2):
            draw.text((pad, y + 8), line, fill=(*PALETTE["muted"], 235), font=font_sub)
            y += 38

    tiles = list(stats or [])[:4]
    if stat and not tiles:
        tiles = [("", stat)]
    if tiles:
        gap = 20
        tile_w = (w - 2 * pad - gap * (len(tiles) - 1)) // len(tiles)
        tile_h = 120
        ty = h - pad - tile_h - 20
        font_label = get_font(17, family="JetBrainsMono")
        colors = [accent, PALETTE["magenta"], PALETTE["lime"], PALETTE["amber"]]
        for i, (label, value) in enumerate(tiles):
            tx = pad + i * (tile_w + gap)
            color = colors[i % len(colors)]
            draw.rounded_rectangle([tx, ty, tx + tile_w, ty + tile_h], radius=16,
                                   fill=(*PALETTE["card"], 235), outline=(*color, 110), width=2)
            if label:
                draw.text((tx + 22, ty + 18), str(label).upper(), fill=(*color, 255), font=font_label)
            value = str(value)
            for size in (48, 40, 32, 26):
                font_val = get_font(size, bold=True)
                if draw.textlength(value, font=font_val) <= tile_w - 44:
                    break
            draw.text((tx + 22, ty + (50 if label else 34)), value, fill=(*PALETTE["text"], 255), font=font_val)

    # Footer
    font_wm = get_font(18, family="JetBrainsMono")
    site = "crickrida.com"
    draw.text((w - pad - draw.textlength(site, font=font_wm), h - 44), site,
              fill=(*PALETTE["muted"], 200), font=font_wm)
    draw.rectangle([0, h - 5, w, h], fill=(*accent, 160))

    output = io.BytesIO()
    img.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


# ── Caching ───────────────────────────────────────────────────────────────────

def get_cache_key(data: dict) -> str:
    raw = f"{get_tournament().slug}:{sorted(data.items())}".encode()
    return hashlib.md5(raw).hexdigest()


def get_cached(key: str) -> bytes | None:
    path = os.path.join(CACHE_DIR, f"{key}.png")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    return None


def set_cache(key: str, data: bytes):
    path = os.path.join(CACHE_DIR, f"{key}.png")
    with open(path, "wb") as f:
        f.write(data)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/styles")
def get_styles():
    return {
        "styles": [
            {"id": "neon", "label": "Neon Noir", "description": "Signature dark theme with cyan/magenta glows"},
            {"id": "minimal", "label": "Minimal", "description": "Clean, subtle design with muted tones"},
            {"id": "vintage", "label": "Vintage Gold", "description": "Classic amber/gold tones with warm glow"},
            {"id": "electric", "label": "Electric", "description": "High-energy lime/cyan with particles"},
        ]
    }


@router.post("/generate")
async def generate_image(req: ImageGenRequest):
    if not PILLOW_AVAILABLE:
        raise HTTPException(503, "Image generation requires Pillow. Install with: pip install Pillow")

    # Clear old cache to force regeneration with new layout
    cache_key = get_cache_key(req.model_dump())

    try:
        img_bytes = generate_stat_card_image(req)
        set_cache(cache_key, img_bytes)
        return Response(content=img_bytes, media_type="image/png",
                       headers={"X-Cache": "MISS", "Content-Disposition": "inline; filename=crickrida-card.png"})
    except Exception as e:
        raise HTTPException(500, f"Image generation failed: {str(e)}")


@router.post("/generate-base64")
async def generate_image_base64(req: ImageGenRequest):
    if not PILLOW_AVAILABLE:
        raise HTTPException(503, "Image generation requires Pillow")

    try:
        img_bytes = generate_stat_card_image(req)
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        return {"image": f"data:image/png;base64,{b64}", "cached": False}
    except Exception as e:
        raise HTTPException(500, f"Image generation failed: {str(e)}")


@router.post("/og")
async def create_og_image(req: OGImageRequest):
    if not PILLOW_AVAILABLE:
        raise HTTPException(503, "Image generation requires Pillow")

    try:
        img_bytes = generate_og_image(req.title, req.subtitle, req.stat)
        return Response(content=img_bytes, media_type="image/png",
                       headers={"X-Cache": "MISS"})
    except Exception as e:
        raise HTTPException(500, f"OG image generation failed: {str(e)}")


@router.get("/formats")
def get_formats():
    return {
        "formats": [
            {"id": "twitter", "label": "Twitter/X", "width": 1200, "height": 675},
            {"id": "instagram", "label": "Instagram", "width": 1080, "height": 1080},
            {"id": "linkedin", "label": "LinkedIn", "width": 1200, "height": 628},
            {"id": "story", "label": "Story/Reel", "width": 1080, "height": 1920},
            {"id": "og", "label": "OG Image", "width": 1200, "height": 630},
        ]
    }
