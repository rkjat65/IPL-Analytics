"""FastAPI application for IPL Analytics Dashboard."""

import hashlib
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit

# Load .env BEFORE any router imports so all env vars are available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response

from . import seo
from .auth_db import init_auth_db
from .http_cache import HttpCacheMiddleware
from .routers import meta, matches, players, teams, analytics, venues, seasons, images, social, advanced, pulse, auth, fantasy, quiz, records, phases, export
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


_LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]", "testserver"}

# crickrida.com is one site: the international archive owns the root and this
# app lives under one prefix per tournament. These map the app's old root-level
# addresses (and the retired subdomain) onto the new ones.
SPA_PREFIXES = {"/ipl": "ipl", "/t20-world-cup": "t20wc"}
TOURNAMENT_PREFIX = {slug: prefix for prefix, slug in SPA_PREFIXES.items()}
LEGACY_APP_ROOTS = {
    "dashboard", "matches", "batting", "bowling", "players", "teams", "venues", "seasons",
    "h2h", "charts", "pulse", "records", "matchups", "phases", "content-studio", "fantasy",
    "quiz", "faq", "image-credits", "privacy", "terms", "account-deletion", "admin", "login",
    "social", "ask", "player-impact",
}
SITE_FILES = {"/sitemap.xml", "/robots.txt", "/llms.txt"}
ANY_HOST_PATHS = {"/sw.js"}


def spa_prefix(path: str) -> tuple[str, str] | None:
    """('/ipl', 'ipl') when ``path`` is an app page, else None."""
    for prefix, slug in SPA_PREFIXES.items():
        if path == prefix or path.startswith(prefix + "/"):
            return prefix, slug
    return None


# Tools rebuilt on the shared site, one page for every competition. Their app
# addresses 301 there with the matching competition filter.
MOVED_TOOLS = ("/matchups", "/phases", "/fantasy", "/quiz", "/content-studio")


def _season_span(value: str | None) -> tuple[str, str]:
    years = sorted({part.strip()[:4] for part in (value or "").split(",") if part.strip()[:4].isdigit()})
    return (years[0], years[-1]) if years else ("", "")


def moved_tool(inner: str, slug: str, params: list[tuple[str, str]]) -> str | None:
    """Shared-site address for an app tool page, or None if the page did not move."""
    tool = inner.rstrip("/")
    if tool not in MOVED_TOOLS:
        return None
    ipl = slug != "t20wc"
    given = dict(params)
    if tool == "/content-studio":
        return "/studio/?format=" + ("IPL" if ipl else "T20I")
    if tool == "/quiz":
        q = {"mode": "ipl" if ipl else "t20wc", "level": given.get("level", "")}
    elif tool == "/fantasy":
        q = {"comp": "" if ipl else "T20I-Men", "team1": given.get("team1", ""), "team2": given.get("team2", "")}
    else:
        first, last = _season_span(given.get("season"))
        q = {"comp": ("" if tool == "/phases" else "IPL") if ipl else "T20WC", "from": first, "to": last}
        if tool == "/phases":
            q["team"] = given.get("team", "")
        else:
            names = [given.get("batter", ""), given.get("bowler", "")]
            if any(names):
                from .database import query
                token = set_tournament(slug)
                try:
                    ids = {r["name"]: r["player_id"] for r in query("SELECT name, player_id FROM players WHERE name IN (?, ?)", names)}
                finally:
                    reset_tournament(token)
                q.update({"batter": ids.get(names[0], ""), "bowler": ids.get(names[1], "")})
    q = {k: v for k, v in q.items() if v}
    return f"{tool}/" + (f"?{urlencode(q)}" if q else "")


def legacy_app_path(path: str, query: str) -> str | None:
    """New address of an app page from before it moved under /ipl and /t20-world-cup."""
    first = path.strip("/").split("/", 1)[0]
    if first and first not in LEGACY_APP_ROOTS:
        return None
    params = parse_qsl(query, keep_blank_values=True)
    tournament = next((value for key, value in params if key == "tournament"), "ipl")
    rest = [(key, value) for key, value in params if key not in ("tournament", "data_release")]
    inner = path.rstrip("/") if first else "/dashboard"
    moved = moved_tool(inner, "t20wc" if tournament == "t20wc" else "ipl", rest)
    if moved:
        return moved
    target = TOURNAMENT_PREFIX.get(tournament, "/ipl") + inner
    return target + (f"?{urlencode(rest)}" if rest else "")


def canonical_redirect(host: str, path: str, query: str, method: str) -> str | None:
    """Where a request on a retired hostname should go, or None to serve it here.

    Only active when CANONICAL_ORIGIN is set. Old app pages go straight to their
    /ipl or /t20-world-cup address in one hop. The API stays reachable on every
    host so installed mobile apps keep working after the move.
    """
    origin = (os.getenv("CANONICAL_ORIGIN") or "").rstrip("/")
    if not origin or method not in ("GET", "HEAD") or path.startswith("/api/") or path in ANY_HOST_PATHS:
        return None
    host = (host or "").lower()
    canonical_host = urlsplit(origin).netloc.lower()
    if not host or host == canonical_host or host.split(":")[0] in _LOCAL_HOSTS:
        return None
    same = path + (f"?{query}" if query else "")
    if spa_prefix(path) or path in SITE_FILES or path.startswith("/app/"):
        return origin + same
    moved = legacy_app_path(path, query)
    if moved:
        return origin + moved
    if FRONTEND_DIST.is_dir() and resolve_static_file(FRONTEND_DIST, path.lstrip("/")):
        return origin + "/app" + same  # fonts, icons and images the old app served from the root
    return origin + same


@app.middleware("http")
async def redirect_to_canonical_host(request, call_next):
    target = canonical_redirect(request.headers.get("host", ""), request.url.path, request.url.query, request.method)
    if target:
        return RedirectResponse(target, status_code=301)
    return await call_next(request)


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
app.include_router(records.router)
app.include_router(phases.router)
app.include_router(export.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "release": os.getenv("APP_RELEASE", "local")}


# ── SEO: sitemap and social preview images ──────────────────────────────────
_sitemap_cache: dict[str, str] = {}


@app.get("/sitemap-ipl.xml", include_in_schema=False)
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

# Crickrida no longer runs a service worker. This one replaces any worker an
# earlier version registered at the site root, clears its caches and removes itself.
RETIRED_SERVICE_WORKER = """self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('crickrida-')) await caches.delete(key)
    await self.registration.unregister()
  })())
})
"""


@app.get("/sw.js", include_in_schema=False)
def retired_service_worker():
    return Response(RETIRED_SERVICE_WORKER, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


def _frontend_file(requested: str) -> Path | None:
    return resolve_static_file(FRONTEND_DIST, requested) if FRONTEND_DIST.is_dir() else None


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(request: Request, full_path: str):
    """App pages under /ipl and /t20-world-cup, built files under /app, redirects for old addresses."""
    path = "/" + full_path
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    if full_path.startswith("app/"):
        file_path = _frontend_file(full_path[len("app/"):])
        if file_path:
            return FileResponse(str(file_path))
        raise HTTPException(status_code=404, detail="Not found")
    hit = spa_prefix(path)
    if hit:
        if not FRONTEND_DIST.is_dir():
            raise HTTPException(status_code=404, detail="Frontend not built")
        prefix, slug = hit
        moved = moved_tool(path[len(prefix):] or "/", slug, parse_qsl(request.url.query, keep_blank_values=True))
        if moved:
            return RedirectResponse(moved, status_code=301)
        token = set_tournament(slug)
        try:
            # Every app route gets server-rendered meta and a crawlable summary.
            page, status = seo.render_index(_index_html(), path[len(prefix):] or "/")
        finally:
            reset_tournament(token)
        return HTMLResponse(page, status_code=status, headers={"Cache-Control": "no-cache"})
    moved = legacy_app_path(path, request.url.query)
    if moved:
        return RedirectResponse(moved, status_code=301)
    file_path = _frontend_file(full_path)  # robots.txt, llms.txt and root files older clients still ask for
    if file_path:
        return FileResponse(str(file_path))
    raise HTTPException(status_code=404, detail="Not found")
