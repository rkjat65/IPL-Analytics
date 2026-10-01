"""Per-player career export for the rest of crickrida.com.

The international archive is a separate static build. It reads this export
(one file per tournament) to add IPL and T20 World Cup tabs to its player
pages, keyed by the Cricsheet registry id both sides share.

Conventions follow the scorebook: balls faced exclude wides only, a batter is
out when dismissed at either end (retired hurt is not out), bowlers are
charged wides and no-balls but not byes or leg byes, and an innings is any
match in which the player batted, even without facing a ball.
"""

from collections import Counter, defaultdict
from functools import lru_cache

from fastapi import APIRouter

from ..database import normalize_team, normalize_venue, query
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


MATCHES = BASE + """
    SELECT m.match_id, m.venue, m.city, CAST(m.date AS VARCHAR) AS date, e.edition, m.team1, m.team2, m.winner, m.result,
           m.toss_winner, m.toss_decision, m.event_stage
    FROM matches m JOIN editions e ON e.season = m.season
    WHERE EXISTS (SELECT 1 FROM deliveries x WHERE x.match_id = m.match_id)
    ORDER BY m.date, m.match_id
"""

INNINGS = """
    SELECT match_id, innings_number, batting_team, bowling_team, total_runs, total_wickets, total_balls
    FROM innings WHERE NOT is_super_over AND innings_number <= 2 AND total_balls > 0
"""

PLAYER_INNINGS = BASE + """
    SELECT d.match_id, d.batter AS player, any_value(d.batting_team) AS team, any_value(d.bowling_team) AS opponent,
           SUM(runs_batter) AS runs, COUNT(CASE WHEN extras_wides = 0 THEN 1 END) AS balls
    FROM d GROUP BY d.match_id, d.batter
"""

PLAYER_SPELLS = BASE + f"""
    SELECT d.match_id, d.bowler AS player, any_value(d.bowling_team) AS team, any_value(d.batting_team) AS opponent,
           COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS balls,
           SUM(runs_batter + extras_wides + extras_noballs) AS conceded,
           SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN {BOWLER_KINDS_EXCLUDED} THEN 1 ELSE 0 END) AS wickets
    FROM d GROUP BY d.match_id, d.bowler
"""


def _ids():
    return {r["name"]: r["player_id"] for r in query("SELECT name, player_id FROM players")}


def _meta(slug):
    meta = query("SELECT COUNT(*) AS matches, MIN(date) AS first, MAX(date) AS last FROM matches")[0]
    t = get_tournament()
    return {"tournament": slug, "name": t.name, "short_name": t.short_name,
            "matches": meta["matches"], "first": str(meta["first"]), "last": str(meta["last"])}


def _total(i, m):
    return {"runs": i["total_runs"], "wickets": i["total_wickets"], "balls": i["total_balls"],
            "team": normalize_team(i["batting_team"]), "opponent": normalize_team(i["bowling_team"]),
            "edition": m["edition"], "date": m["date"], "match_id": m["match_id"]}


def _extremes(totals):
    """Highest total, and lowest completed total (all out or the full 20 overs)."""
    completed = [t for t in totals if t["wickets"] >= 10 or t["balls"] >= 120]
    return (max(totals, key=lambda t: (t["runs"], -t["wickets"]), default=None),
            min(completed, key=lambda t: (t["runs"], -t["balls"]), default=None))


def _tally():
    return defaultdict(lambda: defaultdict(lambda: defaultdict(int)))


def _collect(sql, matches, group_of, store, rows, fields):
    for r in query(sql):
        m = matches.get(r["match_id"])
        if not m:
            continue
        r["edition"] = m["edition"]
        key = group_of(r)
        t = store[key][r["player"]]
        t["innings"] += 1
        for f in fields:
            t[f] += r[f]
        rows[key].append(r)


def _leaders(bat, bowl, ids, limit=5):
    """Top run-scorers and wicket-takers from {player: totals}."""
    batters = sorted(bat.items(), key=lambda kv: (-kv[1]["runs"], kv[1]["balls"]))[:limit]
    bowlers = sorted(bowl.items(), key=lambda kv: (-kv[1]["wickets"], kv[1]["conceded"]))[:limit]
    return (
        [{"player": p, "id": ids.get(p), "runs": t["runs"], "balls": t["balls"], "innings": t["innings"]} for p, t in batters],
        [{"player": p, "id": ids.get(p), "wickets": t["wickets"], "balls": t["balls"], "conceded": t["conceded"], "innings": t["innings"]}
         for p, t in bowlers if t["wickets"]],
    )


def _best(rows, ids, key):
    rows = [r for r in rows if r[key]]
    if not rows:
        return None
    if key == "runs":
        r = max(rows, key=lambda x: (x["runs"], -x["balls"]))
        figures = {"runs": r["runs"], "balls": r["balls"]}
    else:
        r = max(rows, key=lambda x: (x["wickets"], -x["conceded"]))
        figures = {"wickets": r["wickets"], "conceded": r["conceded"]}
    return {"player": r["player"], "id": ids.get(r["player"]), **figures, "team": normalize_team(r["team"]),
            "opponent": normalize_team(r["opponent"]), "edition": r["edition"], "match_id": r["match_id"]}


@lru_cache(maxsize=4)
def _venues(slug: str) -> dict:
    ids = _ids()
    matches = {m["match_id"]: m for m in query(MATCHES)}
    venue_of = {mid: normalize_venue(m["venue"]) for mid, m in matches.items()}
    out = defaultdict(lambda: {"matches": 0, "aliases": {}, "cities": Counter(), "seasons": Counter(), "bat_first_won": 0,
                               "chase_won": 0, "tied": 0, "no_result": 0, "toss_bat": 0, "toss_field": 0, "toss_winner_won": 0,
                               "decided": 0, "first": [], "second": [], "totals": []})
    for mid, m in matches.items():
        v = out[venue_of[mid]]
        v["matches"] += 1
        alias = v["aliases"].setdefault(m["venue"], {"name": m["venue"], "first": m["date"], "last": m["date"], "matches": 0})
        alias["last"] = m["date"]
        alias["matches"] += 1
        if m["city"]:
            v["cities"][m["city"]] += 1
        v["seasons"][m["edition"]] += 1
        v["toss_bat"] += int(m["toss_decision"] == "bat")
        v["toss_field"] += int(m["toss_decision"] == "field")
        if m["result"] == "win" and m["winner"]:
            v["decided"] += 1
            v["toss_winner_won"] += int(m["winner"] == m["toss_winner"])
        elif m["result"] == "tie":
            v["tied"] += 1
        else:
            v["no_result"] += 1
    first_batting = {}
    for i in query(INNINGS):
        m = matches.get(i["match_id"])
        if not m:
            continue
        v = out[venue_of[i["match_id"]]]
        v["first" if i["innings_number"] == 1 else "second"].append(i["total_runs"])
        v["totals"].append(_total(i, m))
        if i["innings_number"] == 1:
            first_batting[i["match_id"]] = i["batting_team"]
    for mid, m in matches.items():
        if m["result"] == "win" and m["winner"] and mid in first_batting:
            v = out[venue_of[mid]]
            v["bat_first_won" if m["winner"] == first_batting[mid] else "chase_won"] += 1
    bat, bowl, bat_rows, bowl_rows = _tally(), _tally(), defaultdict(list), defaultdict(list)
    by_venue = lambda r: venue_of[r["match_id"]]  # noqa: E731
    _collect(PLAYER_INNINGS, matches, by_venue, bat, bat_rows, ("runs", "balls"))
    _collect(PLAYER_SPELLS, matches, by_venue, bowl, bowl_rows, ("wickets", "balls", "conceded"))
    venues = {}
    for name, v in out.items():
        batters, bowlers = _leaders(bat[name], bowl[name], ids)
        highest, lowest = _extremes(v["totals"])
        venues[name] = {
            "name": name,
            "city": v["cities"].most_common(1)[0][0] if v["cities"] else None,
            "aliases": sorted(v["aliases"].values(), key=lambda a: a["first"]),
            "matches": v["matches"],
            "seasons": [{"edition": e, "matches": n} for e, n in sorted(v["seasons"].items())],
            "bat_first_won": v["bat_first_won"], "chase_won": v["chase_won"], "tied": v["tied"], "no_result": v["no_result"],
            "toss_bat": v["toss_bat"], "toss_field": v["toss_field"], "toss_winner_won": v["toss_winner_won"], "decided": v["decided"],
            "avg_first": round(sum(v["first"]) / len(v["first"]), 1) if v["first"] else None,
            "avg_second": round(sum(v["second"]) / len(v["second"]), 1) if v["second"] else None,
            "first_innings": len(v["first"]),
            "highest_total": highest, "lowest_total": lowest,
            "top_batters": batters, "top_bowlers": bowlers,
            "best_innings": _best(bat_rows[name], ids, "runs"), "best_bowling": _best(bowl_rows[name], ids, "wickets"),
        }
    return {"meta": _meta(slug), "venues": venues}


STAGE_RANK = {"Final": 3, "Semi Final": 2}


@lru_cache(maxsize=4)
def _teams(slug: str) -> dict:
    ids = _ids()
    matches = {m["match_id"]: m for m in query(MATCHES)}
    out = defaultdict(lambda: {"matches": 0, "won": 0, "lost": 0, "tied": 0, "no_result": 0, "editions": {}, "opponents": {}, "totals": []})
    for m in matches.values():
        winner = normalize_team(m["winner"]) if m["winner"] and m["result"] == "win" else None
        for raw, other in ((m["team1"], m["team2"]), (m["team2"], m["team1"])):
            team, opp = normalize_team(raw), normalize_team(other)
            t = out[team]
            e = t["editions"].setdefault(m["edition"], {"edition": m["edition"], "played": 0, "won": 0, "lost": 0, "stage": 1, "finish": None})
            o = t["opponents"].setdefault(opp, {"team": opp, "played": 0, "won": 0, "lost": 0})
            won, lost = winner == team, bool(winner) and winner != team
            t["matches"] += 1
            t["won"] += int(won)
            t["lost"] += int(lost)
            t["tied"] += int(m["result"] == "tie")
            t["no_result"] += int(m["result"] != "tie" and not winner)
            for row in (e, o):
                row["played"] += 1
                row["won"] += int(won)
                row["lost"] += int(lost)
            e["stage"] = max(e["stage"], STAGE_RANK.get(m["event_stage"] or "", 1))
            if m["event_stage"] == "Final" and m["winner"]:
                e["finish"] = "Champions" if normalize_team(m["winner"]) == team else "Runners-up"
    for i in query(INNINGS):
        m = matches.get(i["match_id"])
        if m:
            out[normalize_team(i["batting_team"])]["totals"].append(_total(i, m))
    bat, bowl, bat_rows, bowl_rows = _tally(), _tally(), defaultdict(list), defaultdict(list)
    by_team = lambda r: normalize_team(r["team"])  # noqa: E731
    _collect(PLAYER_INNINGS, matches, by_team, bat, bat_rows, ("runs", "balls"))
    _collect(PLAYER_SPELLS, matches, by_team, bowl, bowl_rows, ("wickets", "balls", "conceded"))
    teams = {}
    for name, t in out.items():
        batters, bowlers = _leaders(bat[name], bowl[name], ids)
        highest, lowest = _extremes(t["totals"])
        editions = [{"edition": e["edition"], "played": e["played"], "won": e["won"], "lost": e["lost"],
                     "finish": e["finish"] or ("Semi-finals" if e["stage"] == 2 else None)}
                    for e in sorted(t["editions"].values(), key=lambda x: x["edition"])]
        teams[name] = {
            "name": name, "matches": t["matches"], "won": t["won"], "lost": t["lost"], "tied": t["tied"], "no_result": t["no_result"],
            "titles": [e["edition"] for e in editions if e["finish"] == "Champions"],
            "editions": editions,
            "opponents": sorted(t["opponents"].values(), key=lambda o: (-o["played"], o["team"])),
            "highest_total": highest, "lowest_total": lowest,
            "top_batters": batters, "top_bowlers": bowlers,
            "best_innings": _best(bat_rows[name], ids, "runs"), "best_bowling": _best(bowl_rows[name], ids, "wickets"),
        }
    return {"meta": _meta(slug), "teams": teams}


@router.get("/venues")
def venue_export():
    """Every ground's summary for the active tournament: results, totals, leaders."""
    return _venues(get_tournament_slug())


@router.get("/teams")
def team_export():
    """Every team's summary for the active tournament: results by edition, opponents, leaders."""
    return _teams(get_tournament_slug())


@router.get("/careers")
def career_export():
    """Every player's career and season-by-season figures for the active tournament."""
    return _careers(get_tournament_slug())
