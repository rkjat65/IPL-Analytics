"""Meta endpoints: seasons, teams, players search."""

import json
from functools import lru_cache

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..database import query, normalize_team
from ..player_resolve import canonical_player_slug
from ..tournaments import get_tournament, get_tournament_slug, public_tournaments

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


@lru_cache(maxsize=4)
def _player_prominence(slug: str) -> dict[str, int]:
    """Matches played per player, used to rank search results."""
    rows = query(
        """
        SELECT name, COUNT(DISTINCT match_id) AS matches FROM (
            SELECT batter AS name, match_id FROM deliveries
            UNION ALL SELECT bowler AS name, match_id FROM deliveries
        ) GROUP BY name
        """
    )
    return {r["name"]: r["matches"] for r in rows}


@router.get("/players")
def search_players(q: str = Query("", min_length=0)):
    rows = query("SELECT DISTINCT name, aliases FROM players")
    # Best matches first: surname/word starts with the query, then the players
    # people are most likely looking for (most matches).
    term = q.strip().casefold()
    played = _player_prominence(get_tournament_slug())

    candidates = []
    for row in rows:
        aliases = json.loads(row.get("aliases") or "[]")
        searchable = [row["name"], *aliases]
        if term and not any(term in value.casefold() for value in searchable):
            continue
        candidates.append((row["name"], searchable))

    def rank(item):
        name, searchable = item
        words = [word for value in searchable for word in value.casefold().split()]
        return (
            0 if any(value.casefold() == term for value in searchable) else 1,
            0 if any(w.startswith(term) for w in words) else 1,
            -played.get(name, 0),
            name,
        )

    return [name for name, _ in sorted(candidates, key=rank)[:50]]


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
