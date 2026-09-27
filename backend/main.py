"""FastAPI application for IPL Analytics Dashboard."""

import hashlib
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import unquote

# Load .env BEFORE any router imports so all env vars are available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
except ImportError:
    pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, Response

from . import seo
from .auth_db import init_auth_db
from .http_cache import HttpCacheMiddleware
from .routers import meta, matches, players, teams, analytics, venues, seasons, images, social, advanced, pulse, auth, fantasy, quiz
from .tournaments import get_tournament_slug, reset_tournament, set_tournament

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

# Team images directory
TEAM_IMAGES_DIR = Path(__file__).resolve().parent / "team_images"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle for the application."""
    init_auth_db()

    yield


app = FastAPI(title="IPL Analytics API", version="1.0.0", lifespan=lifespan)

# CORS — allow frontend origins
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def select_tournament(request, call_next):
    """Select an isolated analytics database for this request.

    IPL remains the default for every legacy URL. The frontend sends the
    explicit ``tournament`` query parameter for all tournament-aware requests.
    """
    token = set_tournament(
        request.query_params.get("tournament")
        or request.headers.get("X-Tournament")
    )
    try:
        response = await call_next(request)
        return response
    finally:
        reset_tournament(token)


# Outermost last: gzip wraps the cache, which stores uncompressed bodies.
app.add_middleware(HttpCacheMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)

# API Routers
app.include_router(meta.router)
app.include_router(matches.router)
app.include_router(players.router)
app.include_router(teams.router)
app.include_router(analytics.router)
app.include_router(venues.router)
app.include_router(seasons.router)
app.include_router(images.router)
app.include_router(social.router)
app.include_router(advanced.router)
app.include_router(pulse.router)
app.include_router(auth.router)
app.include_router(fantasy.router)
app.include_router(quiz.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# ── SEO: sitemap and social preview images ──────────────────────────────────
_sitemap_cache: dict[str, str] = {}


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    if "xml" not in _sitemap_cache:
        _sitemap_cache["xml"] = seo.build_sitemap()
    return Response(
        content=_sitemap_cache["xml"],
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


OG_CACHE_DIR = Path(__file__).resolve().parent / "cache" / "og"
OG_VERSION = "1"


@app.get("/api/og", include_in_schema=False)
def og_image(path: str = "/dashboard"):
    """1200x630 preview image for any page, built from the same data as its meta."""
    from .routers.images import generate_og_image

    # Accept both "/batting/V Kohli" and the canonical "/batting/V%20Kohli".
    meta = seo.page_meta(unquote(path))
    key = hashlib.sha256(f"{OG_VERSION}|{get_tournament_slug()}|{meta.path}|{meta.status}".encode()).hexdigest()[:32]
    cached = OG_CACHE_DIR / f"{key}.png"
    if cached.is_file():
        data = cached.read_bytes()
    else:
        data = generate_og_image(
            meta.heading or meta.title,
            None if meta.stats else meta.description,
            kicker=meta.kicker or None,
            stats=meta.stats,
        )
        try:
            OG_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(data)
        except OSError:
            pass
    return Response(content=data, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})


# Serve team logo images
if TEAM_IMAGES_DIR.is_dir():
    app.mount("/api/team-images", StaticFiles(directory=str(TEAM_IMAGES_DIR)), name="team-images")


# ── Serve frontend static build in production ──────────────────────
# In production, the React build (frontend/dist) is served by FastAPI itself.
# This avoids needing a separate frontend server.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


_index_cache: dict = {}


def _index_html() -> str:
    """The built index.html, re-read only when the file changes."""
    index = FRONTEND_DIST / "index.html"
    mtime = index.stat().st_mtime
    if _index_cache.get("mtime") != mtime:
        _index_cache.update(mtime=mtime, html=index.read_text(encoding="utf-8"))
    return _index_cache["html"]


def resolve_static_file(root: Path, requested: str) -> Path | None:
    """Return the file under ``root`` for ``requested``, or None.

    Rejects anything that resolves outside ``root`` (e.g. ``..%2f`` path
    traversal), so only the frontend build is ever served.
    """
    if not requested:
        return None
    root = root.resolve()
    candidate = (root / requested).resolve()
    if candidate.is_relative_to(root) and candidate.is_file():
        return candidate
    return None

if FRONTEND_DIST.is_dir():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")

    # Serve other static files at root level (favicon, etc.)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve React SPA — all non-API routes return index.html."""
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = resolve_static_file(FRONTEND_DIST, full_path)
        if file_path:
            return FileResponse(str(file_path))
        # Every app route gets server-rendered meta + a crawlable summary.
        page, status = seo.render_index(_index_html(), full_path)
        return HTMLResponse(page, status_code=status, headers={"Cache-Control": "no-cache"})
