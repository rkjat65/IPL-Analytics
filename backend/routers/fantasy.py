"""Fantasy helper: projected fantasy points for two teams' likely players.

Points follow the common T20 fantasy scheme (per match):
  batting  1 per run, +1 per four, +2 per six, +8 for 50, +16 for 100,
           -2 for a duck (dismissed for 0);
  bowling  25 per wicket (excluding run outs), +8 per LBW/bowled wicket,
           +4 / +8 / +16 bonus for 3 / 4 / 5 wickets;
  fielding 8 per catch, 12 per stumping, 6 per run out involvement.
A player's projection blends recent form (last 10 matches) with their record
at the chosen venue when they have played there at least twice.
"""

from functools import lru_cache

from fastapi import APIRouter, HTTPException, Query

from ..database import normalize_team, query, team_variants
from ..tournaments import get_tournament_slug
from .venues import _venue_variants

router = APIRouter(prefix="/api/fantasy", tags=["fantasy"])

RECENT_MATCHES = 10
VENUE_WEIGHT = 0.4

# Per-player, per-match fantasy points with the team they played for.
_POINTS_SQL = """
WITH legal AS (
    SELECT d.*, i.batting_team, i.bowling_team
    FROM deliveries d
    JOIN innings i ON i.match_id = d.match_id AND i.innings_number = d.innings_number
    WHERE NOT d.is_super_over
),
bat AS (
    SELECT match_id, batter AS player, batting_team AS team,
           SUM(runs_batter) AS runs,
           SUM(CASE WHEN runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
           SUM(CASE WHEN runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
           MAX(CASE WHEN is_wicket AND player_dismissed = batter THEN 1 ELSE 0 END) AS out
    FROM legal GROUP BY match_id, batter, batting_team
),
bat_pts AS (
    SELECT match_id, player, team,
           runs + fours + 2 * sixes
           + CASE WHEN runs >= 100 THEN 16 WHEN runs >= 50 THEN 8 ELSE 0 END
           - CASE WHEN runs = 0 AND out = 1 THEN 2 ELSE 0 END AS pts,
           runs, 0 AS wkts
    FROM bat
),
bowl AS (
    SELECT match_id, bowler AS player, bowling_team AS team,
           SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN
               ('run out', 'retired hurt', 'retired out', 'obstructing the field') THEN 1 ELSE 0 END) AS wkts,
           SUM(CASE WHEN is_wicket AND dismissal_kind IN ('lbw', 'bowled') THEN 1 ELSE 0 END) AS lbw_bowled
    FROM legal GROUP BY match_id, bowler, bowling_team
),
bowl_pts AS (
    SELECT match_id, player, team,
           25 * wkts + 8 * lbw_bowled
           + CASE WHEN wkts >= 5 THEN 16 WHEN wkts >= 4 THEN 8 WHEN wkts >= 3 THEN 4 ELSE 0 END AS pts,
           0 AS runs, wkts
    FROM bowl
),
field_pts AS (
    SELECT match_id, fielder1 AS player, bowling_team AS team,
           SUM(CASE WHEN dismissal_kind = 'caught' THEN 8
                    WHEN dismissal_kind = 'stumped' THEN 12
                    WHEN dismissal_kind = 'run out' THEN 6 ELSE 0 END) AS pts,
           0 AS runs, 0 AS wkts
    FROM legal WHERE is_wicket AND fielder1 IS NOT NULL
    GROUP BY match_id, fielder1, bowling_team
)
SELECT p.player, p.team, p.match_id, m.date, m.season, m.venue,
       SUM(p.pts) AS pts, SUM(p.runs) AS runs, SUM(p.wkts) AS wkts
FROM (SELECT * FROM bat_pts UNION ALL SELECT * FROM bowl_pts UNION ALL SELECT * FROM field_pts) p
JOIN matches m ON m.match_id = p.match_id
GROUP BY p.player, p.team, p.match_id, m.date, m.season, m.venue
"""


@lru_cache(maxsize=4)
def _points(slug: str) -> list[dict]:
    rows = query(_POINTS_SQL)
    for r in rows:
        r["team"] = normalize_team(r["team"])
    return rows


def _squad(rows: list[dict], team: str) -> set[str]:
    """Players who turned out for the team in its most recent season."""
    names = set(team_variants(team)) | {normalize_team(team)}
    team_rows = [r for r in rows if r["team"] in names]
    if not team_rows:
        return set()
    latest = max(r["season"] for r in team_rows)
    return {r["player"] for r in team_rows if r["season"] == latest}


def _role(runs: float, wkts: float) -> str:
    if wkts >= 0.8 and runs >= 12:
        return "All-rounder"
    return "Bowler" if wkts >= 0.6 else "Batter"


@router.get("/picks")
def fantasy_picks(
    team1: str = Query(..., min_length=2),
    team2: str = Query(..., min_length=2),
    venue: str | None = None,
):
    rows = _points(get_tournament_slug())
    squads = {team1: _squad(rows, team1), team2: _squad(rows, team2)}
    if not squads[team1] or not squads[team2]:
        raise HTTPException(status_code=404, detail="Unknown team")

    venue_names = set(_venue_variants(venue)) if venue else set()
    by_player: dict[str, list[dict]] = {}
    for r in rows:
        by_player.setdefault(r["player"], []).append(r)

    players = []
    for team, squad in squads.items():
        for name in squad:
            history = sorted(by_player.get(name, []), key=lambda r: (str(r["date"]), r["match_id"]), reverse=True)
            recent = history[:RECENT_MATCHES]
            if not recent:
                continue
            recent_avg = sum(r["pts"] for r in recent) / len(recent)
            at_venue = [r for r in history if r["venue"] in venue_names] if venue_names else []
            venue_avg = sum(r["pts"] for r in at_venue) / len(at_venue) if at_venue else None
            projected = recent_avg
            if venue_avg is not None and len(at_venue) >= 2:
                projected = (1 - VENUE_WEIGHT) * recent_avg + VENUE_WEIGHT * venue_avg
            players.append({
                "player": name,
                "team": team,
                "role": _role(sum(r["runs"] for r in recent) / len(recent),
                              sum(r["wkts"] for r in recent) / len(recent)),
                "projected": round(projected, 1),
                "recent_avg": round(recent_avg, 1),
                "recent_matches": len(recent),
                "recent_runs": sum(r["runs"] for r in recent),
                "recent_wickets": sum(r["wkts"] for r in recent),
                "venue_avg": round(venue_avg, 1) if venue_avg is not None else None,
                "venue_matches": len(at_venue),
                "last_played": str(recent[0]["date"]),
            })

    players.sort(key=lambda p: -p["projected"])
    xi = _pick_xi(players)
    return {
        "team1": team1,
        "team2": team2,
        "venue": venue,
        "players": players,
        "xi": [p["player"] for p in xi],
        "captain": xi[0]["player"] if xi else None,
        "vice_captain": xi[1]["player"] if len(xi) > 1 else None,
    }


def _pick_xi(players: list[dict]) -> list[dict]:
    """Best 11 by projection with at most 7 from one side and 3+ bowling options."""
    xi: list[dict] = []
    per_team: dict[str, int] = {}
    for p in players:
        if len(xi) == 11:
            break
        if per_team.get(p["team"], 0) >= 7:
            continue
        xi.append(p)
        per_team[p["team"]] = per_team.get(p["team"], 0) + 1
    bowlers = [p for p in xi if p["role"] in ("Bowler", "All-rounder")]
    if len(bowlers) < 3:
        extra = [p for p in players if p not in xi and p["role"] in ("Bowler", "All-rounder")]
        for p in extra[: 3 - len(bowlers)]:
            batters = [q for q in xi if q["role"] == "Batter"]
            if batters:
                xi.remove(batters[-1])
                xi.append(p)
    return sorted(xi, key=lambda p: -p["projected"])
