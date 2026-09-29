"""Records hub: innings, bowling, team, partnership and special records straight from ball-by-ball data.

Every list accepts the same filters (season, team, venue) so a record can be read for one edition, one side or
one ground. Balls faced exclude wides and no-balls, matching the rest of the API; runs conceded charge the
bowler for wides and no-balls but not byes or leg byes.
"""

from fastapi import APIRouter, HTTPException, Query

from ..database import VENUE_NORM_SQL, normalize_team, query, team_variants

router = APIRouter(prefix="/api/records", tags=["records"])

LEGAL = "d.extras_wides = 0 AND d.extras_noballs = 0"
BOWLER_WICKET = (
    "d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field')"
)
BOUNDARY = f"{LEGAL} AND d.runs_batter"

INNINGS_KINDS = (
    "highest_scores", "most_sixes", "fastest_fifties", "fastest_hundreds",
    "best_bowling", "best_economy", "most_expensive", "most_conceded",
)
TEAM_KINDS = ("highest_totals", "lowest_totals", "highest_chases", "biggest_wins_runs", "biggest_wins_wickets", "narrowest_wins")
SPECIAL_KINDS = ("hat_tricks", "most_awards", "most_ducks", "super_overs", "ties")


def _filters(season: str | None, team: str | None, venue: str | None, team_col: str) -> tuple[str, list]:
    sql, params = "", []
    if season:
        parts = [s.strip() for s in season.split(",") if s.strip()]
        if parts:
            sql += f" AND m.season IN ({', '.join(['?'] * len(parts))})"
            params.extend(parts)
    if team:
        variants = team_variants(team)
        sql += f" AND {team_col} IN ({', '.join(['?'] * len(variants))})"
        params.extend(variants)
    if venue:
        sql += f" AND ({VENUE_NORM_SQL}) = ?"
        params.append(venue)
    return sql, params


def _base(filters: str) -> str:
    """Deliveries joined to their innings and match, with historical team and venue names normalised later."""
    return f"""
        WITH d AS (
            SELECT d.*, i.batting_team, i.bowling_team, m.season, m.date, ({VENUE_NORM_SQL}) AS venue, m.winner
            FROM deliveries d
            JOIN innings i ON i.match_id = d.match_id AND i.innings_number = d.innings_number AND i.is_super_over = d.is_super_over
            JOIN matches m ON m.match_id = d.match_id
            WHERE NOT d.is_super_over {filters}
        )
    """


def _rows(rows: list[dict]) -> list[dict]:
    for r in rows:
        for key in ("team", "opponent"):
            if r.get(key):
                r[key] = normalize_team(r[key])
        if r.get("date") is not None:
            r["date"] = str(r["date"])
        if "balls" in r and r.get("balls") is not None and "overs" not in r and "conceded" in r:
            r["overs"] = f"{r['balls'] // 6}.{r['balls'] % 6}"
    return rows


BATTING_INNINGS = """
    SELECT d.batter AS player, d.batting_team AS team, d.bowling_team AS opponent, d.match_id, d.season, d.date, d.venue,
           SUM(d.runs_batter) AS runs,
           COUNT(CASE WHEN {legal} THEN 1 END) AS balls,
           SUM(CASE WHEN {legal} AND d.runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
           SUM(CASE WHEN {legal} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
           MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS out
    FROM d
    GROUP BY d.batter, d.batting_team, d.bowling_team, d.match_id, d.season, d.date, d.venue
"""

BOWLING_INNINGS = """
    SELECT d.bowler AS player, d.bowling_team AS team, d.batting_team AS opponent, d.match_id, d.season, d.date, d.venue,
           SUM(CASE WHEN {wicket} THEN 1 ELSE 0 END) AS wickets,
           SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS conceded,
           COUNT(CASE WHEN {legal} THEN 1 END) AS balls,
           SUM(CASE WHEN {legal} AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
           SUM(CASE WHEN {legal} AND d.runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
           SUM(CASE WHEN {legal} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes
    FROM d
    GROUP BY d.bowler, d.bowling_team, d.batting_team, d.match_id, d.season, d.date, d.venue
"""


def _fastest(target: int, filters: str, params: list, limit: int) -> list[dict]:
    rows = query(_base(filters) + f"""
        , prog AS (
            SELECT d.batter, d.match_id, d.innings_number, d.batting_team, d.bowling_team, d.season, d.date, d.venue,
                   SUM(d.runs_batter) OVER w AS cum_runs,
                   SUM(CASE WHEN {LEGAL} THEN 1 ELSE 0 END) OVER w AS balls
            FROM d
            WINDOW w AS (PARTITION BY d.match_id, d.innings_number, d.batter ORDER BY d.over_number, d.ball_number, d.delivery_id ROWS UNBOUNDED PRECEDING)
        ),
        hits AS (
            SELECT batter, match_id, batting_team, bowling_team, season, date, venue, MIN(balls) AS balls
            FROM prog WHERE cum_runs >= ?
            GROUP BY batter, match_id, batting_team, bowling_team, season, date, venue
        ),
        final AS (
            SELECT d.batter, d.match_id, SUM(d.runs_batter) AS runs,
                   SUM(CASE WHEN {LEGAL} AND d.runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN {LEGAL} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
                   COUNT(CASE WHEN {LEGAL} THEN 1 END) AS balls_faced
            FROM d GROUP BY d.batter, d.match_id
        )
        SELECT h.batter AS player, h.batting_team AS team, h.bowling_team AS opponent, h.match_id, h.season, h.date, h.venue,
               h.balls, f.runs, f.balls_faced, f.fours, f.sixes
        FROM hits h JOIN final f ON f.batter = h.batter AND f.match_id = h.match_id
        ORDER BY h.balls ASC, f.runs DESC, h.date DESC
        LIMIT ?
    """, params + [target, limit])
    return _rows(rows)


@router.get("/innings")
def innings_records(
    kind: str = Query("highest_scores", pattern="^(" + "|".join(INNINGS_KINDS) + ")$"),
    season: str | None = None,
    team: str | None = None,
    venue: str | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    """One row per player innings, ranked by the chosen record."""
    bowling = kind in ("best_bowling", "best_economy", "most_expensive", "most_conceded")
    filters, params = _filters(season, team, venue, "i.bowling_team" if bowling else "i.batting_team")
    if kind == "fastest_fifties":
        return _fastest(50, filters, params, limit)
    if kind == "fastest_hundreds":
        return _fastest(100, filters, params, limit)
    if kind == "most_expensive":
        rows = query(_base(filters) + f"""
            SELECT d.bowler AS player, d.bowling_team AS team, d.batting_team AS opponent, d.match_id, d.season, d.date, d.venue,
                   d.over_number + 1 AS over,
                   SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS conceded,
                   SUM(d.runs_total) AS total,
                   SUM(CASE WHEN {LEGAL} AND d.runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN {LEGAL} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
                   COUNT(*) AS balls
            FROM d
            GROUP BY d.bowler, d.bowling_team, d.batting_team, d.match_id, d.season, d.date, d.venue, d.over_number
            ORDER BY conceded DESC, sixes DESC, d.date DESC
            LIMIT ?
        """, params + [limit])
        return [dict(r, overs=None) for r in _rows(rows)]
    if bowling:
        order = {
            "best_bowling": "wickets DESC, conceded ASC, balls ASC",
            "best_economy": "conceded * 6.0 / balls ASC, wickets DESC",
            "most_conceded": "conceded DESC, wickets ASC",
        }[kind]
        having = "HAVING COUNT(CASE WHEN " + LEGAL + " THEN 1 END) >= 24" if kind == "best_economy" else ""
        rows = query(_base(filters) + BOWLING_INNINGS.format(legal=LEGAL, wicket=BOWLER_WICKET) + f" {having} ORDER BY {order}, d.date DESC LIMIT ?", params + [limit])
        for r in rows:
            r["economy"] = round(r["conceded"] * 6.0 / r["balls"], 2) if r["balls"] else None
        return _rows(rows)
    order = "sixes DESC, runs DESC" if kind == "most_sixes" else "runs DESC, balls ASC"
    rows = query(_base(filters) + BATTING_INNINGS.format(legal=LEGAL) + f" ORDER BY {order}, d.date DESC LIMIT ?", params + [limit])
    for r in rows:
        r["sr"] = round(r["runs"] * 100.0 / r["balls"], 2) if r["balls"] else None
        r["not_out"] = not r.pop("out")
    return _rows(rows)


@router.get("/partnerships")
def partnership_records(
    season: str | None = None,
    team: str | None = None,
    venue: str | None = None,
    wicket: int | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Highest stands, split at every wicket. Runs include extras, balls exclude wides."""
    filters, params = _filters(season, team, venue, "i.batting_team")
    if wicket is not None and not 1 <= wicket <= 10:
        raise HTTPException(status_code=422, detail="wicket must be between 1 and 10")
    wicket_sql = " WHERE wicket_no = ?" if wicket else ""
    if wicket:
        params = params + [wicket - 1]
    rows = query(_base(filters) + """
        , seq AS (
            SELECT d.*, COALESCE(SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) OVER (
                PARTITION BY d.match_id, d.innings_number ORDER BY d.over_number, d.ball_number, d.delivery_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS wicket_no
            FROM d
        ),
        seg AS (
            SELECT match_id, innings_number, batting_team, bowling_team, season, date, venue, wicket_no,
                   SUM(runs_total) AS runs,
                   COUNT(CASE WHEN extras_wides = 0 THEN 1 END) AS balls,
                   list_sort(list_distinct(list_concat(list(batter), list(non_striker)))) AS names,
                   MAX(CASE WHEN is_wicket THEN 1 ELSE 0 END) AS broken
            FROM seq
            GROUP BY match_id, innings_number, batting_team, bowling_team, season, date, venue, wicket_no
        )
        SELECT names[1] AS batter1, names[2] AS batter2, len(names) AS batters, wicket_no + 1 AS wicket, runs, balls,
               broken = 0 AS unbroken, batting_team AS team, bowling_team AS opponent, match_id, season, date, venue
        FROM seg
    """ + wicket_sql + """
        ORDER BY runs DESC, balls ASC, date DESC
        LIMIT ?
    """, params + [limit])
    return _rows([r for r in rows if r["batters"] >= 2])


@router.get("/team")
def team_records(
    kind: str = Query("highest_totals", pattern="^(" + "|".join(TEAM_KINDS) + ")$"),
    season: str | None = None,
    team: str | None = None,
    venue: str | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Totals, chases and margins from the innings and match tables."""
    if kind in ("biggest_wins_runs", "biggest_wins_wickets", "narrowest_wins"):
        filters, params = _filters(season, team, venue, "m.winner")
        where = {
            "biggest_wins_runs": "m.win_by_runs > 0",
            "biggest_wins_wickets": "m.win_by_wickets > 0",
            "narrowest_wins": "m.win_by_runs > 0",
        }[kind]
        order = {
            "biggest_wins_runs": "m.win_by_runs DESC",
            "biggest_wins_wickets": "m.win_by_wickets DESC, balls_left DESC",
            "narrowest_wins": "m.win_by_runs ASC",
        }[kind]
        rows = query(f"""
            SELECT m.winner AS team, CASE WHEN m.team1 = m.winner THEN m.team2 ELSE m.team1 END AS opponent,
                   m.match_id, m.season, m.date, ({VENUE_NORM_SQL}) AS venue, m.event_stage AS stage,
                   m.win_by_runs, m.win_by_wickets,
                   i1.total_runs AS first_total, i2.total_runs AS second_total, i2.total_wickets AS second_wickets,
                   m.balls_per_over * 20 - i2.total_balls AS balls_left
            FROM matches m
            LEFT JOIN innings i1 ON i1.match_id = m.match_id AND i1.innings_number = 1 AND NOT i1.is_super_over
            LEFT JOIN innings i2 ON i2.match_id = m.match_id AND i2.innings_number = 2 AND NOT i2.is_super_over
            WHERE {where} {filters}
            ORDER BY {order}, m.date DESC
            LIMIT ?
        """, params + [limit])
        return _rows(rows)
    filters, params = _filters(season, team, venue, "i.batting_team")
    where = {
        "highest_totals": "1=1",
        "lowest_totals": "(i.total_wickets = 10 OR i.total_balls >= m.balls_per_over * 20) AND m.result != 'no result'",
        "highest_chases": "i.innings_number = 2 AND m.winner = i.batting_team",
    }[kind]
    order = "i.total_runs ASC, i.total_balls ASC" if kind == "lowest_totals" else "i.total_runs DESC, i.total_balls ASC"
    rows = query(f"""
        SELECT i.batting_team AS team, i.bowling_team AS opponent, i.total_runs AS runs, i.total_wickets AS wickets,
               i.total_balls AS balls, i.innings_number, m.match_id, m.season, m.date, ({VENUE_NORM_SQL}) AS venue,
               m.winner = i.batting_team AS won, m.event_stage AS stage
        FROM innings i
        JOIN matches m ON m.match_id = i.match_id
        WHERE NOT i.is_super_over AND {where} {filters}
        ORDER BY {order}, m.date DESC
        LIMIT ?
    """, params + [limit])
    for r in rows:
        r["overs"] = f"{r['balls'] // 6}.{r['balls'] % 6}" if r.get("balls") is not None else None
        r["run_rate"] = round(r["runs"] * 6.0 / r["balls"], 2) if r.get("balls") else None
    return _rows(rows)


@router.get("/special")
def special_records(
    kind: str = Query("hat_tricks", pattern="^(" + "|".join(SPECIAL_KINDS) + ")$"),
    season: str | None = None,
    team: str | None = None,
    venue: str | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Hat-tricks, awards, ducks, super overs and ties."""
    if kind == "hat_tricks":
        filters, params = _filters(season, team, venue, "i.bowling_team")
        rows = query(_base(filters) + f"""
            , b AS (
                SELECT d.bowler, d.match_id, d.innings_number, d.bowling_team, d.batting_team, d.season, d.date, d.venue,
                       d.over_number, d.ball_number, d.player_dismissed,
                       CASE WHEN {BOWLER_WICKET} THEN 1 ELSE 0 END AS w,
                       LAG(CASE WHEN {BOWLER_WICKET} THEN 1 ELSE 0 END, 1) OVER w AS w1,
                       LAG(CASE WHEN {BOWLER_WICKET} THEN 1 ELSE 0 END, 2) OVER w AS w2,
                       LAG(d.player_dismissed, 1) OVER w AS v1,
                       LAG(d.player_dismissed, 2) OVER w AS v2
                FROM d
                WHERE ({LEGAL}) OR d.is_wicket
                WINDOW w AS (PARTITION BY d.bowler, d.match_id, d.innings_number ORDER BY d.over_number, d.ball_number, d.delivery_id)
            )
            SELECT bowler AS player, bowling_team AS team, batting_team AS opponent, match_id, season, date, venue,
                   over_number + 1 AS over, v2 || ', ' || v1 || ', ' || player_dismissed AS victims
            FROM b WHERE w = 1 AND w1 = 1 AND w2 = 1
            ORDER BY date DESC
            LIMIT ?
        """, params + [limit])
        return _rows(rows)
    if kind == "most_awards":
        filters, params = _filters(season, team, venue, "m.winner")
        rows = query(f"""
            SELECT m.player_of_match AS player, COUNT(*) AS awards, MIN(m.season) AS first_season, MAX(m.season) AS last_season
            FROM matches m
            WHERE m.player_of_match IS NOT NULL AND m.player_of_match != '' {filters}
            GROUP BY m.player_of_match
            ORDER BY awards DESC, last_season DESC
            LIMIT ?
        """, params + [limit])
        return rows
    if kind == "most_ducks":
        filters, params = _filters(season, team, venue, "i.batting_team")
        rows = query(_base(filters) + f"""
            , inn AS (
                SELECT d.batter, d.match_id, SUM(d.runs_batter) AS runs, COUNT(CASE WHEN {LEGAL} THEN 1 END) AS balls,
                       MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS out
                FROM d GROUP BY d.batter, d.match_id
            )
            SELECT batter AS player, COUNT(*) AS innings,
                   SUM(CASE WHEN runs = 0 AND out = 1 THEN 1 ELSE 0 END) AS ducks,
                   SUM(CASE WHEN runs = 0 AND out = 1 AND balls <= 1 THEN 1 ELSE 0 END) AS golden_ducks
            FROM inn GROUP BY batter
            HAVING ducks > 0
            ORDER BY ducks DESC, golden_ducks DESC, innings ASC
            LIMIT ?
        """, params + [limit])
        return rows
    filters, params = _filters(season, team, venue, "m.winner" if kind == "super_overs" else "m.team1")
    if kind == "super_overs":
        rows = query(f"""
            SELECT m.match_id, m.season, m.date, ({VENUE_NORM_SQL}) AS venue, m.team1, m.team2, m.winner AS team,
                   i1.total_runs AS first_total, i2.total_runs AS second_total,
                   (SELECT COUNT(DISTINCT d.innings_number) FROM deliveries d WHERE d.match_id = m.match_id AND d.is_super_over) AS super_over_innings
            FROM matches m
            LEFT JOIN innings i1 ON i1.match_id = m.match_id AND i1.innings_number = 1 AND NOT i1.is_super_over
            LEFT JOIN innings i2 ON i2.match_id = m.match_id AND i2.innings_number = 2 AND NOT i2.is_super_over
            WHERE EXISTS (SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.is_super_over) {filters}
            ORDER BY m.date DESC
            LIMIT ?
        """, params + [limit])
        return _rows(rows)
    rows = query(f"""
        SELECT m.match_id, m.season, m.date, ({VENUE_NORM_SQL}) AS venue, m.team1, m.team2, m.winner AS team, m.result,
               i1.total_runs AS first_total, i2.total_runs AS second_total
        FROM matches m
        LEFT JOIN innings i1 ON i1.match_id = m.match_id AND i1.innings_number = 1 AND NOT i1.is_super_over
        LEFT JOIN innings i2 ON i2.match_id = m.match_id AND i2.innings_number = 2 AND NOT i2.is_super_over
        WHERE m.result = 'tie' {filters}
        ORDER BY m.date DESC
        LIMIT ?
    """, params + [limit])
    return _rows(rows)


@router.get("/duels")
def duel_records(
    sort_by: str = Query("balls", pattern="^(balls|runs|outs|sr|dominance)$"),
    min_balls: int = Query(30, ge=6, le=500),
    season: str | None = None,
    batter: str | None = None,
    bowler: str | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Batter against bowler pairs across the archive."""
    filters, params = _filters(season, None, None, "i.batting_team")
    if batter:
        filters += " AND d.batter = ?"
        params.append(batter)
    if bowler:
        filters += " AND d.bowler = ?"
        params.append(bowler)
    order = {
        "balls": "balls DESC",
        "runs": "runs DESC",
        "outs": "outs DESC, balls DESC",
        "sr": "sr DESC",
        "dominance": "dominance DESC",
    }[sort_by]
    rows = query(_base(filters) + f"""
        SELECT d.batter, d.bowler,
               COUNT(DISTINCT d.match_id) AS matches,
               COUNT(CASE WHEN {LEGAL} THEN 1 END) AS balls,
               SUM(d.runs_batter) AS runs,
               SUM(CASE WHEN {BOWLER_WICKET} AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS outs,
               SUM(CASE WHEN {LEGAL} AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
               SUM(CASE WHEN {LEGAL} AND d.runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
               SUM(CASE WHEN {LEGAL} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
               ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 2) AS sr,
               ROUND(SUM(d.runs_batter) * 1.0 / NULLIF(SUM(CASE WHEN {BOWLER_WICKET} AND d.player_dismissed = d.batter THEN 1 ELSE 0 END), 0), 2) AS avg,
               ROUND((SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0)) - 25 *
                     SUM(CASE WHEN {BOWLER_WICKET} AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) * 100.0 /
                     NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 2) AS dominance
        FROM d
        GROUP BY d.batter, d.bowler
        HAVING COUNT(CASE WHEN {LEGAL} THEN 1 END) >= ?
        ORDER BY {order}
        LIMIT ?
    """, params + [min_balls, limit])
    for r in rows:
        r["dot_pct"] = round(r["dots"] * 100.0 / r["balls"], 1) if r["balls"] else None
    return rows


@router.get("/summary")
def records_summary(season: str | None = None, team: str | None = None, venue: str | None = None):
    """The headline entry of each category for the hub tiles."""
    out = {}
    for kind in ("highest_scores", "best_bowling", "fastest_fifties", "most_sixes"):
        rows = innings_records(kind=kind, season=season, team=team, venue=venue, limit=1)
        out[kind] = rows[0] if rows else None
    for kind in ("highest_totals", "highest_chases", "biggest_wins_runs"):
        rows = team_records(kind=kind, season=season, team=team, venue=venue, limit=1)
        out[kind] = rows[0] if rows else None
    rows = partnership_records(season=season, team=team, venue=venue, limit=1)
    out["partnership"] = rows[0] if rows else None
    rows = special_records(kind="most_awards", season=season, team=team, venue=venue, limit=1)
    out["most_awards"] = rows[0] if rows else None
    hats = special_records(kind="hat_tricks", season=season, team=team, venue=venue, limit=200)
    out["hat_tricks"] = {"count": len(hats), "latest": hats[0] if hats else None}
    if not any(out.values()):
        raise HTTPException(status_code=404, detail="No records for these filters")
    return out
