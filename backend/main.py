"""FastAPI application for IPL Analytics Dashboard."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

# Load .env BEFORE any router imports so all env vars are available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .auth_db import init_auth_db
from .routers import meta, matches, players, teams, analytics, venues, seasons, ai, images, social, advanced, pulse, auth
from .tournaments import reset_tournament, set_tournament

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

# API Routers
app.include_router(meta.router)
app.include_router(matches.router)
app.include_router(players.router)
app.include_router(teams.router)
app.include_router(analytics.router)
app.include_router(venues.router)
app.include_router(seasons.router)
app.include_router(ai.router)
app.include_router(images.router)
app.include_router(social.router)
app.include_router(advanced.router)
app.include_router(pulse.router)
app.include_router(auth.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# Serve team logo images
if TEAM_IMAGES_DIR.is_dir():
    app.mount("/api/team-images", StaticFiles(directory=str(TEAM_IMAGES_DIR)), name="team-images")


# ── Serve frontend static build in production ──────────────────────
# In production, the React build (frontend/dist) is served by FastAPI itself.
# This avoids needing a separate frontend server.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")

    # Serve other static files at root level (favicon, etc.)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve React SPA — all non-API routes return index.html."""
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
