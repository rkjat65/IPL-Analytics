"""Player endpoints: batting/bowling leaderboards, profiles, matchups."""

from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from ..database import query, normalize_team, team_variants
from ..player_resolve import resolve_player_name

PLAYER_IMAGES_DIR = Path(__file__).parent.parent / "player_images"
PLAYER_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
PLAYER_IMAGE_MEDIA = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}


def find_player_image_file(raw_name: str) -> Path | None:
    """Locate a file in player_images/ for display name or canonical DB name."""
    decoded = (raw_name or "").strip()
    if not decoded or not PLAYER_IMAGES_DIR.is_dir():
        return None

    candidates = [decoded]
    for role in ("bat", "bowl"):
        try:
            resolved = resolve_player_name(decoded, role)
            if resolved and resolved not in candidates:
                candidates.append(resolved)
        except Exception:
            continue

    for name in candidates:
        for ext in PLAYER_IMAGE_EXTS:
            path = PLAYER_IMAGES_DIR / f"{name}{ext}"
            if path.is_file():
                return path

    lower_index: dict[str, Path] = {}
    for f in PLAYER_IMAGES_DIR.iterdir():
        if f.suffix.lower() in PLAYER_IMAGE_EXTS and f.is_file():
            lower_index[f.stem.lower()] = f
    for name in candidates:
        hit = lower_index.get(name.lower())
        if hit:
            return hit
    return None


def _player_image_response(path: Path):
    ext = path.suffix.lower().lstrip(".")
    media = PLAYER_IMAGE_MEDIA.get(ext, "image/png")
    return FileResponse(path, media_type=media)

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/batting/leaderboard")
def batting_leaderboard(
    season: str | None = None,
    team: str | None = None,
    sort_by: str = Query("runs", pattern="^(runs|avg|sr|tsr|fifties|hundreds|sixes|fours|matches)$"),
    limit: int = Query(500, ge=1, le=1000),
    min_balls: int = Query(0, ge=0),
):
    season_filter_only = ""
    season_params_only = []
    if season:
        parts = [s.strip() for s in season.split(",") if s.strip()]
        if len(parts) == 1:
            season_filter_only += " AND m.season = ?"
            season_params_only.append(parts[0])
        else:
            ph = ", ".join(["?"] * len(parts))
            season_filter_only += f" AND m.season IN ({ph})"
            season_params_only.extend(parts)

    season_filter = season_filter_only
    params = list(season_params_only)
    if team:
        variants = team_variants(team)
        ph = ", ".join(["?"] * len(variants))
        season_filter += f" AND i.batting_team IN ({ph})"
        params.extend(variants)

    sort_map = {
        "runs": "runs DESC",
        "avg": "avg DESC NULLS LAST",
        "sr": "sr DESC",
        "tsr": "tsr DESC",
        "fifties": "fifties DESC",
        "hundreds": "hundreds DESC",
        "sixes": "sixes DESC",
        "fours": "fours DESC",
        "matches": "matches DESC"
    }
    order = sort_map.get(sort_by, "runs DESC")

    rows = query(f"""
        WITH match_runs AS (
            SELECT d.match_id,
                   SUM(d.runs_batter) AS match_total_bat_runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS match_total_bat_balls
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false {season_filter_only}
            GROUP BY d.match_id
        ),
        batting AS (
            SELECT d.batter AS player,
                   d.match_id,
                   SUM(d.runs_batter) AS runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
                   SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
                   MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS was_out
            FROM deliveries d
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false {season_filter}
            GROUP BY d.batter, d.match_id
        ),
        agg AS (
            SELECT b.player,
                   COUNT(DISTINCT b.match_id) AS matches,
                   COUNT(*) AS innings,
                   SUM(b.runs) AS runs,
                   MAX(b.runs) AS highest,
                   SUM(b.balls) AS balls,
                   SUM(b.fours) AS fours,
                   SUM(b.sixes) AS sixes,
                   SUM(b.was_out) AS dismissals,
                   SUM(CASE WHEN b.runs >= 50 AND b.runs < 100 THEN 1 ELSE 0 END) AS fifties,
                   SUM(CASE WHEN b.runs >= 100 THEN 1 ELSE 0 END) AS hundreds,
                   SUM(b.balls * (mr.match_total_bat_runs * 1.0 / NULLIF(mr.match_total_bat_balls, 0))) AS expected_runs
            FROM batting b
            JOIN match_runs mr ON b.match_id = mr.match_id
            GROUP BY b.player
        )
        SELECT player, matches, innings, runs, highest, balls, fours, sixes,
               fifties, hundreds,
               ROUND(runs * 1.0 / NULLIF(dismissals, 0), 2) AS avg,
               ROUND(runs * 100.0 / NULLIF(balls, 0), 2) AS sr,
               ROUND((runs - expected_runs) * 100.0 / NULLIF(balls, 0), 2) AS tsr
        FROM agg
        WHERE balls >= ?
        ORDER BY {order}
        LIMIT ?
    """, season_params_only + params + [min_balls if min_balls > 0 else 1, limit])
    return rows


@router.get("/bowling/leaderboard")
def bowling_leaderboard(
    season: str | None = None,
    team: str | None = None,
    sort_by: str = Query("wickets", pattern="^(wickets|avg|economy|ter|sr|five_wickets|four_wickets|matches)$"),
    limit: int = Query(500, ge=1, le=1000),
    min_balls: int = Query(0, ge=0),
):
    season_filter_only = ""
    season_params_only = []
    if season:
        parts = [s.strip() for s in season.split(",") if s.strip()]
        if len(parts) == 1:
            season_filter_only += " AND m.season = ?"
            season_params_only.append(parts[0])
        else:
            ph = ", ".join(["?"] * len(parts))
            season_filter_only += f" AND m.season IN ({ph})"
            season_params_only.extend(parts)

    season_filter = season_filter_only
    params = list(season_params_only)
    if team:
        variants = team_variants(team)
        ph = ", ".join(["?"] * len(variants))
        season_filter += f" AND i.bowling_team IN ({ph})"
        params.extend(variants)

    sort_map = {
        "wickets": "wickets DESC",
        "avg": "avg ASC NULLS LAST",
        "economy": "economy ASC",
        "ter": "ter ASC NULLS LAST",
        "sr": "sr ASC NULLS LAST",
        "five_wickets": "five_w DESC",
        "four_wickets": "four_w DESC",
        "matches": "matches DESC",
    }
    order = sort_map.get(sort_by, "wickets DESC")

    rows = query(f"""
        WITH match_runs AS (
            SELECT d.match_id,
                   SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS match_total_runs_conceded,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS match_total_balls_bowled
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false {season_filter_only}
            GROUP BY d.match_id
        ),
        bowling_match AS (
            SELECT d.bowler AS player,
                   d.match_id,
                   d.innings_number,
                   SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS runs_conceded,
                   SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls
            FROM deliveries d
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false {season_filter}
            GROUP BY d.bowler, d.match_id, d.innings_number
        ),
        best AS (
            SELECT player, match_id,
                   CONCAT(wickets, '/', runs_conceded) AS figures,
                   wickets AS fig_w, runs_conceded AS fig_r
            FROM bowling_match
        ),
        agg AS (
            SELECT bm.player,
                   COUNT(DISTINCT bm.match_id) AS matches,
                   COUNT(*) AS innings,
                   SUM(bm.legal_balls) AS total_legal_balls,
                   SUM(bm.runs_conceded) AS total_runs,
                   SUM(bm.wickets) AS wickets,
                   SUM(bm.legal_balls * (mr.match_total_runs_conceded * 1.0 / NULLIF(mr.match_total_balls_bowled, 0))) AS expected_runs_conceded
            FROM bowling_match bm
            JOIN match_runs mr ON bm.match_id = mr.match_id
            GROUP BY bm.player
        ),
        best_fig AS (
            SELECT player,
                   FIRST(figures ORDER BY fig_w DESC, fig_r ASC) AS best_figures
            FROM best
            GROUP BY player
        ),
        spell_wickets AS (
            SELECT player, match_id, wickets
            FROM bowling_match
        ),
        hauls AS (
            SELECT player,
                   SUM(CASE WHEN wickets >= 4 AND wickets < 5 THEN 1 ELSE 0 END) AS four_w,
                   SUM(CASE WHEN wickets >= 5 THEN 1 ELSE 0 END) AS five_w
            FROM spell_wickets
            GROUP BY player
        )
        SELECT a.player, a.matches, a.innings,
               CONCAT(CAST(a.total_legal_balls AS INTEGER) // 6, '.', CAST(a.total_legal_balls AS INTEGER) % 6) AS overs,
               a.wickets,
               ROUND(a.total_runs * 1.0 / NULLIF(a.wickets, 0), 2) AS avg,
               ROUND(a.total_runs * 6.0 / NULLIF(a.total_legal_balls, 0), 2) AS economy,
               ROUND(a.total_legal_balls * 1.0 / NULLIF(a.wickets, 0), 2) AS sr,
               ROUND((a.total_runs - a.expected_runs_conceded) * 6.0 / NULLIF(a.total_legal_balls, 0), 2) AS ter,
               bf.best_figures,
               COALESCE(h.four_w, 0) AS four_w,
               COALESCE(h.five_w, 0) AS five_w
        FROM agg a
        JOIN best_fig bf ON a.player = bf.player
        LEFT JOIN hauls h ON a.player = h.player
        WHERE a.total_legal_balls >= ?
        ORDER BY {order}
        LIMIT ?
    """, season_params_only + params + [min_balls if min_balls > 0 else 1, limit])
    return rows


@router.get("/available-images")
def available_images():
    """Return list of player names that have images uploaded."""
    if not PLAYER_IMAGES_DIR.is_dir():
        return []
    names = set()
    for f in PLAYER_IMAGES_DIR.iterdir():
        if f.suffix.lower() in PLAYER_IMAGE_EXTS and f.is_file():
            names.add(f.stem)
    return sorted(names)


@router.get("/{player_name}/image")
def player_image(player_name: str):
    """Serve player image from backend/player_images if present.

    Resolves display names via player_resolve (bat/bowl) and falls back to
    case-insensitive filename match so scorecard names map to files on disk.
    """
    path = find_player_image_file(player_name)
    if path:
        return _player_image_response(path)
    raise HTTPException(status_code=404, detail="No image available")


@router.get("/{name}/batting")
def batting_profile(name: str):
    db_name = resolve_player_name(name, "bat")
    # Career stats
    career = query("""
        WITH match_runs AS (
            SELECT d.match_id,
                   SUM(d.runs_batter) AS match_total_bat_runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS match_total_bat_balls
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false AND d.match_id IN (
                SELECT DISTINCT match_id FROM deliveries WHERE batter = ?
            )
            GROUP BY d.match_id
        ),
        batting AS (
            SELECT d.match_id,
                   SUM(d.runs_batter) AS runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
                   SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
                   MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS was_out
            FROM deliveries d
            WHERE d.batter = ? AND d.is_super_over = false
            GROUP BY d.match_id
        ),
        agg AS (
            SELECT COUNT(DISTINCT b.match_id) AS matches,
                   COUNT(*) AS innings,
                   SUM(b.runs) AS runs,
                   MAX(b.runs) AS highest,
                   SUM(b.balls) AS balls,
                   SUM(b.fours) AS fours,
                   SUM(b.sixes) AS sixes,
                   SUM(CASE WHEN b.runs >= 50 AND b.runs < 100 THEN 1 ELSE 0 END) AS fifties,
                   SUM(CASE WHEN b.runs >= 100 THEN 1 ELSE 0 END) AS hundreds,
                   SUM(b.was_out) AS dismissals,
                   SUM(b.balls * (mr.match_total_bat_runs * 1.0 / NULLIF(mr.match_total_bat_balls, 0))) AS expected_runs
            FROM batting b
            JOIN match_runs mr ON b.match_id = mr.match_id
        )
        SELECT matches, innings, runs, highest, balls, fours, sixes, fifties, hundreds, dismissals,
               ROUND(runs * 1.0 / NULLIF(dismissals, 0), 2) AS avg,
               ROUND(runs * 100.0 / NULLIF(balls, 0), 2) AS sr,
               ROUND((runs - expected_runs) * 100.0 / NULLIF(balls, 0), 2) AS tsr
        FROM agg
    """, [db_name, db_name])

    if not career or career[0]["matches"] is None or career[0]["matches"] == 0:
        raise HTTPException(404, f"No batting data for {db_name}")

    # Season-wise
    season_stats = query("""
        WITH batting AS (
            SELECT m.season, i.batting_team AS team, d.match_id,
                   SUM(d.runs_batter) AS runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
                   SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
                   SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
                   MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS was_out
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            WHERE d.batter = ? AND d.is_super_over = false
            GROUP BY m.season, i.batting_team, d.match_id
        )
        SELECT season, team,
               COUNT(*) AS innings,
               SUM(runs) AS runs,
               MAX(runs) AS highest,
               SUM(balls) AS balls,
               SUM(fours) AS fours,
               SUM(sixes) AS sixes,
               SUM(CASE WHEN runs >= 50 AND runs < 100 THEN 1 ELSE 0 END) AS fifties,
               SUM(CASE WHEN runs >= 100 THEN 1 ELSE 0 END) AS hundreds,
               SUM(was_out) AS dismissals,
               ROUND(SUM(runs) * 1.0 / NULLIF(SUM(was_out), 0), 2) AS avg,
               ROUND(SUM(runs) * 100.0 / NULLIF(SUM(balls), 0), 2) AS sr
        FROM batting
        GROUP BY season, team
        ORDER BY season, team
    """, [db_name])

    # Phase-wise (0-indexed: PP=0-5, middle=6-14, death=15-19)
    phase_stats = query("""
        SELECT
            CASE
                WHEN over_number <= 5 THEN 'powerplay'
                WHEN over_number <= 14 THEN 'middle'
                ELSE 'death'
            END AS phase,
            SUM(runs_batter) AS runs,
            COUNT(CASE WHEN extras_wides = 0 THEN 1 END) AS balls,
            ROUND(SUM(runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN extras_wides = 0 THEN 1 END), 0), 2) AS sr,
            SUM(CASE WHEN is_wicket AND player_dismissed = batter THEN 1 ELSE 0 END) AS dismissals,
            SUM(CASE WHEN runs_batter = 4 AND extras_wides = 0 THEN 1 ELSE 0 END) AS fours,
            SUM(CASE WHEN runs_batter = 6 AND extras_wides = 0 THEN 1 ELSE 0 END) AS sixes,
            SUM(CASE WHEN (runs_batter = 4 OR runs_batter = 6) AND extras_wides = 0 THEN 1 ELSE 0 END) AS boundaries,
            ROUND(SUM(runs_batter) * 1.0 / NULLIF(SUM(CASE WHEN is_wicket AND player_dismissed = batter THEN 1 ELSE 0 END), 0), 2) AS avg
        FROM deliveries
        WHERE batter = ? AND is_super_over = false
        GROUP BY phase
        ORDER BY CASE phase WHEN 'powerplay' THEN 1 WHEN 'middle' THEN 2 ELSE 3 END
    """, [db_name])

    # Vs teams
    vs_teams = query("""
        WITH batting AS (
            SELECT i.bowling_team AS opponent, d.match_id,
                   SUM(d.runs_batter) AS runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
                   MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS was_out
            FROM deliveries d
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            WHERE d.batter = ? AND d.is_super_over = false
            GROUP BY i.bowling_team, d.match_id
        )
        SELECT opponent,
               COUNT(*) AS innings,
               SUM(runs) AS runs,
               SUM(balls) AS balls,
               SUM(was_out) AS dismissals,
               ROUND(SUM(runs) * 1.0 / NULLIF(SUM(was_out), 0), 2) AS avg,
               ROUND(SUM(runs) * 100.0 / NULLIF(SUM(balls), 0), 2) AS sr
        FROM batting
        GROUP BY opponent
        ORDER BY runs DESC
    """, [db_name])

    # Recent form (last 10 innings)
    recent = query("""
        WITH batting AS (
            SELECT m.date, m.match_id, i.bowling_team AS opponent,
                   SUM(d.runs_batter) AS runs,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
                   MAX(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS was_out
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            WHERE d.batter = ? AND d.is_super_over = false
            GROUP BY m.date, m.match_id, i.bowling_team
        )
        SELECT date, match_id, opponent, runs, balls, was_out,
               ROUND(runs * 100.0 / NULLIF(balls, 0), 2) AS sr
        FROM batting
        ORDER BY date DESC
        LIMIT 10
    """, [db_name])

    # Normalize and merge vs_teams by canonical team name
    merged_vs = {}
    for row in vs_teams:
        opp = normalize_team(row["opponent"])
        if opp in merged_vs:
            m = merged_vs[opp]
            m["innings"] += row["innings"]
            m["runs"] += row["runs"]
            m["balls"] += row["balls"]
            m["dismissals"] += row["dismissals"]
            m["avg"] = round(m["runs"] / m["dismissals"], 2) if m["dismissals"] else None
            m["sr"] = round(m["runs"] * 100.0 / m["balls"], 2) if m["balls"] else None
        else:
            merged_vs[opp] = {**row, "opponent": opp}
    vs_teams_norm = sorted(merged_vs.values(), key=lambda x: x["runs"], reverse=True)

    # Normalize opponent in recent form
    for row in recent:
        if row.get("opponent"):
            row["opponent"] = normalize_team(row["opponent"])

    # Innings splits (Batting 1st vs Chasing)
    innings_splits = query("""
        SELECT
            i.innings_number,
            COUNT(DISTINCT d.match_id) AS matches,
            SUM(d.runs_batter) AS runs,
            COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
            SUM(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END) AS dismissals,
            ROUND(SUM(d.runs_batter) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket AND d.player_dismissed = d.batter THEN 1 ELSE 0 END), 0), 2) AS avg,
            ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS sr,
            SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
            SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes
        FROM deliveries d
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        WHERE d.batter = ? AND d.is_super_over = false
        GROUP BY i.innings_number
        ORDER BY i.innings_number
    """, [db_name])

    return {
        "player": db_name,
        "career": career[0],
        "seasons": season_stats,
        "phase_stats": phase_stats,
        "vs_teams": vs_teams_norm,
        "recent_form": recent,
        "innings_splits": innings_splits,
    }


@router.get("/{name}/bowling")
def bowling_profile(name: str):
    db_name = resolve_player_name(name, "bowl")
    # Career stats
    career = query("""
        WITH match_runs AS (
            SELECT d.match_id,
                   SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS match_total_runs_conceded,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS match_total_balls_bowled
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            WHERE d.is_super_over = false AND d.match_id IN (
                SELECT DISTINCT match_id FROM deliveries WHERE bowler = ?
            )
            GROUP BY d.match_id
        ),
        bowling AS (
            SELECT d.match_id, d.innings_number,
                   SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS runs_conceded,
                   SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 END) AS dots
            FROM deliveries d
            WHERE d.bowler = ? AND d.is_super_over = false
            GROUP BY d.match_id, d.innings_number
        ),
        agg AS (
            SELECT COUNT(DISTINCT b.match_id) AS matches,
                   COUNT(*) AS innings,
                   SUM(b.legal_balls) AS total_balls,
                   SUM(b.runs_conceded) AS runs_conceded,
                   SUM(b.wickets) AS wickets,
                   SUM(b.dots) AS dots,
                   SUM(b.legal_balls * (mr.match_total_runs_conceded * 1.0 / NULLIF(mr.match_total_balls_bowled, 0))) AS expected_runs_conceded,
                   SUM(CASE WHEN b.wickets >= 4 AND b.wickets < 5 THEN 1 ELSE 0 END) AS four_w,
                   SUM(CASE WHEN b.wickets >= 5 THEN 1 ELSE 0 END) AS five_w
            FROM bowling b
            JOIN match_runs mr ON b.match_id = mr.match_id
        )
        SELECT matches, innings, total_balls,
               CONCAT(CAST(total_balls AS INTEGER) // 6, '.', CAST(total_balls AS INTEGER) % 6) AS overs,
               runs_conceded, wickets, dots, four_w, five_w,
               ROUND(runs_conceded * 1.0 / NULLIF(wickets, 0), 2) AS avg,
               ROUND(runs_conceded * 6.0 / NULLIF(total_balls, 0), 2) AS economy,
               ROUND(total_balls * 1.0 / NULLIF(wickets, 0), 2) AS sr,
               ROUND((runs_conceded - expected_runs_conceded) * 6.0 / NULLIF(total_balls, 0), 2) AS ter
        FROM agg
    """, [db_name, db_name])

    if not career or career[0]["matches"] is None or career[0]["matches"] == 0:
        raise HTTPException(404, f"No bowling data for {db_name}")

    # Best figures
    best = query("""
        SELECT d.match_id,
               SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS w,
               SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS r
        FROM deliveries d
        WHERE d.bowler = ? AND d.is_super_over = false
        GROUP BY d.match_id, d.innings_number
        ORDER BY w DESC, r ASC
        LIMIT 1
    """, [db_name])
    career[0]["best_figures"] = f"{best[0]['w']}/{best[0]['r']}" if best else "0/0"

    # Season-wise
    season_stats = query("""
        WITH bowling AS (
            SELECT m.season, i.bowling_team AS team, d.match_id, d.innings_number,
                   SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS runs_conceded,
                   SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls
            FROM deliveries d
            JOIN matches m ON d.match_id = m.match_id
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            WHERE d.bowler = ? AND d.is_super_over = false
            GROUP BY m.season, i.bowling_team, d.match_id, d.innings_number
        )
        SELECT season, team,
               COUNT(*) AS innings,
               SUM(legal_balls) AS total_balls,
               CONCAT(CAST(SUM(legal_balls) AS INTEGER) // 6, '.', CAST(SUM(legal_balls) AS INTEGER) % 6) AS overs,
               SUM(runs_conceded) AS runs_conceded,
               SUM(wickets) AS wickets,
               ROUND(SUM(runs_conceded) * 1.0 / NULLIF(SUM(wickets), 0), 2) AS avg,
               ROUND(SUM(runs_conceded) * 6.0 / NULLIF(SUM(legal_balls), 0), 2) AS economy,
               ROUND(SUM(legal_balls) * 1.0 / NULLIF(SUM(wickets), 0), 2) AS sr
        FROM bowling
        GROUP BY season, team
        ORDER BY season, team
    """, [db_name])

    # Phase-wise
    phase_stats = query("""
        SELECT
            CASE
                WHEN over_number <= 5 THEN 'powerplay'
                WHEN over_number <= 14 THEN 'middle'
                ELSE 'death'
            END AS phase,
            COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS legal_balls,
            CONCAT(CAST(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS INTEGER) // 6, '.', CAST(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS INTEGER) % 6) AS overs,
            SUM(runs_batter + extras_wides + extras_noballs) AS runs_conceded,
            SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
            ROUND(SUM(runs_batter + extras_wides + extras_noballs) * 6.0 / NULLIF(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END), 0), 2) AS economy,
            ROUND(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 AND runs_batter = 0 AND runs_extras = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END), 0), 2) AS dot_pct
        FROM deliveries
        WHERE bowler = ? AND is_super_over = false
        GROUP BY phase
        ORDER BY CASE phase WHEN 'powerplay' THEN 1 WHEN 'middle' THEN 2 ELSE 3 END
    """, [db_name])

    # Vs teams
    vs_teams = query("""
        WITH bowling AS (
            SELECT i.batting_team AS opponent, d.match_id, d.innings_number,
                   SUM(d.runs_conceded) AS runs_conceded,
                   SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
                   COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls
            FROM (
                SELECT match_id, innings_number, bowler, runs_batter + extras_wides + extras_noballs AS runs_conceded, is_wicket, dismissal_kind, extras_wides, extras_noballs
                FROM deliveries
            ) d
            JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
            WHERE d.bowler = ? AND is_super_over = false
            GROUP BY i.batting_team, d.match_id, d.innings_number
        )
        SELECT opponent,
               COUNT(*) AS innings,
               SUM(runs_conceded) AS runs_conceded,
               SUM(wickets) AS wickets,
               SUM(legal_balls) AS legal_balls,
               ROUND(SUM(runs_conceded) * 1.0 / NULLIF(SUM(wickets), 0), 2) AS avg,
               ROUND(SUM(runs_conceded) * 6.0 / NULLIF(SUM(legal_balls), 0), 2) AS economy
        FROM bowling
        GROUP BY opponent
        ORDER BY wickets DESC
    """, [db_name])

    # Dismissal types
    dismissal_types = query("""
        SELECT dismissal_kind, COUNT(*) AS count
        FROM deliveries
        WHERE bowler = ? AND is_wicket = true AND is_super_over = false
          AND dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field')
        GROUP BY dismissal_kind
        ORDER BY count DESC
    """, [db_name])

    # Normalize and merge vs_teams by canonical team name
    merged_vs = {}
    for row in vs_teams:
        opp = normalize_team(row["opponent"])
        if opp in merged_vs:
            m = merged_vs[opp]
            m["innings"] += row["innings"]
            m["runs_conceded"] += row["runs_conceded"]
            m["wickets"] += row["wickets"]
            m["legal_balls"] += row["legal_balls"]
            m["avg"] = round(m["runs_conceded"] / m["wickets"], 2) if m["wickets"] else None
            m["economy"] = round(m["runs_conceded"] * 6.0 / m["legal_balls"], 2) if m["legal_balls"] else None
        else:
            merged_vs[opp] = {**row, "opponent": opp}
    vs_teams_norm = sorted(merged_vs.values(), key=lambda x: x["wickets"], reverse=True)

    # Innings splits (Bowling 1st vs Chasing/Defending)
    innings_splits = query("""
        SELECT
            i.innings_number,
            COUNT(DISTINCT d.match_id) AS matches,
            SUM(d.runs_batter + d.extras_wides + d.extras_noballs) AS runs_conceded,
            SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
            COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS legal_balls,
            ROUND(SUM(d.runs_batter + d.extras_wides + d.extras_noballs) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END), 0), 2) AS avg,
            ROUND(SUM(d.runs_batter + d.extras_wides + d.extras_noballs) * 6.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS economy,
            ROUND(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END), 0), 2) AS sr
        FROM deliveries d
        JOIN innings i ON d.match_id = i.match_id AND d.innings_number = i.innings_number
        WHERE d.bowler = ? AND d.is_super_over = false
        GROUP BY i.innings_number
        ORDER BY i.innings_number
    """, [db_name])

    return {
        "player": db_name,
        "career": career[0],
        "seasons": season_stats,
        "phase_stats": phase_stats,
        "vs_teams": vs_teams_norm,
        "dismissal_types": dismissal_types,
        "innings_splits": innings_splits,
    }


@router.get("/{name}/matchups/batting")
def batting_matchups(name: str):
    rows = query("""
        SELECT bowler,
               COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS balls,
               SUM(runs_batter) AS runs,
               SUM(CASE WHEN extras_wides = 0 AND extras_noballs = 0 AND runs_batter = 0 AND runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
               SUM(CASE WHEN runs_batter = 4 AND extras_wides = 0 AND extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
               SUM(CASE WHEN runs_batter = 6 AND extras_wides = 0 AND extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
               SUM(CASE WHEN is_wicket AND player_dismissed = batter THEN 1 ELSE 0 END) AS dismissals,
               ROUND(SUM(runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END), 0), 2) AS sr
        FROM deliveries
        WHERE batter = ? AND is_super_over = false
        GROUP BY bowler
        HAVING COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) >= 6
        ORDER BY balls DESC
    """, [name])
    return rows


@router.get("/{name}/matchups/bowling")
def bowling_matchups(name: str):
    rows = query("""
        SELECT batter,
               COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) AS balls,
               SUM(runs_batter) AS runs,
               SUM(CASE WHEN extras_wides = 0 AND extras_noballs = 0 AND runs_batter = 0 AND runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
               SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS wickets,
               ROUND(SUM(runs_batter + extras_wides + extras_noballs) * 6.0 / NULLIF(COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END), 0), 2) AS economy
        FROM deliveries
        WHERE bowler = ? AND is_super_over = false
        GROUP BY batter
        HAVING COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END) >= 6
        ORDER BY balls DESC
    """, [name])
    return rows


@router.get("/matchup/{batter}/{bowler}")
def player_matchup(batter: str, bowler: str):
    db_batter = resolve_player_name(batter, "bat")
    db_bowler = resolve_player_name(bowler, "bowl")

    # Overall Summary
    overall_rows = query("""
        SELECT
            COUNT(DISTINCT d.match_id) AS matches,
            COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
            SUM(d.runs_batter) AS runs,
            SUM(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
            SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
            SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
            SUM(CASE WHEN d.is_wicket AND d.player_dismissed = ? THEN 1 ELSE 0 END) AS dismissals,
            SUM(CASE WHEN d.is_wicket AND d.dismissal_kind NOT IN ('run out','retired hurt','retired out','obstructing the field') THEN 1 ELSE 0 END) AS bowler_wickets,
            ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS sr,
            ROUND(SUM(d.runs_batter) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket AND d.player_dismissed = ? THEN 1 ELSE 0 END), 0), 2) AS avg
        FROM deliveries d
        WHERE d.batter = ? AND d.bowler = ? AND d.is_super_over = false
    """, [db_batter, db_batter, db_batter, db_bowler])

    summary = {
        "matches": 0,
        "balls": 0,
        "runs": 0,
        "dots": 0,
        "fours": 0,
        "sixes": 0,
        "dismissals": 0,
        "bowler_wickets": 0,
        "sr": 0.0,
        "avg": None,
        "dot_pct": 0.0,
        "boundary_pct": 0.0
    }
    if overall_rows and overall_rows[0]["balls"] is not None and overall_rows[0]["balls"] > 0:
        row = overall_rows[0]
        balls = row["balls"]
        dots = row["dots"] or 0
        fours = row["fours"] or 0
        sixes = row["sixes"] or 0
        summary = {
            "matches": row["matches"] or 0,
            "balls": balls,
            "runs": row["runs"] or 0,
            "dots": dots,
            "fours": fours,
            "sixes": sixes,
            "dismissals": row["dismissals"] or 0,
            "bowler_wickets": row["bowler_wickets"] or 0,
            "sr": row["sr"] or 0.0,
            "avg": row["avg"],
            "dot_pct": round(dots * 100.0 / balls, 2),
            "boundary_pct": round((fours + sixes) * 100.0 / balls, 2)
        }

    # Phase-wise splits
    phase_rows = query("""
        SELECT
            CASE
                WHEN d.over_number <= 5 THEN 'powerplay'
                WHEN d.over_number <= 14 THEN 'middle'
                ELSE 'death'
            END AS phase,
            COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
            SUM(d.runs_batter) AS runs,
            SUM(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 AND d.runs_batter = 0 AND d.runs_extras = 0 THEN 1 ELSE 0 END) AS dots,
            SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
            SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes,
            SUM(CASE WHEN d.is_wicket AND d.player_dismissed = ? THEN 1 ELSE 0 END) AS dismissals,
            ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS sr,
            ROUND(SUM(d.runs_batter) * 1.0 / NULLIF(SUM(CASE WHEN d.is_wicket AND d.player_dismissed = ? THEN 1 ELSE 0 END), 0), 2) AS avg
        FROM deliveries d
        WHERE d.batter = ? AND d.bowler = ? AND d.is_super_over = false
        GROUP BY phase
        ORDER BY CASE phase WHEN 'powerplay' THEN 1 WHEN 'middle' THEN 2 ELSE 3 END
    """, [db_batter, db_batter, db_batter, db_bowler])

    phases = []
    for row in phase_rows:
        balls = row["balls"] or 0
        dots = row["dots"] or 0
        fours = row["fours"] or 0
        sixes = row["sixes"] or 0
        phases.append({
            "phase": row["phase"],
            "balls": balls,
            "runs": row["runs"] or 0,
            "dots": dots,
            "fours": fours,
            "sixes": sixes,
            "dismissals": row["dismissals"] or 0,
            "sr": row["sr"] or 0.0,
            "avg": row["avg"],
            "dot_pct": round(dots * 100.0 / balls, 2) if balls > 0 else 0.0,
            "boundary_pct": round((fours + sixes) * 100.0 / balls, 2) if balls > 0 else 0.0
        })

    # Season splits
    season_rows = query("""
        SELECT
            m.season,
            COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
            SUM(d.runs_batter) AS runs,
            SUM(CASE WHEN d.is_wicket AND d.player_dismissed = ? THEN 1 ELSE 0 END) AS dismissals,
            ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END), 0), 2) AS sr
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.batter = ? AND d.bowler = ? AND d.is_super_over = false
        GROUP BY m.season
        ORDER BY m.season
    """, [db_batter, db_batter, db_bowler])

    # Match History Log
    history_rows = query("""
        SELECT
            m.match_id,
            m.date,
            m.season,
            m.team1,
            m.team2,
            m.venue,
            COUNT(CASE WHEN d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 END) AS balls,
            SUM(d.runs_batter) AS runs,
            SUM(CASE WHEN d.is_wicket AND d.player_dismissed = ? THEN 1 ELSE 0 END) AS dismissals,
            SUM(CASE WHEN d.runs_batter = 4 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS fours,
            SUM(CASE WHEN d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0 THEN 1 ELSE 0 END) AS sixes
        FROM deliveries d
        JOIN matches m ON d.match_id = m.match_id
        WHERE d.batter = ? AND d.bowler = ? AND d.is_super_over = false
        GROUP BY m.match_id, m.date, m.season, m.team1, m.team2, m.venue
        ORDER BY m.date DESC
    """, [db_batter, db_batter, db_bowler])

    history = []
    for row in history_rows:
        history.append({
            "match_id": row["match_id"],
            "date": str(row["date"]) if row["date"] else None,
            "season": row["season"],
            "team1": normalize_team(row["team1"]),
            "team2": normalize_team(row["team2"]),
            "venue": row["venue"],
            "balls": row["balls"] or 0,
            "runs": row["runs"] or 0,
            "dismissals": row["dismissals"] or 0,
            "fours": row["fours"] or 0,
            "sixes": row["sixes"] or 0
        })

    return {
        "batter": db_batter,
        "bowler": db_bowler,
        "summary": summary,
        "phases": phases,
        "seasons": season_rows,
        "history": history
    }
