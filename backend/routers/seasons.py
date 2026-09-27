"""Season endpoints: summary, points table, cap races."""

from fastapi import APIRouter, HTTPException, Query
from ..database import query, normalize_team
from ..tournaments import get_tournament_slug

router = APIRouter(prefix="/api/seasons", tags=["seasons"])


@router.get("/{season:path}/groups")
def season_groups(season: str):
    """Return the group/stage scopes available for a tournament edition."""
    if get_tournament_slug() != "t20wc":
        return []
    return query("""
        SELECT DISTINCT event_stage AS stage, event_group AS "group"
        FROM matches
        WHERE season = ? AND event_group IS NOT NULL
        ORDER BY event_stage NULLS FIRST, event_group
    """, [season])


@router.get("/{season:path}/summary")
def season_summary(season: str):
    summary = query("""
        SELECT
            COUNT(*) AS total_matches,
            COUNT(DISTINCT city) AS cities,
            COUNT(DISTINCT venue) AS venues,
            MIN(date) AS start_date,
            MAX(date) AS end_date
        FROM matches
        WHERE season = ?
    """, [season])

    if not summary or summary[0]["total_matches"] == 0:
        raise HTTPException(404, f"Season {season} not found")

    # Top run scorer
    top_batter = query("""
        SELECT d.batter AS player, i.batting_team AS team, SUM(d.runs_batter) AS runs
        FROM deliveries d
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        JOIN matches m ON d.match_id = m.match_id
        WHERE m.season = ? AND d.is_super_over = false
        GROUP BY d.batter, i.batting_team
        ORDER BY runs DESC
        LIMIT 1
    """, [season])

    # Top wicket taker
    top_bowler = query("""
        SELECT d.bowler AS player, i.bowling_team AS team,
               SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets
        FROM deliveries d
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        JOIN matches m ON d.match_id = m.match_id
        WHERE m.season = ? AND d.is_super_over = false
        GROUP BY d.bowler, i.bowling_team
        ORDER BY wickets DESC
        LIMIT 1
    """, [season])

    # Most player of match awards
    top_pom = query("""
        SELECT player_of_match AS player, COUNT(*) AS awards
        FROM matches
        WHERE season = ? AND player_of_match IS NOT NULL
        GROUP BY player_of_match
        ORDER BY awards DESC
        LIMIT 1
    """, [season])

    # Most sixes
    most_sixes = query("""
        SELECT d.batter AS player,
               SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE m.season = ? AND d.is_super_over = false
        GROUP BY d.batter
        ORDER BY sixes DESC
        LIMIT 1
    """, [season])

    # Best economy (min 10 overs bowled)
    best_economy = query("""
        SELECT d.bowler AS player,
               ROUND(SUM(d.runs_total - COALESCE(d.extras_byes, 0) - COALESCE(d.extras_legbyes, 0)) * 6.0
                     / NULLIF(SUM(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END), 0), 2) AS economy
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE m.season = ? AND d.is_super_over = false
        GROUP BY d.bowler
        HAVING SUM(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) >= 60
        ORDER BY economy ASC
        LIMIT 1
    """, [season])

    # Winner (last match of season)
    winner = query("""
        SELECT winner
        FROM matches
        WHERE season = ?
        ORDER BY date DESC
        LIMIT 1
    """, [season])

    result = summary[0]
    if top_batter:
        top_batter[0]["team"] = normalize_team(top_batter[0]["team"])
    if top_bowler:
        top_bowler[0]["team"] = normalize_team(top_bowler[0]["team"])
    
    result["orange_cap"] = top_batter[0] if top_batter else None
    result["purple_cap"] = top_bowler[0] if top_bowler else None
    result["most_pom"] = top_pom[0] if top_pom else None
    result["most_sixes"] = most_sixes[0] if most_sixes else None
    result["best_economy"] = best_economy[0] if best_economy else None
    result["winner"] = normalize_team(winner[0]["winner"]) if winner and winner[0]["winner"] else None
    return result


@router.get("/{season:path}/points-table")
def points_table(
    season: str,
    group: str | None = Query(None),
    stage: str | None = Query(None),
):
    """Calculate points table with NRR."""
    plain_scope = ""
    aliased_scope = ""
    scope_values: list[str] = []
    if group:
        plain_scope += " AND event_group = ?"
        aliased_scope += " AND m.event_group = ?"
        scope_values.append(group)
    if stage is not None:
        plain_scope += " AND COALESCE(event_stage, '') = ?"
        aliased_scope += " AND COALESCE(m.event_stage, '') = ?"
        scope_values.append(stage)

    params: list[str] = []
    for _ in range(2):
        params.append(season)
        params.extend(scope_values)
    params.append(season)
    params.extend(scope_values)
    params.append(season)
    params.extend(scope_values)

    rows = query(f"""
        WITH team_matches AS (
            SELECT m.match_id, m.winner, m.result,
                   CASE WHEN m.team1 = t.team THEN m.team1 ELSE m.team2 END AS team,
                   CASE WHEN m.team1 = t.team THEN m.team2 ELSE m.team1 END AS opponent
            FROM matches m
            CROSS JOIN (
                SELECT DISTINCT team FROM (
                    SELECT team1 AS team FROM matches WHERE season = ? {plain_scope}
                    UNION
                    SELECT team2 AS team FROM matches WHERE season = ? {plain_scope}
                ) sub
            ) t
            WHERE m.season = ? {aliased_scope} AND (m.team1 = t.team OR m.team2 = t.team)
        ),
        so_winners AS (
            SELECT i.match_id,
                CASE
                    WHEN MAX(CASE WHEN rn = 2 THEN total_runs END) > MAX(CASE WHEN rn = 1 THEN total_runs END)
                        THEN MAX(CASE WHEN rn = 2 THEN batting_team END)
                    WHEN MAX(CASE WHEN rn = 1 THEN total_runs END) > MAX(CASE WHEN rn = 2 THEN total_runs END)
                        THEN MAX(CASE WHEN rn = 1 THEN batting_team END)
                    WHEN i.match_id = 729315 THEN 'Kolkata Knight Riders'
                    ELSE NULL
                END AS so_winner
            FROM (
                SELECT match_id, innings_number, batting_team, total_runs,
                    ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY innings_number DESC) AS rn
                FROM innings WHERE is_super_over = true
            ) i WHERE rn <= 2
            GROUP BY i.match_id
        ),
        resolved AS (
            SELECT tm.*,
                COALESCE(tm.winner, sow.so_winner) AS effective_winner
            FROM team_matches tm
            LEFT JOIN so_winners sow ON tm.match_id = sow.match_id
        ),
        standings AS (
            SELECT team,
                   COUNT(*) AS played,
                   SUM(CASE WHEN effective_winner = team THEN 1 ELSE 0 END) AS won,
                   SUM(CASE WHEN effective_winner IS NOT NULL AND effective_winner != team THEN 1 ELSE 0 END) AS lost,
                   SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_result,
                   SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS tied,
                   SUM(CASE WHEN effective_winner = team THEN 1 ELSE 0 END) * 2
                       + SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS points
            FROM resolved
            GROUP BY team
        ),
        legal_balls_per_innings AS (
            SELECT i.match_id, i.innings_number, i.batting_team, i.bowling_team,
                   i.total_runs, i.total_wickets,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls
            FROM innings i
            LEFT JOIN deliveries d
                ON i.match_id = d.match_id AND i.innings_number = d.innings_number
            JOIN matches m ON i.match_id = m.match_id
            WHERE m.season = ? {aliased_scope} AND i.is_super_over = false AND m.result = 'win'
            GROUP BY i.match_id, i.innings_number, i.batting_team, i.bowling_team,
                     i.total_runs, i.total_wickets
        ),
        nrr_data AS (
            SELECT
                batting_team AS team,
                SUM(total_runs) AS runs_scored,
                SUM(CASE WHEN total_wickets = 10 THEN 120
                         ELSE legal_balls END) AS balls_faced,
                0 AS runs_conceded,
                0 AS balls_bowled
            FROM legal_balls_per_innings
            GROUP BY batting_team

            UNION ALL

            SELECT
                bowling_team AS team,
                0 AS runs_scored,
                0 AS balls_faced,
                SUM(total_runs) AS runs_conceded,
                SUM(CASE WHEN total_wickets = 10 THEN 120
                         ELSE legal_balls END) AS balls_bowled
            FROM legal_balls_per_innings
            GROUP BY bowling_team
        ),
        nrr_agg AS (
            SELECT team,
                   SUM(runs_scored) AS total_runs_scored,
                   SUM(balls_faced) AS total_balls_faced,
                   SUM(runs_conceded) AS total_runs_conceded,
                   SUM(balls_bowled) AS total_balls_bowled
            FROM nrr_data
            GROUP BY team
        )
        SELECT s.*,
               ROUND(
                   (n.total_runs_scored * 6.0 / NULLIF(n.total_balls_faced, 0))
                   - (n.total_runs_conceded * 6.0 / NULLIF(n.total_balls_bowled, 0)),
               3) AS nrr
        FROM standings s
        LEFT JOIN nrr_agg n ON s.team = n.team
        ORDER BY s.points DESC, nrr DESC
    """, params)

    # Normalize team names
    for row in rows:
        if row.get("team"):
            row["team"] = normalize_team(row["team"])

    return rows


@router.get("/{season:path}/cap-race")
def cap_race(season: str):
    """Orange cap (runs) and purple cap (wickets) race - cumulative match by match for top 5."""
    # Orange cap race
    orange = query("""
        WITH match_runs AS (
            SELECT d.batter AS player, m.match_id, m.date,
                   SUM(d.runs_batter) AS runs
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE m.season = ? AND d.is_super_over = false
            GROUP BY d.batter, m.match_id, m.date
        ),
        top_players AS (
            SELECT player FROM match_runs GROUP BY player ORDER BY SUM(runs) DESC LIMIT 5
        ),
        cumulative AS (
            SELECT mr.player, mr.match_id, mr.date, mr.runs,
                   SUM(mr.runs) OVER (PARTITION BY mr.player ORDER BY mr.date, mr.match_id) AS cumulative_runs
            FROM match_runs mr
            WHERE mr.player IN (SELECT player FROM top_players)
        )
        SELECT player, match_id, date, runs, cumulative_runs
        FROM cumulative
        ORDER BY player, date, match_id
    """, [season])

    # Purple cap race
    purple = query("""
        WITH match_wickets AS (
            SELECT d.bowler AS player, m.match_id, m.date,
                   SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE m.season = ? AND d.is_super_over = false
            GROUP BY d.bowler, m.match_id, m.date
        ),
        top_players AS (
            SELECT player FROM match_wickets GROUP BY player ORDER BY SUM(wickets) DESC LIMIT 5
        ),
        cumulative AS (
            SELECT mw.player, mw.match_id, mw.date, mw.wickets,
                   SUM(mw.wickets) OVER (PARTITION BY mw.player ORDER BY mw.date, mw.match_id) AS cumulative_wickets
            FROM match_wickets mw
            WHERE mw.player IN (SELECT player FROM top_players)
        )
        SELECT player, match_id, date, wickets, cumulative_wickets
        FROM cumulative
        ORDER BY player, date, match_id
    """, [season])

    return {"orange_cap_race": orange, "purple_cap_race": purple}
