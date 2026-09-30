"""The Crickrida mark ("Play K") for server-drawn images.

Same geometry as bleedblue/tools/brand_mark.py (mark space 244 x 240), so
share images match the site's logo.
"""

from PIL import Image, ImageDraw

BAT_COLOR = (0, 229, 255)     # the site's cyan
BALL_COLOR = (255, 45, 120)   # the site's magenta, a red cricket ball
INK = (232, 232, 237)

W, H = 244, 240
STEM = [(0, 0), (66, 0), (66, 98), (0, 194)]
BAT_SHAPE = [(61.4, 125.9), (95.7, 76.0), (238.4, 234.1), (241.4, 238.1), (238.2, 240.0), (235.8, 240.0), (164.4, 240.0)]
BALL = (176.0, 42.0, 39.0)
SEAM_DIR = (0.5665, -0.8240)
SEAM_NORMAL = (0.8240, 0.5665)
SEAM_OFFSETS = (-5.5, 5.5)
SEAM_WIDTH = 4.5


def draw_mark(img: Image.Image, x: float, y: float, height: float, stem=INK, bat=BAT_COLOR, ball=BALL_COLOR) -> float:
    """Draw the mark with its top-left at (x, y); returns the drawn width.
    The seam is cut to the pixels behind the ball's centre, so it reads on any background."""
    s = height / H
    pt = lambda px, py: (x + px * s, y + py * s)  # noqa: E731
    draw = ImageDraw.Draw(img, "RGBA")
    draw.polygon([pt(*p) for p in STEM], fill=(*stem, 255))
    draw.polygon([pt(*p) for p in BAT_SHAPE], fill=(*bat, 255))
    cx, cy, r = BALL
    behind = img.getpixel((int(x + (cx + r + 6) * s), int(y + cy * s)))
    draw.ellipse([pt(cx - r, cy - r), pt(cx + r, cy + r)], fill=(*ball, 255))
    width = max(1, round(SEAM_WIDTH * s))
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    for k in SEAM_OFFSETS:
        ox, oy = cx + k * SEAM_NORMAL[0], cy + k * SEAM_NORMAL[1]
        md.line([pt(ox - 120 * SEAM_DIR[0], oy - 120 * SEAM_DIR[1]), pt(ox + 120 * SEAM_DIR[0], oy + 120 * SEAM_DIR[1])], fill=255, width=width)
    ball = Image.new("L", img.size, 0)
    ImageDraw.Draw(ball).ellipse([pt(cx - r, cy - r), pt(cx + r, cy + r)], fill=255)
    cut = Image.composite(mask, Image.new("L", img.size, 0), ball)
    img.paste(Image.new("RGBA", img.size, behind if len(behind) == 4 else (*behind, 255)), (0, 0), cut)
    return W * s
