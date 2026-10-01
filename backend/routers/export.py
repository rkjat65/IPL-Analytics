"""Per-player career export for the rest of crickrida.com.

The international archive is a separate static build. It reads this export
(one file per tournament) to add IPL and T20 World Cup tabs to its player
pages, keyed by the Cricsheet registry id both sides share.

Conventions follow the scorebook: balls faced exclude wides only, a batter is
out when dismissed at either end (retired hurt is not out), bowlers are
charged wides and no-balls but not byes or leg byes, and an innings is any
match in which the player batted, even without facing a ball.
"""

from functools import lru_cache

from fastapi import APIRouter

from ..database import normalize_team, query
from ..tournaments import get_tournament, get_tournament_slug

router = APIRouter(prefix="/api/export", tags=["export"])

NOT_OUT_KINDS = "('retired hurt', 'retired not out')"
BOWLER_KINDS_EXCLUDED = "('run out', 'retired hurt', 'retired out', 'obstructing the field', 'retired not out')"

BASE = """
    WITH d AS (
        SELECT d.*, i.batting_team, i.bowling_team, m.season, m.date
        FROM deliveries d
        JOIN innings i ON i.match_id = d.match_id AND i.innings_number = d.innings_number AND i.is_super_over = d.is_super_over
        JOIN matches m ON m.match_id = d.match_id
        WHERE NOT d.is_super_over
    ),
    editions AS (SELECT season, CAST(EXTRACT(year FROM MIN(date)) AS VARCHAR) AS edition FROM matches GROUP BY season)
"""

BATTING = BASE + f"""
    , appear AS (
        SELECT batter AS player, match_id, innings_number, batting_team AS team, season FROM d
        UNION SELECT non_striker, match_id, innings_number, batting_team, season FROM d
    ),
    faced AS (
        SELECT batter AS player, match_id, innings_number,
               SUM(runs_batter) AS runs,
               COUNT(CASE WHEN extras_wides = 0 THEN 1 END) AS balls,
               SUM(CASE WHEN runs_batter = 4 AND extras_wides = 0 THEN 1 ELSE 0 END) AS fours,
               SUM(CASE WHEN runs_batter = 6 AND extras_wides = 0 THEN 1 ELSE 0 END) AS sixes
        FROM d GROUP BY batter, match_id, innings_number
    ),
    outs AS (
        SELECT player_dismissed AS player, match_id, innings_number, 1 AS out
        FROM d WHERE is_wicket AND player_dismissed IS NOT NULL AND COALESCE(dismissal_kind, '') NOT IN {NOT_OUT_KINDS}
        GROUP BY player_dismissed, match_id, innings_number
    )
    SELECT a.player, a.match_id, a.team, e.edition,
           COALESCE(f.runs, 0) AS runs, COALESCE(f.balls, 0) AS balls,
           COALESCE(f.fours, 0) AS fours, COALESCE(f.sixes, 0) AS sixes, COALESCE(o.out, 0) AS out
    FROM appear a
    JOIN editions e ON e.season = a.season
    LEFT JOIN faced f USING (player, match_id, innings_number)
    LEFT JOIN outs o USING (player, match_id, innings_number)
"""

BOWLING = BASE + f"""
    SELECT bowler AS player, match_id, any_value(bowling_team) AS team, any_value(e.edition) AS edition,
           COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS balls,
           SUM(runs_batter + extras_wides + extras_noballs) AS conceded,
           SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN {BOWLER_KINDS_EXCLUDED} THEN 1 ELSE 0 END) AS wickets,
           SUM(CASE WHEN extras_wides = 0 AND extras_noballs = 0 AND runs_batter = 0 AND runs_extras = 0 THEN 1 ELSE 0 END) AS dots
    FROM d JOIN editions e ON e.season = d.season
    GROUP BY bowler, match_id
"""

FIELDING = BASE + """
    SELECT CASE WHEN dismissal_kind = 'caught and bowled' THEN bowler ELSE fielder1 END AS player, match_id,
           any_value(e.edition) AS edition,
           SUM(CASE WHEN dismissal_kind IN ('caught', 'caught and bowled') THEN 1 ELSE 0 END) AS catches,
           SUM(CASE WHEN dismissal_kind = 'stumped' THEN 1 ELSE 0 END) AS stumpings
    FROM d JOIN editions e ON e.season = d.season
    WHERE is_wicket AND dismissal_kind IN ('caught', 'caught and bowled', 'stumped')
    GROUP BY 1, match_id
"""

LINEUPS = BASE + """
    SELECT mp.player, mp.match_id, mp.team, e.edition
    FROM match_players mp JOIN matches m ON m.match_id = mp.match_id JOIN editions e ON e.season = m.season
"""

AWARDS = """
    SELECT m.player_of_match AS player, CAST(EXTRACT(year FROM MIN(m.date) OVER (PARTITION BY m.season)) AS VARCHAR) AS edition
    FROM matches m WHERE m.player_of_match IS NOT NULL AND m.player_of_match <> ''
"""


def _blank():
    return {"matches": set(), "innings": 0, "runs": 0, "balls": 0, "outs": 0, "hs": 0, "hs_not_out": False,
            "hundreds": 0, "fifties": 0, "ducks": 0, "fours": 0, "sixes": 0,
            "bowl_innings": 0, "bowl_balls": 0, "conceded": 0, "wickets": 0, "dots": 0,
            "best": None, "four_w": 0, "five_w": 0, "catches": 0, "stumpings": 0, "awards": 0, "teams": {}}


def _has_lineups() -> bool:
    try:
        return bool(query("SELECT COUNT(*) AS n FROM match_players")[0]["n"])
    except Exception:  # noqa: BLE001 - databases built before line-ups were stored
        return False


def _add_bat(t, r, count_match=True):
    if count_match:
        t["matches"].add(r["match_id"])
    t["innings"] += 1
    runs, out = r["runs"], bool(r["out"])
    t["runs"] += runs
    t["balls"] += r["balls"]
    t["outs"] += int(out)
    t["fours"] += r["fours"]
    t["sixes"] += r["sixes"]
    if runs > t["hs"] or (runs == t["hs"] and not out):
        t["hs"], t["hs_not_out"] = runs, not out
    t["hundreds"] += int(runs >= 100)
    t["fifties"] += int(50 <= runs < 100)
    t["ducks"] += int(runs == 0 and out)


def _add_bowl(t, r, count_match=True):
    if count_match:
        t["matches"].add(r["match_id"])
    t["bowl_innings"] += 1
    t["bowl_balls"] += r["balls"]
    t["conceded"] += r["conceded"]
    t["wickets"] += r["wickets"]
    t["dots"] += r["dots"]
    best = (r["wickets"], -r["conceded"])
    if t["best"] is None or best > t["best"]:
        t["best"] = best
    t["four_w"] += int(r["wickets"] == 4)
    t["five_w"] += int(r["wickets"] >= 5)


def _finish(t):
    out = {k: v for k, v in t.items() if k not in ("matches", "best", "teams")}
    out["matches"] = len(t["matches"])
    out["best"] = f"{t['best'][0]}/{-t['best'][1]}" if t["best"] else None
    return out


@lru_cache(maxsize=4)
def _careers(slug: str) -> dict:
    ids = {r["name"]: (r["player_id"], r["cricinfo_id"]) for r in query("SELECT name, player_id, cricinfo_id FROM players")}
    careers, seasons = {}, {}

    def slot(name, edition):
        careers.setdefault(name, _blank())
        seasons.setdefault(name, {}).setdefault(edition, _blank())
        return careers[name], seasons[name][edition]

    def team_seen(name, team, edition, match_id):
        team = normalize_team(team)
        span = careers[name]["teams"].setdefault(team, {"first": edition, "last": edition, "matches": set()})
        span["first"], span["last"] = min(span["first"], edition), max(span["last"], edition)
        span["matches"].add(match_id)
        seasons[name][edition]["teams"][team] = 1

    # A match counts when the player was in the line-up, so players who only
    # fielded are included. Older databases fall back to batting or bowling.
    lineups = _has_lineups()
    if lineups:
        for r in query(LINEUPS):
            whole, season = slot(r["player"], r["edition"])
            whole["matches"].add(r["match_id"])
            season["matches"].add(r["match_id"])
            team_seen(r["player"], r["team"], r["edition"], r["match_id"])
    for r in query(BATTING):
        whole, season = slot(r["player"], r["edition"])
        _add_bat(whole, r, not lineups)
        _add_bat(season, r, not lineups)
        if not lineups:
            team_seen(r["player"], r["team"], r["edition"], r["match_id"])
    for r in query(BOWLING):
        whole, season = slot(r["player"], r["edition"])
        _add_bowl(whole, r, not lineups)
        _add_bowl(season, r, not lineups)
        if not lineups:
            team_seen(r["player"], r["team"], r["edition"], r["match_id"])
    for r in query(FIELDING):
        if not r["player"] or r["player"] not in careers:
            continue
        whole, season = slot(r["player"], r["edition"])
        for t in (whole, season):
            t["catches"] += r["catches"]
            t["stumpings"] += r["stumpings"]
    for r in query(AWARDS):
        if r["player"] in careers:
            careers[r["player"]]["awards"] += 1
            seasons[r["player"]].setdefault(r["edition"], _blank())["awards"] += 1

    players = {}
    for name, total in careers.items():
        pid, cricinfo = ids.get(name, (None, None))
        if not pid:
            continue
        teams = sorted(({"team": team, "first": s["first"], "last": s["last"], "matches": len(s["matches"])}
                        for team, s in total["teams"].items()), key=lambda x: (x["first"], x["team"]))
        players[pid] = {
            "name": name,
            "cricinfo_id": cricinfo,
            "career": _finish(total),
            "teams": teams,
            "seasons": [{"edition": edition, "teams": sorted(s["teams"]), **_finish(s)}
                        for edition, s in sorted(seasons[name].items())],
        }
    meta = query("SELECT COUNT(*) AS matches, MIN(date) AS first, MAX(date) AS last FROM matches")[0]
    t = get_tournament()
    return {
        "meta": {"tournament": slug, "name": t.name, "short_name": t.short_name,
                 "matches": meta["matches"], "first": str(meta["first"]), "last": str(meta["last"]),
                 "players": len(players),
                 "conventions": "Balls faced exclude wides; dismissals count at either end; retired hurt is not out; "
                                "bowlers are charged wides and no-balls; super overs excluded."},
        "players": players,
    }


@router.get("/careers")
def career_export():
    """Every player's career and season-by-season figures for the active tournament."""
    return _careers(get_tournament_slug())
