"""Meta endpoints: seasons, teams, players search."""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..database import query, normalize_team
from ..player_resolve import canonical_player_slug
from ..tournaments import get_tournament, public_tournaments

router = APIRouter(prefix="/api/meta", tags=["meta"])


class BatchPlayerLookupBody(BaseModel):
    names: list[str] = Field(default_factory=list, max_length=200)


@router.get("/tournaments")
def list_tournaments():
    return public_tournaments()


@router.get("/tournament")
def active_tournament():
    item = get_tournament()
    return {
        "slug": item.slug,
        "name": item.name,
        "short_name": item.short_name,
        "competition_label": item.competition_label,
        "team_label": item.team_label,
    }


@router.get("/seasons")
def list_seasons():
    rows = query("SELECT DISTINCT season FROM matches ORDER BY season")
    return [r["season"] for r in rows]


@router.get("/teams")
def list_teams():
    rows = query("""
        SELECT DISTINCT team FROM (
            SELECT team1 AS team FROM matches
            UNION
            SELECT team2 AS team FROM matches
        ) t
        ORDER BY team
    """)
    return sorted(set(normalize_team(r["team"]) for r in rows))


@router.get("/players")
def search_players(q: str = Query("", min_length=0)):
    if not q:
        rows = query("SELECT DISTINCT name FROM players ORDER BY name LIMIT 50")
        return [r["name"] for r in rows]

    rows = query(
        "SELECT DISTINCT name FROM players WHERE LOWER(name) LIKE '%' || LOWER(?) || '%' ORDER BY name LIMIT 50",
        [q],
    )
    return [r["name"] for r in rows]


@router.post("/players/batch-lookup")
def batch_lookup_players(body: BatchPlayerLookupBody):
    """Map display names (e.g. from live feed) to canonical profile slugs when IPL data exists."""
    out: dict[str, dict] = {}
    seen: set[str] = set()
    for raw in body.names:
        n = (raw or "").strip()
        if not n or n in seen:
            continue
        seen.add(n)
        slug = canonical_player_slug(n)
        out[n] = {"hasProfile": slug is not None, "slug": slug}
    return out
