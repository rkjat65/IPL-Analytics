"""Phase analytics: powerplay, middle and death overs, over-by-over profiles and phase leaders."""

from fastapi import APIRouter, Query

from ..database import VENUE_NORM_SQL, query, team_variants
from .analytics import _season_filter

router = APIRouter(prefix="/api/analytics", tags=["phases"])

PHASE_CASE = "CASE WHEN d.over_number <= 5 THEN 'powerplay' WHEN d.over_number <= 14 THEN 'middle' ELSE 'death' END"
PHASE_ORDER = "CASE phase WHEN 'powerplay' THEN 1 WHEN 'middle' THEN 2 ELSE 3 END"
PHASE_RANGE = {"powerplay": (0, 5), "middle": (6, 14), "death": (15, 99)}
PHASE_LABEL = {"powerplay": "Powerplay (1-6)", "middle": "Middle (7-15)", "death": "Death (16-20)"}
LEGAL = "d.extras_wides = 0 AND d.extras_noballs = 0"
BOWLER_WICKET = "d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field')"
INNINGS_KEY = "d.match_id || '-' || d.innings_number"

MEASURES = f"""
    COUNT(DISTINCT {INNINGS_KEY}) AS innings,
    COUNT(CASE WHEN {LEGAL} THEN 1 END) AS balls,
    SUM(d.runs_total) AS runs,
    SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) AS wickets,
    SUM(CASE WHEN {LEGAL} AND d.runs_batter = 4 THEN 1 ELSE 0 END) AS fours,
    SUM(CASE WHEN {LEGAL} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
    SUM(CASE WHEN {LEGAL} AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
    ROUND(SUM(d.runs_total) * 6.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 2) AS run_rate,
    ROUND(SUM(d.runs_total) * 1.0 / NULLIF(COUNT(DISTINCT {INNINGS_KEY}), 0), 2) AS avg_runs,
    ROUND(SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(DISTINCT {INNINGS_KEY}), 0), 2) AS avg_wickets,
    ROUND(SUM(CASE WHEN {LEGAL} AND d.runs_batter >= 4 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 1) AS boundary_pct,
    ROUND(SUM(CASE WHEN {LEGAL} AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 1) AS dot_pct,
    ROUND(COUNT(CASE WHEN {LEGAL} THEN 1 END) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END), 0), 1) AS balls_per_wicket
"""


def _filters(season, team, venue, innings=None):
    sql, params = _season_filter("m", season)
    if team:
        variants = team_variants(team)
        sql += f" AND i.batting_team IN ({', '.join(['?'] * len(variants))})"
        params.extend(variants)
    if venue:
        sql += f" AND ({VENUE_NORM_SQL}) = ?"
        params.append(venue)
    if innings in (1, 2):
        sql += " AND d.innings_number = ?"
        params.append(innings)
    return sql, params


def _base(filters):
    return f"""
        WITH d AS (
            SELECT d.*, i.batting_team, i.bowling_team, m.season, ({VENUE_NORM_SQL}) AS venue, m.winner
            FROM deliveries d
            JOIN innings i ON i.match_id = d.match_id AND i.innings_number = d.innings_number AND i.is_super_over = d.is_super_over
            JOIN matches m ON m.match_id = d.match_id
            WHERE NOT d.is_super_over {filters}
        )
    """


@router.get("/phases")
def phase_summary(season: str | None = None, team: str | None = None, venue: str | None = None):
    """Scoring and wickets by phase, first against second innings, venues by phase, toss and chase outcomes."""
    filters, params = _filters(season, team, venue)
    phases = query(_base(filters) + f"""
        SELECT {PHASE_CASE} AS phase, {MEASURES}
        FROM d GROUP BY phase ORDER BY {PHASE_ORDER}
    """, params)
    by_innings = query(_base(filters) + f"""
        SELECT {PHASE_CASE} AS phase, d.innings_number, {MEASURES}
        FROM d WHERE d.innings_number IN (1, 2) GROUP BY phase, d.innings_number ORDER BY {PHASE_ORDER}, d.innings_number
    """, params)
    venues = query(_base(filters) + f"""
        , v AS (
            SELECT d.venue, {PHASE_CASE} AS phase, COUNT(DISTINCT d.match_id) AS matches,
                   ROUND(SUM(d.runs_total) * 6.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 2) AS run_rate,
                   ROUND(SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(DISTINCT {INNINGS_KEY}), 0), 2) AS avg_wickets
            FROM d GROUP BY d.venue, phase
        )
        SELECT venue, MAX(matches) AS matches,
               MAX(CASE WHEN phase = 'powerplay' THEN run_rate END) AS powerplay_rr,
               MAX(CASE WHEN phase = 'middle' THEN run_rate END) AS middle_rr,
               MAX(CASE WHEN phase = 'death' THEN run_rate END) AS death_rr,
               MAX(CASE WHEN phase = 'powerplay' THEN avg_wickets END) AS powerplay_wkts,
               MAX(CASE WHEN phase = 'middle' THEN avg_wickets END) AS middle_wkts,
               MAX(CASE WHEN phase = 'death' THEN avg_wickets END) AS death_wkts
        FROM v GROUP BY venue ORDER BY matches DESC LIMIT 15
    """, params)

    toss_filters, toss_params = _season_filter("m", season)
    if venue:
        toss_filters += f" AND ({VENUE_NORM_SQL}) = ?"
        toss_params.append(venue)
    if team:
        variants = team_variants(team)
        ph = ", ".join(["?"] * len(variants))
        toss_filters += f" AND (m.team1 IN ({ph}) OR m.team2 IN ({ph}))"
        toss_params.extend(variants * 2)
    toss = query(f"""
        SELECT m.toss_decision AS decision, COUNT(*) AS matches,
               SUM(CASE WHEN m.toss_winner = m.winner THEN 1 ELSE 0 END) AS toss_winner_wins,
               ROUND(SUM(CASE WHEN m.toss_winner = m.winner THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) AS toss_win_pct
        FROM matches m WHERE m.result = 'win' AND m.toss_decision IS NOT NULL {toss_filters}
        GROUP BY m.toss_decision ORDER BY matches DESC
    """, toss_params)
    chase = query(f"""
        SELECT COUNT(*) AS matches,
               SUM(CASE WHEN m.winner = i2.batting_team THEN 1 ELSE 0 END) AS chases_won,
               ROUND(SUM(CASE WHEN m.winner = i2.batting_team THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) AS chase_win_pct,
               ROUND(AVG(i1.total_runs), 1) AS avg_first_innings,
               ROUND(AVG(CASE WHEN m.winner = i1.batting_team THEN i1.total_runs END), 1) AS avg_defended
        FROM matches m
        JOIN innings i1 ON i1.match_id = m.match_id AND i1.innings_number = 1 AND NOT i1.is_super_over
        JOIN innings i2 ON i2.match_id = m.match_id AND i2.innings_number = 2 AND NOT i2.is_super_over
        WHERE m.result = 'win' {toss_filters}
    """, toss_params)
    for row in phases + by_innings:
        row["label"] = PHASE_LABEL.get(row["phase"], row["phase"])
    return {"phases": phases, "by_innings": by_innings, "venues": venues, "toss": toss, "chase": chase[0] if chase else None}


@router.get("/overs")
def over_profile(season: str | None = None, team: str | None = None, venue: str | None = None, innings: int | None = None):
    """Every over from 1 to 20: how many innings reached it, what it produced and what it cost."""
    filters, params = _filters(season, team, venue, innings)
    rows = query(_base(filters) + f"""
        SELECT d.over_number + 1 AS over, {MEASURES}
        FROM d WHERE d.over_number < 20 GROUP BY d.over_number ORDER BY d.over_number
    """, params)
    for r in rows:
        r["phase"] = "powerplay" if r["over"] <= 6 else ("middle" if r["over"] <= 15 else "death")
    return rows


@router.get("/phase-leaders")
def phase_leaders(
    phase: str = Query("death", pattern="^(powerplay|middle|death)$"),
    season: str | None = None,
    team: str | None = None,
    venue: str | None = None,
    min_balls: int = Query(60, ge=6, le=2000),
    limit: int = Query(20, ge=1, le=100),
):
    """Best batters and bowlers in one phase, with a balls qualification."""
    filters, params = _filters(season, team, venue)
    lo, hi = PHASE_RANGE[phase]
    filters += " AND d.over_number BETWEEN ? AND ?"
    params = params + [lo, hi]
    batters = query(_base(filters) + f"""
        SELECT d.batter AS player, COUNT(DISTINCT {INNINGS_KEY}) AS innings,
               COUNT(CASE WHEN {LEGAL} THEN 1 END) AS balls, SUM(d.runs_batter) AS runs,
               SUM(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS outs,
               SUM(CASE WHEN {LEGAL} AND d.runs_batter = 6 THEN 1 ELSE 0 END) AS sixes,
               ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 2) AS sr,
               ROUND(SUM(d.runs_batter) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END), 0), 2) AS avg,
               ROUND(SUM(CASE WHEN {LEGAL} AND d.runs_batter >= 4 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 1) AS boundary_pct,
               ROUND(SUM(CASE WHEN {LEGAL} AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 1) AS dot_pct
        FROM d GROUP BY d.batter
        HAVING COUNT(CASE WHEN {LEGAL} THEN 1 END) >= ?
        ORDER BY runs DESC LIMIT ?
    """, params + [min_balls, limit])
    bowlers = query(_base(filters) + f"""
        SELECT d.bowler AS player, COUNT(DISTINCT {INNINGS_KEY}) AS innings,
               COUNT(CASE WHEN {LEGAL} THEN 1 END) AS balls,
               SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS conceded,
               SUM(CASE WHEN {BOWLER_WICKET} THEN 1 ELSE 0 END) AS wickets,
               ROUND(SUM(d.runs_batter + d.extras_wides + d.extras_noballs) * 6.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 2) AS economy,
               ROUND(SUM(d.runs_batter + d.extras_wides + d.extras_noballs) * 1.0 / NULLIF(SUM(CASE WHEN {BOWLER_WICKET} THEN 1 ELSE 0 END), 0), 2) AS avg,
               ROUND(COUNT(CASE WHEN {LEGAL} THEN 1 END) * 1.0 / NULLIF(SUM(CASE WHEN {BOWLER_WICKET} THEN 1 ELSE 0 END), 0), 1) AS sr,
               ROUND(SUM(CASE WHEN {LEGAL} AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(CASE WHEN {LEGAL} THEN 1 END), 0), 1) AS dot_pct
        FROM d GROUP BY d.bowler
        HAVING COUNT(CASE WHEN {LEGAL} THEN 1 END) >= ?
        ORDER BY wickets DESC, economy ASC LIMIT ?
    """, params + [min_balls, limit])
    return {"phase": phase, "batters": batters, "bowlers": bowlers}
