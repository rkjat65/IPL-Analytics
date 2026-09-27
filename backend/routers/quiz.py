"""'Guess the player' quiz: career clues for a random player plus 4 choices."""

import random
from functools import lru_cache

from fastapi import APIRouter, Query

from ..database import normalize_team, query
from ..tournaments import get_tournament_slug

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

MIN_MATCHES = {"easy": 60, "medium": 30, "hard": 12}

_CAREERS_SQL = """
WITH d AS (
    SELECT d.*, i.batting_team, i.bowling_team, m.season
    FROM deliveries d
    JOIN innings i ON i.match_id = d.match_id AND i.innings_number = d.innings_number
    JOIN matches m ON m.match_id = d.match_id
    WHERE NOT d.is_super_over
),
bat_inn AS (
    SELECT batter AS player, match_id, SUM(runs_batter) AS runs,
           SUM(CASE WHEN extras_wides = 0 THEN 1 ELSE 0 END) AS balls,
           MAX(CASE WHEN is_wicket AND player_dismissed = batter THEN 1 ELSE 0 END) AS out
    FROM d GROUP BY batter, match_id
),
bat AS (
    SELECT player, SUM(runs) AS runs, SUM(balls) AS balls, SUM(out) AS outs,
           MAX(runs) AS hs, SUM(CASE WHEN runs >= 100 THEN 1 ELSE 0 END) AS hundreds,
           SUM(CASE WHEN runs >= 50 AND runs < 100 THEN 1 ELSE 0 END) AS fifties
    FROM bat_inn GROUP BY player
),
bowl AS (
    SELECT bowler AS player,
           SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN
               ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
           SUM(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 ELSE 0 END) AS balls_bowled,
           SUM(runs_batter + extras_wides + extras_noballs) AS conceded
    FROM d GROUP BY bowler
),
appear AS (
    SELECT player, team, season, match_id FROM (
        SELECT batter AS player, batting_team AS team, season, match_id FROM d
        UNION ALL SELECT bowler, bowling_team, season, match_id FROM d
    )
),
span AS (
    SELECT player, COUNT(DISTINCT match_id) AS matches, MIN(season) AS first_season,
           MAX(season) AS last_season, LIST(DISTINCT team) AS teams
    FROM appear GROUP BY player
)
SELECT s.*, COALESCE(b.runs, 0) AS runs, COALESCE(b.balls, 0) AS balls, COALESCE(b.outs, 0) AS outs,
       COALESCE(b.hs, 0) AS hs, COALESCE(b.hundreds, 0) AS hundreds, COALESCE(b.fifties, 0) AS fifties,
       COALESCE(w.wickets, 0) AS wickets, COALESCE(w.balls_bowled, 0) AS balls_bowled,
       COALESCE(w.conceded, 0) AS conceded
FROM span s LEFT JOIN bat b USING (player) LEFT JOIN bowl w USING (player)
"""


def _role(c: dict) -> str:
    bats = c["runs"] >= 12 * c["matches"]
    bowls = c["wickets"] >= 0.35 * c["matches"]
    if bats and bowls:
        return "All-rounder"
    return "Bowler" if bowls or c["runs"] < 6 * c["matches"] else "Batter"


@lru_cache(maxsize=4)
def _careers(slug: str) -> list[dict]:
    rows = query(_CAREERS_SQL)
    for r in rows:
        r["teams"] = sorted({normalize_team(t) for t in (r["teams"] or []) if t})
        r["role"] = _role(r)
    return rows


def _clues(c: dict) -> list[dict]:
    clues = [
        {"label": "Role", "value": c["role"]},
        {"label": "Seasons", "value": c["first_season"] if c["first_season"] == c["last_season"]
         else f"{c['first_season']} – {c['last_season']}"},
        {"label": "Matches", "value": c["matches"]},
    ]
    if c["runs"] >= 100 or c["role"] != "Bowler":
        avg = round(c["runs"] / c["outs"], 2) if c["outs"] else c["runs"]
        sr = round(100 * c["runs"] / c["balls"], 2) if c["balls"] else 0
        clues += [
            {"label": "Runs", "value": c["runs"]},
            {"label": "Average", "value": avg},
            {"label": "Strike rate", "value": sr},
            {"label": "Highest score", "value": c["hs"]},
            {"label": "100s / 50s", "value": f"{c['hundreds']} / {c['fifties']}"},
        ]
    if c["wickets"] >= 5:
        econ = round(6 * c["conceded"] / c["balls_bowled"], 2) if c["balls_bowled"] else 0
        clues += [
            {"label": "Wickets", "value": c["wickets"]},
            {"label": "Economy", "value": econ},
        ]
    clues.append({"label": "Teams", "value": ", ".join(c["teams"]), "hint": True})
    return clues


@router.get("/player")
def quiz_player(
    level: str = Query("medium", pattern="^(easy|medium|hard)$"),
    seed: int | None = None,
):
    rng = random.Random(seed)
    pool = [c for c in _careers(get_tournament_slug()) if c["matches"] >= MIN_MATCHES[level]]
    answer = rng.choice(pool)
    # Distractors: same role, overlapping era, so the answer isn't obvious
    similar = [c for c in pool if c["player"] != answer["player"] and c["role"] == answer["role"]
               and c["first_season"] <= answer["last_season"] and c["last_season"] >= answer["first_season"]]
    if len(similar) < 3:
        similar = [c for c in pool if c["player"] != answer["player"]]
    options = [c["player"] for c in rng.sample(similar, 3)] + [answer["player"]]
    rng.shuffle(options)
    return {
        "level": level,
        "clues": _clues(answer),
        "options": options,
        "answer": answer["player"],
    }
