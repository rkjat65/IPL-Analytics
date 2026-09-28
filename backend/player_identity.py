"""Canonical player identities shared by ingestion, search and profiles."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


CATALOGUE_PATH = Path(__file__).resolve().parent.parent / "data" / "player_identities.json"


@lru_cache(maxsize=1)
def catalogue() -> dict[str, Any]:
    if not CATALOGUE_PATH.exists():
        return {"identities": {}, "aliases": {}, "team_aliases": {}}
    return json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))


def identity_for(name: str, team: str | None = None) -> dict[str, Any] | None:
    raw = (name or "").strip()
    if not raw:
        return None
    data = catalogue()
    player_id = None
    if team:
        player_id = data.get("team_aliases", {}).get(f"{team.casefold()}|{raw.casefold()}")
    player_id = player_id or data.get("aliases", {}).get(raw.casefold())
    if not player_id and raw in data.get("identities", {}):
        player_id = raw
    return data.get("identities", {}).get(player_id) if player_id else None


def canonical_player_name(name: str | None, team: str | None = None) -> str | None:
    if not name:
        return name
    identity = identity_for(name, team)
    return identity["name"] if identity else name


def player_record(name: str, team: str | None = None) -> dict[str, Any]:
    identity = identity_for(name, team)
    if not identity:
        return {
            "id": None,
            "name": name,
            "source_name": name,
            "aliases": [name],
            "famous_names": [],
            "cricinfo_id": None,
        }
    return identity


def player_rows_for_tournament(tournament: str) -> list[dict[str, Any]]:
    return [
        identity
        for identity in catalogue().get("identities", {}).values()
        if tournament in identity.get("tournaments", [])
    ]
