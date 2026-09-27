"""Team endpoints: stats, seasons, head-to-head, comparison."""

from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from ..database import query, normalize_team, team_variants, SUPER_OVER_WINNER_CTE, VENUE_NORM_SQL

TEAM_IMAGES_DIR = Path(__file__).parent.parent / "team_images"

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("/compare")
def compare_teams(team1: str = Query(...), team2: str = Query(...)):
    """Detailed comparison between two teams."""
    def _team_stats(team):
        v = team_variants(team)
        ph = ", ".join(["?"] * len(v))
        return query(f"""
            WITH team_matches AS (
                SELECT m.match_id, m.season, m.winner, m.team1, m.team2, m.result
                FROM matches m
                WHERE m.team1 IN ({ph}) OR m.team2 IN ({ph})
            ),
            {SUPER_OVER_WINNER_CTE},
            resolved AS (
                SELECT tm.*,
                    COALESCE(tm.winner, sow.so_winner) AS effective_winner
                FROM team_matches tm
                LEFT JOIN super_over_winners sow ON tm.match_id = sow.match_id
            )
            SELECT
                COUNT(*) AS matches,
                SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN effective_winner IS NOT NULL AND effective_winner NOT IN ({ph}) THEN 1 ELSE 0 END) AS losses,
                SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS ties,
                SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_results,
                ROUND(SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN result != 'no result' THEN 1 ELSE 0 END), 0), 2) AS win_pct
            FROM resolved
        """, v * 5)[0]

    s1, s2 = _team_stats(team1), _team_stats(team2)

    v1, v2 = team_variants(team1), team_variants(team2)
    ph1, ph2 = ", ".join(["?"] * len(v1)), ", ".join(["?"] * len(v2))

    # H2H match filter condition (reused across queries)
    h2h_where = f"(team1 IN ({ph1}) AND team2 IN ({ph2})) OR (team1 IN ({ph2}) AND team2 IN ({ph1}))"
    h2h_params = v1 + v2 + v2 + v1

    # H2H batting stats (avg/highest/lowest only from H2H matches)
    def _h2h_batting(team_v, team_ph):
        return query(f"""
            SELECT
                ROUND(AVG(i.total_runs), 2) AS avg_score,
                MAX(i.total_runs) AS highest_total,
                MIN(i.total_runs) AS lowest_total
            FROM innings i
            JOIN matches m ON i.match_id = m.match_id
            WHERE i.batting_team IN ({team_ph})
              AND i.is_super_over = false
              AND m.result != 'no result'
              AND ({h2h_where})
        """, team_v + h2h_params)[0]

    b1 = _h2h_batting(v1, ph1)
    b2 = _h2h_batting(v2, ph2)

    # Overall H2H record (with super over resolution)
    h2h = query(f"""
        WITH h2h_matches AS (
            SELECT m.match_id, m.winner, m.result
            FROM matches m
            WHERE {h2h_where}
        ),
        {SUPER_OVER_WINNER_CTE},
        resolved AS (
            SELECT hm.*,
                COALESCE(hm.winner, sow.so_winner) AS effective_winner
            FROM h2h_matches hm
            LEFT JOIN super_over_winners sow ON hm.match_id = sow.match_id
        )
        SELECT
            COUNT(*) AS played,
            SUM(CASE WHEN effective_winner IN ({ph1}) THEN 1 ELSE 0 END) AS team1_wins,
            SUM(CASE WHEN effective_winner IN ({ph2}) THEN 1 ELSE 0 END) AS team2_wins,
            SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS ties,
            SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_results
        FROM resolved
    """, h2h_params + v1 + v2)

    # Season-wise H2H breakdown (with super over resolution)
    season_wise_h2h = query(f"""
        WITH h2h_matches AS (
            SELECT m.match_id, m.season, m.winner, m.result
            FROM matches m
            WHERE {h2h_where}
        ),
        {SUPER_OVER_WINNER_CTE},
        resolved AS (
            SELECT hm.*,
                COALESCE(hm.winner, sow.so_winner) AS effective_winner
            FROM h2h_matches hm
            LEFT JOIN super_over_winners sow ON hm.match_id = sow.match_id
        )
        SELECT
            season,
            SUM(CASE WHEN effective_winner IN ({ph1}) THEN 1 ELSE 0 END) AS team1_wins,
            SUM(CASE WHEN effective_winner IN ({ph2}) THEN 1 ELSE 0 END) AS team2_wins,
            SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS ties,
            SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_results
        FROM resolved
        GROUP BY season
        ORDER BY season
    """, h2h_params + v1 + v2)

    # Recent matches (last 10) between the two teams
    recent_matches_raw = query(f"""
        SELECT
            m.date,
            m.season,
            m.winner,
            m.result,
            m.venue,
            m.win_by_runs,
            m.win_by_wickets,
            i1.batting_team AS innings1_team,
            i1.total_runs AS innings1_score,
            i2.batting_team AS innings2_team,
            i2.total_runs AS innings2_score
        FROM matches m
        LEFT JOIN (
            SELECT match_id, batting_team, total_runs,
                   ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY batting_team) AS rn
            FROM innings
            WHERE is_super_over = false
        ) i1 ON m.match_id = i1.match_id AND i1.rn = 1
        LEFT JOIN (
            SELECT match_id, batting_team, total_runs,
                   ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY batting_team) AS rn
            FROM innings
            WHERE is_super_over = false
        ) i2 ON m.match_id = i2.match_id AND i2.rn = 2
        WHERE {h2h_where}
        ORDER BY m.date DESC
        LIMIT 10
    """, h2h_params)

    canonical1, canonical2 = normalize_team(team1), normalize_team(team2)

    # Normalise recent match rows so team1_score/team2_score align to canonical names
    recent_matches = []
    for rm in recent_matches_raw:
        t1_score, t2_score = None, None
        inn1_team_norm = normalize_team(rm["innings1_team"]) if rm["innings1_team"] else None
        inn2_team_norm = normalize_team(rm["innings2_team"]) if rm["innings2_team"] else None
        if inn1_team_norm == canonical1:
            t1_score = rm["innings1_score"]
            t2_score = rm["innings2_score"]
        elif inn1_team_norm == canonical2:
            t1_score = rm["innings2_score"]
            t2_score = rm["innings1_score"]
        else:
            # Fallback: check innings2
            if inn2_team_norm == canonical1:
                t1_score = rm["innings2_score"]
                t2_score = rm["innings1_score"]
            else:
                t1_score = rm["innings1_score"]
                t2_score = rm["innings2_score"]

        # Determine result label
        result_label = rm.get("result", "")
        margin = None
        if result_label == "tie":
            margin = "Super Over"
        elif result_label == "no result":
            margin = "No Result"
        elif rm.get("win_by_runs"):
            margin = f"{rm['win_by_runs']} runs"
        elif rm.get("win_by_wickets"):
            margin = f"{rm['win_by_wickets']} wickets"

        recent_matches.append({
            "date": str(rm["date"]) if rm["date"] else None,
            "season": rm["season"],
            "winner": normalize_team(rm["winner"]) if rm["winner"] else None,
            "result": result_label,
            "team1_score": t1_score,
            "team2_score": t2_score,
            "venue": rm["venue"],
            "margin": margin,
        })

    # Toss stats from H2H matches
    toss_stats_row = query(f"""
        SELECT
            SUM(CASE WHEN toss_winner IN ({ph1}) THEN 1 ELSE 0 END) AS team1_toss_wins,
            SUM(CASE WHEN toss_winner IN ({ph2}) THEN 1 ELSE 0 END) AS team2_toss_wins,
            SUM(CASE WHEN
                (toss_winner = winner AND toss_decision = 'bat')
                OR (toss_winner != winner AND toss_decision = 'field')
                THEN 1 ELSE 0 END) AS bat_first_wins,
            SUM(CASE WHEN
                (toss_winner = winner AND toss_decision = 'field')
                OR (toss_winner != winner AND toss_decision = 'bat')
                THEN 1 ELSE 0 END) AS chase_wins
        FROM matches
        WHERE winner IS NOT NULL AND ({h2h_where})
    """, v1 + v2 + h2h_params)
    toss_stats = toss_stats_row[0] if toss_stats_row else {}

    # Average H2H scores (average score each team posts against the other)
    avg_h2h_row = query(f"""
        SELECT
            ROUND(AVG(CASE WHEN i.batting_team IN ({ph1}) THEN i.total_runs END), 2) AS team1_avg,
            ROUND(AVG(CASE WHEN i.batting_team IN ({ph2}) THEN i.total_runs END), 2) AS team2_avg
        FROM innings i
        JOIN matches m ON i.match_id = m.match_id
        WHERE i.is_super_over = false
          AND ({h2h_where})
    """, v1 + v2 + h2h_params)
    avg_h2h = avg_h2h_row[0] if avg_h2h_row else {"team1_avg": None, "team2_avg": None}

    # Top Batters in this H2H
    top_batters = query(f"""
        SELECT d.batter AS player,
               COUNT(DISTINCT d.match_id) AS matches,
               SUM(d.runs_batter) AS runs,
               ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS sr
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE ({h2h_where}) AND d.is_super_over = false
        GROUP BY d.batter
        ORDER BY runs DESC
        LIMIT 5
    """, h2h_params)

    # Top Bowlers in this H2H
    top_bowlers = query(f"""
        SELECT d.bowler AS player,
               COUNT(DISTINCT d.match_id) AS matches,
               SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field') THEN 1 ELSE 0 END) AS wickets,
               ROUND(SUM(d.runs_batter + d.runs_extras) * 6.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS economy
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE ({h2h_where}) AND d.is_super_over = false
        GROUP BY d.bowler
        ORDER BY wickets DESC
        LIMIT 5
    """, h2h_params)

    # Venue Breakdown in this H2H
    venue_stats = query(f"""
        SELECT ({VENUE_NORM_SQL}) AS venue,
               COUNT(*) AS played,
               SUM(CASE WHEN winner IN ({ph1}) THEN 1 ELSE 0 END) AS team1_wins,
               SUM(CASE WHEN winner IN ({ph2}) THEN 1 ELSE 0 END) AS team2_wins
        FROM matches
        WHERE ({h2h_where}) AND winner IS NOT NULL
        GROUP BY ({VENUE_NORM_SQL})
        ORDER BY played DESC
    """, v1 + v2 + h2h_params)

    # Phase Dominance in this H2H
    def _phase_stats(team_v, team_ph):
        return query(f"""
            SELECT
                CASE
                    WHEN d.over_number <= 5 THEN 'powerplay'
                    WHEN d.over_number <= 14 THEN 'middle'
                    ELSE 'death'
                END AS phase,
                ROUND(SUM(d.runs_total) * 6.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS rr
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            WHERE i.batting_team IN ({team_ph})
              AND ({h2h_where})
              AND d.is_super_over = false
            GROUP BY phase
        """, team_v + h2h_params)

    p1 = _phase_stats(v1, ph1)
    p2 = _phase_stats(v2, ph2)

    return {
        "team1": {"name": canonical1, **s1, **b1, "phases": {p["phase"]: p["rr"] for p in p1}},
        "team2": {"name": canonical2, **s2, **b2, "phases": {p["phase"]: p["rr"] for p in p2}},
        "head_to_head": h2h[0] if h2h else {},
        "season_wise_h2h": season_wise_h2h,
        "recent_matches": recent_matches,
        "toss_stats": toss_stats,
        "avg_h2h_scores": avg_h2h,
        "top_batters": top_batters,
        "top_bowlers": top_bowlers,
        "venue_stats": venue_stats,
    }




@router.get("/{name}/stats")
def team_stats(name: str):
    variants = team_variants(name)
    ph = ", ".join(["?"] * len(variants))

    stats = query(f"""
        WITH team_matches AS (
            SELECT m.match_id, m.season, m.winner, m.result
            FROM matches m
            WHERE m.team1 IN ({ph}) OR m.team2 IN ({ph})
        ),
        {SUPER_OVER_WINNER_CTE},
        resolved AS (
            SELECT tm.*,
                COALESCE(tm.winner, sow.so_winner) AS effective_winner
            FROM team_matches tm
            LEFT JOIN super_over_winners sow ON tm.match_id = sow.match_id
        )
        SELECT
            COUNT(*) AS matches,
            SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN effective_winner IS NOT NULL AND effective_winner NOT IN ({ph}) THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS ties,
            SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_results,
            ROUND(SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN result != 'no result' THEN 1 ELSE 0 END), 0), 2) AS win_pct,
            COUNT(DISTINCT season) AS seasons_played
        FROM resolved
    """, variants * 5)

    # Titles (finals won - approximate: last match of each season where team won)
    titles = query(f"""
        WITH season_last AS (
            SELECT season, MAX(date) AS last_date
            FROM matches
            GROUP BY season
        )
        SELECT COUNT(*) AS titles
        FROM matches m
        JOIN season_last sl ON m.season = sl.season AND m.date = sl.last_date
        WHERE m.winner IN ({ph})
    """, variants)

    avg_score = query(f"""
        SELECT ROUND(AVG(i.total_runs), 2) AS avg_score
        FROM innings i
        JOIN matches m ON i.match_id = m.match_id
        WHERE i.batting_team IN ({ph}) AND i.is_super_over = false
          AND m.result != 'no result'
    """, variants)

    result = stats[0] if stats else {}
    result["titles"] = titles[0]["titles"] if titles else 0
    result["avg_score"] = avg_score[0]["avg_score"] if avg_score else 0
    return result


@router.get("/{name}/seasons")
def team_seasons(name: str):
    variants = team_variants(name)
    ph = ", ".join(["?"] * len(variants))
    rows = query(f"""
        WITH team_matches AS (
            SELECT m.match_id, m.season, m.winner, m.result
            FROM matches m
            WHERE m.team1 IN ({ph}) OR m.team2 IN ({ph})
        ),
        {SUPER_OVER_WINNER_CTE},
        resolved AS (
            SELECT tm.*,
                COALESCE(tm.winner, sow.so_winner) AS effective_winner
            FROM team_matches tm
            LEFT JOIN super_over_winners sow ON tm.match_id = sow.match_id
        )
        SELECT season,
               COUNT(*) AS matches,
               SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN effective_winner IS NOT NULL AND effective_winner NOT IN ({ph}) THEN 1 ELSE 0 END) AS losses,
               SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS ties,
               SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_results,
               ROUND(SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN result != 'no result' THEN 1 ELSE 0 END), 0), 2) AS win_pct
        FROM resolved
        GROUP BY season
        ORDER BY season
    """, variants * 5)
    return rows


@router.get("/{name}/h2h")
def head_to_head(name: str):
    variants = team_variants(name)
    ph = ", ".join(["?"] * len(variants))
    rows = query(f"""
        WITH base AS (
            SELECT m.match_id,
                CASE WHEN m.team1 IN ({ph}) THEN m.team2 ELSE m.team1 END AS opponent,
                m.winner, m.result
            FROM matches m
            WHERE m.team1 IN ({ph}) OR m.team2 IN ({ph})
        ),
        {SUPER_OVER_WINNER_CTE},
        resolved AS (
            SELECT b.opponent, b.result,
                COALESCE(b.winner, sow.so_winner) AS effective_winner
            FROM base b
            LEFT JOIN super_over_winners sow ON b.match_id = sow.match_id
        )
        SELECT opponent,
               COUNT(*) AS played,
               SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) AS won,
               SUM(CASE WHEN effective_winner IS NOT NULL AND effective_winner NOT IN ({ph}) THEN 1 ELSE 0 END) AS lost,
               SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) AS ties,
               SUM(CASE WHEN result = 'no result' THEN 1 ELSE 0 END) AS no_results,
               ROUND(SUM(CASE WHEN effective_winner IN ({ph}) THEN 1 ELSE 0 END) * 100.0 / NULLIF(SUM(CASE WHEN result != 'no result' THEN 1 ELSE 0 END), 0), 2) AS win_pct
        FROM resolved
        GROUP BY opponent
        ORDER BY played DESC
    """, variants * 6)

    # Normalize opponent names and merge rows for same canonical team
    merged = {}
    for row in rows:
        opp = normalize_team(row["opponent"])
        if opp in merged:
            m = merged[opp]
            m["played"] += row["played"]
            m["won"] += row["won"]
            m["lost"] += row["lost"]
            m["ties"] = m.get("ties", 0) + row.get("ties", 0)
            m["no_results"] = m.get("no_results", 0) + row.get("no_results", 0)
            decisive = m["played"] - m.get("no_results", 0)
            m["win_pct"] = round(m["won"] * 100.0 / decisive, 2) if decisive else None
        else:
            merged[opp] = {**row, "opponent": opp}
    return sorted(merged.values(), key=lambda x: x["played"], reverse=True)


@router.get("/{team_name}/image")
def team_image(team_name: str):
    """Serve team logo image if available, else 404."""
    decoded = team_name.strip()
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        path = TEAM_IMAGES_DIR / f"{decoded}{ext}"
        if path.is_file():
            media = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}
            return FileResponse(path, media_type=media.get(ext.lstrip("."), "image/png"))
    raise HTTPException(status_code=404, detail="No image available")
