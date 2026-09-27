"""Tournament registry and request-local tournament selection."""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Tournament:
    slug: str
    name: str
    short_name: str
    competition_label: str
    team_label: str
    db_path: str


_repo_root = Path(__file__).resolve().parent.parent

TOURNAMENTS: dict[str, Tournament] = {
    "ipl": Tournament(
        slug="ipl",
        name="Indian Premier League",
        short_name="IPL",
        competition_label="Season",
        team_label="Franchise",
        db_path=os.path.abspath(
            os.environ.get("DUCKDB_PATH", str(_repo_root / "ipl.duckdb"))
        ),
    ),
    "t20wc": Tournament(
        slug="t20wc",
        name="ICC Men's T20 World Cup",
        short_name="T20 World Cup",
        competition_label="Edition",
        team_label="Team",
        db_path=os.path.abspath(
            os.environ.get(
                "T20WC_DUCKDB_PATH", str(_repo_root / "t20_world_cup.duckdb")
            )
        ),
    ),
}

_current_tournament: ContextVar[str] = ContextVar(
    "current_tournament", default="ipl"
)


def normalize_tournament(value: str | None) -> str:
    slug = (value or "ipl").strip().lower()
    return slug if slug in TOURNAMENTS else "ipl"


def get_tournament_slug() -> str:
    return _current_tournament.get()


def get_tournament() -> Tournament:
    return TOURNAMENTS[get_tournament_slug()]


def set_tournament(value: str | None) -> Token:
    return _current_tournament.set(normalize_tournament(value))


def reset_tournament(token: Token) -> None:
    _current_tournament.reset(token)


def public_tournaments() -> list[dict[str, str]]:
    return [
        {
            "slug": item.slug,
            "name": item.name,
            "short_name": item.short_name,
            "competition_label": item.competition_label,
            "team_label": item.team_label,
        }
        for item in TOURNAMENTS.values()
    ]
