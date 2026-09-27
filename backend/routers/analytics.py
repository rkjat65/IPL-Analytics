"""Analytics endpoints: KPIs, phase stats, venues, toss impact."""

from fastapi import APIRouter
from ..database import query, normalize_team, team_variants, VENUE_NORM_SQL

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _season_filter(table_alias: str, season: str | None) -> tuple[str, list]:
    if not season:
        return "", []
    # Support comma-separated seasons (e.g. "2020,2021,2022")
    parts = [s.strip() for s in season.split(",") if s.strip()]
    if len(parts) == 1:
        return f" AND {table_alias}.season = ?", [parts[0]]
    ph = ", ".join(["?"] * len(parts))
    return f" AND {table_alias}.season IN ({ph})", parts


@router.get("/kpis")
def dashboard_kpis(season: str | None = None):
    sf_m, sp_m = _season_filter("m", season)

    total_matches = query(f"SELECT COUNT(*) AS v FROM matches m WHERE 1=1 {sf_m}", sp_m)

    runs_wickets = query(f"""
        SELECT SUM(d.runs_total) AS total_runs,
               SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) AS total_wickets,
               SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) +
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS total_boundaries,
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS total_sixes
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false {sf_m}
    """, sp_m[:])

    avg_score = query(f"""
        SELECT ROUND(AVG(i.total_runs), 2) AS avg_score
        FROM innings i
        JOIN matches m ON i.match_id = m.match_id
        WHERE i.is_super_over = false AND m.result != 'no result' {sf_m}
    """, sp_m[:])

    highest = query(f"""
        SELECT i.batting_team, i.total_runs, m.match_id, m.date
        FROM innings i
        JOIN matches m ON i.match_id = m.match_id
        WHERE i.is_super_over = false AND m.result != 'no result' {sf_m}
        ORDER BY i.total_runs DESC
        LIMIT 1
    """, sp_m[:])

    most_sixes = query(f"""
        SELECT d.batter AS player, SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false {sf_m}
        GROUP BY d.batter
        ORDER BY sixes DESC
        LIMIT 1
    """, sp_m[:])

    return {
        "total_matches": total_matches[0]["v"],
        **runs_wickets[0],
        "avg_score": avg_score[0]["avg_score"],
        "highest_total": highest[0] if highest else None,
        "most_sixes_player": most_sixes[0] if most_sixes else None,
    }


@router.get("/phase-stats")
def phase_stats(season: str | None = None):
    sf, sp = _season_filter("m", season)

    rows = query(f"""
        SELECT
            CASE
                WHEN d.over_number <= 5 THEN 'powerplay'
                WHEN d.over_number <= 14 THEN 'middle'
                ELSE 'death'
            END AS phase,
            ROUND(SUM(d.runs_total) * 1.0 / COUNT(DISTINCT d.match_id || '-' || d.innings_number), 2) AS avg_runs,
            ROUND(SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) * 1.0 / COUNT(DISTINCT d.match_id || '-' || d.innings_number), 2) AS avg_wickets,
            ROUND(SUM(d.runs_total) * 6.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS run_rate,
            ROUND((SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) + SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END)) * 100.0
                / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS boundary_pct
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false {sf}
        GROUP BY phase
        ORDER BY CASE phase WHEN 'powerplay' THEN 1 WHEN 'middle' THEN 2 ELSE 3 END
    """, sp)
    return rows


@router.get("/venues")
def venue_stats(season: str | None = None):
    sf, sp = _season_filter("m", season)

    rows = query(f"""
        WITH venue_innings AS (
            SELECT ({VENUE_NORM_SQL}) AS venue, i.innings_number, i.total_runs, i.batting_team, m.winner, m.match_id,
                   m.toss_winner, m.toss_decision
            FROM innings i
            JOIN matches m ON i.match_id = m.match_id
            WHERE i.is_super_over = false {sf}
        ),
        venue_agg AS (
            SELECT venue,
                   COUNT(DISTINCT match_id) AS matches,
                   ROUND(AVG(CASE WHEN innings_number = 1 THEN total_runs END), 2) AS avg_1st_innings,
                   ROUND(AVG(CASE WHEN innings_number = 2 THEN total_runs END), 2) AS avg_2nd_innings,
                   MAX(total_runs) AS highest_total,
                   ROUND(SUM(CASE WHEN innings_number = 1 AND batting_team = winner THEN 1 ELSE 0 END) * 100.0
                       / NULLIF(COUNT(DISTINCT match_id), 0), 2) AS bat_first_win_pct
            FROM venue_innings
            GROUP BY venue
        )
        SELECT * FROM venue_agg
        ORDER BY matches DESC
    """, sp)

    # Top performer per venue
    top_perf = query(f"""
        WITH batter_venue AS (
            SELECT ({VENUE_NORM_SQL}) AS venue, d.batter, SUM(d.runs_batter) AS runs
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false {sf}
            GROUP BY ({VENUE_NORM_SQL}), d.batter
        ),
        ranked AS (
            SELECT venue, batter, runs,
                   ROW_NUMBER() OVER (PARTITION BY venue ORDER BY runs DESC) AS rn
            FROM batter_venue
        )
        SELECT venue, batter AS top_performer, runs AS top_performer_runs
        FROM ranked WHERE rn = 1
    """, sp)

    perf_map = {r["venue"]: {"top_performer": r["top_performer"], "top_performer_runs": r["top_performer_runs"]} for r in top_perf}
    for row in rows:
        p = perf_map.get(row["venue"], {})
        row["top_performer"] = p.get("top_performer")
        row["top_performer_runs"] = p.get("top_performer_runs")

    return rows


@router.get("/toss-impact")
def toss_impact(season: str | None = None):
    sf, sp = _season_filter("m", season)

    rows = query(f"""
        SELECT ({VENUE_NORM_SQL}) AS venue,
               m.toss_decision,
               COUNT(*) AS matches,
               SUM(CASE WHEN m.toss_winner = m.winner THEN 1 ELSE 0 END) AS toss_winner_wins,
               ROUND(SUM(CASE WHEN m.toss_winner = m.winner THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS toss_win_pct
        FROM matches m
        WHERE m.result = 'win' {sf}
        GROUP BY ({VENUE_NORM_SQL}), m.toss_decision
        ORDER BY venue, m.toss_decision
    """, sp)
    return rows


@router.get("/top-totals")
def top_totals(season: str | None = None):
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT i.batting_team, i.total_runs, m.match_id, m.date,
               CASE WHEN i.batting_team = m.team1 THEN m.team2 ELSE m.team1 END AS opponent,
               ({VENUE_NORM_SQL}) AS venue
        FROM innings i
        JOIN matches m ON i.match_id = m.match_id
        WHERE i.is_super_over = false {sf}
        ORDER BY i.total_runs DESC
        LIMIT 10
    """, sp)
    return rows


@router.get("/top-sixes")
def top_sixes(season: str | None = None):
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT d.batter AS player,
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
               COUNT(DISTINCT d.match_id) AS matches,
               SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false {sf}
        GROUP BY d.batter
        ORDER BY sixes DESC
        LIMIT 10
    """, sp)
    return rows


@router.get("/top-fours")
def top_fours(season: str | None = None):
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT d.batter AS player,
               SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
               COUNT(DISTINCT d.match_id) AS matches,
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false {sf}
        GROUP BY d.batter
        ORDER BY fours DESC
        LIMIT 10
    """, sp)
    return rows


@router.get("/most-wins")
def most_wins(season: str | None = None):
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT m.winner AS team,
               COUNT(*) AS wins,
               (SELECT COUNT(*) FROM matches m2
                WHERE (m2.team1 = m.winner OR m2.team2 = m.winner)
                  AND m2.result IS NOT NULL
                  {sf.replace('m.season', 'm2.season')}) AS matches
        FROM matches m
        WHERE m.winner IS NOT NULL {sf}
        GROUP BY m.winner
        ORDER BY wins DESC
    """, sp + sp)

    # Merge rows that map to the same normalized team name
    merged: dict[str, dict] = {}
    for row in rows:
        key = normalize_team(row["team"])
        if key in merged:
            merged[key]["wins"] += row["wins"]
            merged[key]["matches"] += row["matches"]
        else:
            merged[key] = {"team": key, "wins": row["wins"], "matches": row["matches"]}

    result = sorted(merged.values(), key=lambda r: r["wins"], reverse=True)
    for r in result:
        r["win_pct"] = round(r["wins"] * 100.0 / r["matches"], 2) if r["matches"] else 0
    return result


@router.get("/title-winners")
def title_winners():
    rows = query("""
        WITH season_finals AS (
            SELECT season, MAX(date) AS final_date
            FROM matches GROUP BY season
        )
        SELECT m.season, m.winner
        FROM matches m
        JOIN season_finals sf ON m.season = sf.season AND m.date = sf.final_date
        WHERE m.winner IS NOT NULL
        ORDER BY m.season
    """)
    for row in rows:
        row["winner"] = normalize_team(row["winner"])
    return rows


@router.get("/man-of-the-match")
def man_of_the_match(season: str | None = None, team: str | None = None, player: str | None = None, role: str | None = None):
    sf, sp = _season_filter("m", season)
    filters = ["m.player_of_match IS NOT NULL AND m.player_of_match != ''"]
    params: list = []

    if team:
        filters.append("(m.team1 = ? OR m.team2 = ?)")
        params.extend([team, team])
    if player:
        filters.append("m.player_of_match = ?")
        params.append(player)
    if role in ("batsman", "bowler", "allrounder"):
        filters.append("r.motm_role = ?")
        params.append(role)

    where_clause = "WHERE " + " AND ".join(filters)

    player_counts = query(f"""
        WITH motm_roles AS (
            SELECT m.match_id,
                   CASE
                     WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.batter = m.player_of_match)
                          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.bowler = m.player_of_match)
                       THEN 'batsman'
                     WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.bowler = m.player_of_match)
                          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.batter = m.player_of_match)
                       THEN 'bowler'
                     ELSE 'allrounder'
                   END AS motm_role
            FROM matches m
            WHERE m.player_of_match IS NOT NULL AND m.player_of_match != ''
        )
        SELECT m.player_of_match AS player,
               COUNT(*) AS awards
        FROM matches m
        JOIN motm_roles r ON r.match_id = m.match_id
        {where_clause} {sf}
        GROUP BY m.player_of_match
        ORDER BY awards DESC, player
        LIMIT 20
    """, params + sp)

    season_counts = query(f"""
        WITH motm_roles AS (
            SELECT m.match_id,
                   CASE
                     WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.batter = m.player_of_match)
                          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.bowler = m.player_of_match)
                       THEN 'batsman'
                     WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.bowler = m.player_of_match)
                          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.batter = m.player_of_match)
                       THEN 'bowler'
                     ELSE 'allrounder'
                   END AS motm_role
            FROM matches m
            WHERE m.player_of_match IS NOT NULL AND m.player_of_match != ''
        )
        SELECT m.season,
               COUNT(*) AS awards
        FROM matches m
        JOIN motm_roles r ON r.match_id = m.match_id
        {where_clause} {sf}
        GROUP BY m.season
        ORDER BY m.season
    """, params + sp)

    recent_matches = query(f"""
        WITH motm_roles AS (
            SELECT m.match_id,
                   CASE
                     WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.batter = m.player_of_match)
                          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.bowler = m.player_of_match)
                       THEN 'batsman'
                     WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.bowler = m.player_of_match)
                          AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.match_id = m.match_id AND d.batter = m.player_of_match)
                       THEN 'bowler'
                     ELSE 'allrounder'
                   END AS motm_role
            FROM matches m
            WHERE m.player_of_match IS NOT NULL AND m.player_of_match != ''
        )
        SELECT m.match_id,
               m.date,
               m.team1,
               m.team2,
               m.winner,
               m.player_of_match
        FROM matches m
        JOIN motm_roles r ON r.match_id = m.match_id
        {where_clause} {sf}
        ORDER BY m.date DESC
        LIMIT 30
    """, params + sp)

    return {
        "player_counts": player_counts,
        "season_counts": season_counts,
        "matches": recent_matches,
    }


# ── Mind-blowing Dashboard Charts ─────────────────────────────────────────────


@router.get("/innings-dna")
def innings_dna(season: str | None = None):
    """Average runs scored per over (1-20) — the 'shape' of an IPL innings."""
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT sub.over_number + 1 AS over_num,
               ROUND(AVG(sub.over_runs), 2) AS avg_runs,
               ROUND(AVG(sub.over_wickets), 2) AS avg_wickets,
               ROUND(SUM(sub.sixes) * 1.0 / COUNT(*), 2) AS sixes_per_over,
               ROUND(SUM(sub.fours) * 1.0 / COUNT(*), 2) AS fours_per_over,
               ROUND(SUM(sub.dots) * 100.0 / NULLIF(SUM(sub.legal_balls), 0), 1) AS dot_pct
        FROM (
            SELECT d.match_id, d.innings_number, d.over_number,
                   SUM(d.runs_total) AS over_runs,
                   SUM(CASE WHEN d.is_wicket THEN 1 ELSE 0 END) AS over_wickets,
                   SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
                   SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false {sf}
            GROUP BY d.match_id, d.innings_number, d.over_number
        ) sub
        GROUP BY sub.over_number
        ORDER BY sub.over_number
    """, sp)
    return rows


@router.get("/six-evolution")
def six_evolution():
    """Sixes per match per season — shows how the game has evolved."""
    rows = query("""
        SELECT m.season,
               COUNT(DISTINCT m.match_id) AS matches,
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS total_sixes,
               ROUND(SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) * 1.0
                   / COUNT(DISTINCT m.match_id), 2) AS sixes_per_match,
               ROUND(SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) * 1.0
                   / COUNT(DISTINCT m.match_id), 2) AS fours_per_match,
               ROUND(SUM(d.runs_total) * 1.0 / COUNT(DISTINCT m.match_id), 1) AS runs_per_match,
               ROUND(AVG(i_avg.avg_total), 1) AS avg_innings_score
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        JOIN (
            SELECT i.match_id, AVG(i.total_runs) AS avg_total
            FROM innings i
            JOIN matches m ON i.match_id = m.match_id
            WHERE i.is_super_over = false AND m.result != 'no result'
            GROUP BY i.match_id
        ) i_avg ON d.match_id = i_avg.match_id
        WHERE d.is_super_over = false
        GROUP BY m.season
        ORDER BY m.season
    """)
    return rows


@router.get("/batting-matrix")
def batting_impact_matrix(season: str | None = None, team: str | None = None, min_innings: int = 20):
    """SR vs Average scatter — bubble size = runs. The ultimate batter comparison."""
    sf, sp = _season_filter("m", season)
    team_filter = ""
    params = sp[:]
    if team:
        variants = team_variants(team)
        ph = ", ".join(["?"] * len(variants))
        team_filter = f" AND i.batting_team IN ({ph})"
        params.extend(variants)

    rows = query(f"""
        SELECT d.batter AS player,
               SUM(d.runs_batter) AS runs,
               COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
               ROUND(SUM(d.runs_batter) * 100.0
                   / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS sr,
               COUNT(DISTINCT d.match_id) AS matches,
               COUNT(DISTINCT d.match_id || '-' || d.innings_number) AS innings,
               SUM(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS dismissals,
               ROUND(SUM(d.runs_batter) * 1.0
                   / NULLIF(SUM(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END), 0), 2) AS avg,
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
               SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        WHERE d.is_super_over = false {sf}{team_filter}
        GROUP BY d.batter
        HAVING COUNT(DISTINCT d.match_id || '-' || d.innings_number) >= ?
        ORDER BY runs DESC
    """, params + [min_innings])
    return rows


@router.get("/bowling-matrix")
def bowling_impact_matrix(season: str | None = None, team: str | None = None, min_innings: int = 20):
    """Economy vs Average scatter — bubble size = wickets. The ultimate bowler comparison."""
    sf, sp = _season_filter("m", season)
    team_filter = ""
    params = sp[:]
    if team:
        variants = team_variants(team)
        ph = ", ".join(["?"] * len(variants))
        team_filter = f" AND i.bowling_team IN ({ph})"
        params.extend(variants)

    rows = query(f"""
        SELECT d.bowler AS player,
               SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field') THEN 1 ELSE 0 END) AS wickets,
               COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
               SUM(d.runs_batter + d.runs_extras) AS runs_conceded,
               ROUND(SUM(d.runs_batter + d.runs_extras) * 6.0
                   / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS economy,
               COUNT(DISTINCT d.match_id) AS matches,
               COUNT(DISTINCT d.match_id || '-' || d.innings_number) AS innings,
               ROUND(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) * 1.0
                   / NULLIF(SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field') THEN 1 ELSE 0 END), 0), 2) AS avg,
               ROUND(SUM(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) * 100.0
                   / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 1) AS dot_pct
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        WHERE d.is_super_over = false {sf}{team_filter}
        GROUP BY d.bowler
        HAVING COUNT(DISTINCT d.match_id || '-' || d.innings_number) >= ?
           AND SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field') THEN 1 ELSE 0 END) > 0
        ORDER BY wickets DESC
    """, params + [min_innings])
    return rows


@router.get("/chase-analysis")
def chase_analysis(season: str | None = None):
    """Win % by target score range for chasing teams."""
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        WITH first_innings AS (
            SELECT i.match_id, i.total_runs AS target
            FROM innings i
            WHERE i.innings_number = 1 AND i.is_super_over = false
        ),
        chases AS (
            SELECT f.match_id, f.target,
                   CASE
                       WHEN f.target < 130 THEN '< 130'
                       WHEN f.target < 150 THEN '130-149'
                       WHEN f.target < 170 THEN '150-169'
                       WHEN f.target < 190 THEN '170-189'
                       WHEN f.target < 210 THEN '190-209'
                       ELSE '210+'
                   END AS target_range,
                   CASE
                       WHEN f.target < 130 THEN 1
                       WHEN f.target < 150 THEN 2
                       WHEN f.target < 170 THEN 3
                       WHEN f.target < 190 THEN 4
                       WHEN f.target < 210 THEN 5
                       ELSE 6
                   END AS sort_order,
                   i2.batting_team AS chasing_team,
                   m.winner
            FROM first_innings f
            JOIN innings i2 ON f.match_id = i2.match_id AND i2.innings_number = 2 AND i2.is_super_over = false
            JOIN matches m ON f.match_id = m.match_id
            WHERE m.result = 'win' {sf}
        )
        SELECT target_range,
               COUNT(*) AS total_chases,
               SUM(CASE WHEN chasing_team = winner THEN 1 ELSE 0 END) AS chase_wins,
               ROUND(SUM(CASE WHEN chasing_team = winner THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS chase_win_pct,
               ROUND(AVG(target), 1) AS avg_target,
               MIN(sort_order) AS sort_order
        FROM chases
        GROUP BY target_range
        ORDER BY MIN(sort_order)
    """, sp)
    return rows


@router.get("/dismissal-types")
def dismissal_types(season: str | None = None):
    """Breakdown of how batsmen get dismissed."""
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT
            CASE
                WHEN d.dismissal_kind = 'caught' THEN 'Caught'
                WHEN d.dismissal_kind = 'bowled' THEN 'Bowled'
                WHEN d.dismissal_kind = 'lbw' THEN 'LBW'
                WHEN d.dismissal_kind = 'run out' THEN 'Run Out'
                WHEN d.dismissal_kind = 'stumped' THEN 'Stumped'
                WHEN d.dismissal_kind = 'caught and bowled' THEN 'C&B'
                WHEN d.dismissal_kind = 'hit wicket' THEN 'Hit Wicket'
                ELSE 'Other'
            END AS type,
            COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_wicket = true AND d.dismissal_kind IS NOT NULL
              AND d.is_super_over = false {sf}
        GROUP BY type
        ORDER BY count DESC
    """, sp)
    return rows


@router.get("/phase-dominance")
def phase_dominance(season: str | None = None):
    """Team-wise run rates in powerplay vs middle vs death overs."""
    sf, sp = _season_filter("m", season)
    rows = query(f"""
        SELECT i.batting_team AS team,
               CASE
                   WHEN d.over_number <= 5 THEN 'powerplay'
                   WHEN d.over_number <= 14 THEN 'middle'
                   ELSE 'death'
               END AS phase,
               ROUND(SUM(d.runs_total) * 6.0
                   / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS run_rate,
               SUM(CASE WHEN (d.runs_batter = 4 OR d.runs_batter = 6) AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS boundaries,
               COUNT(DISTINCT d.match_id) AS matches
        FROM deliveries d
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false {sf}
        GROUP BY i.batting_team, phase
        HAVING COUNT(DISTINCT d.match_id) >= 5
        ORDER BY i.batting_team, CASE phase WHEN 'powerplay' THEN 1 WHEN 'middle' THEN 2 ELSE 3 END
    """, sp)

    # Normalize team names and pivot into {team, powerplay, middle, death}
    team_data: dict[str, dict] = {}
    for row in rows:
        team = normalize_team(row["team"])
        if team not in team_data:
            team_data[team] = {"team": team, "powerplay": 0, "middle": 0, "death": 0}
        team_data[team][row["phase"]] = row["run_rate"]

    return sorted(team_data.values(), key=lambda r: r["death"], reverse=True)


@router.get("/cap-winners")
def cap_winners():
    """Orange Cap (most runs) and Purple Cap (most wickets) winners per season."""
    orange = query("""
        SELECT m.season, d.batter AS player, SUM(d.runs_batter) AS value
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_super_over = false
        GROUP BY m.season, d.batter
        QUALIFY ROW_NUMBER() OVER (PARTITION BY m.season ORDER BY SUM(d.runs_batter) DESC) = 1
        ORDER BY m.season
    """)

    purple = query("""
        SELECT m.season, d.bowler AS player,
            COUNT(*) AS value
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.is_wicket = true AND d.is_super_over = false
          AND d.dismissal_kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field')
        GROUP BY m.season, d.bowler
        QUALIFY ROW_NUMBER() OVER (PARTITION BY m.season ORDER BY COUNT(*) DESC) = 1
        ORDER BY m.season
    """)

    return {"orange_cap": orange, "purple_cap": purple}
