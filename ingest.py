"""
Phase 1 – IPL Cricsheet JSON → DuckDB Ingestion Pipeline
=========================================================
Reads all Cricsheet-format JSON files from a directory, flattens the nested
innings → overs → deliveries hierarchy, and loads four normalised tables into
a local DuckDB database file.

Tables created
--------------
  matches    – one row per match
  innings    – one row per innings
  deliveries – one row per ball (with extras + wicket columns unpacked)
  players    – unique player registry (name + cricsheet people-id)

Usage
-----
  python ingest.py                           # defaults: ipl_json/  →  ipl.duckdb
  python ingest.py --src ipl_json --db ipl.duckdb
  python ingest.py --src ipl_json --db ipl.duckdb --reset
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import logging
import statistics
import sys
from pathlib import Path
from typing import Any

import duckdb
import orjson
import pandas as pd
from tqdm import tqdm

logging.basicConfig(
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema DDL
# ---------------------------------------------------------------------------

DDL_MATCHES = """
CREATE TABLE IF NOT EXISTS matches (
    match_id        VARCHAR PRIMARY KEY,
    data_version    VARCHAR,
    created_date    DATE,
    season          VARCHAR,
    match_type      VARCHAR,
    gender          VARCHAR,
    team_type       VARCHAR,
    event_name      VARCHAR,
    match_number    INTEGER,
    date            DATE,
    city            VARCHAR,
    venue           VARCHAR,
    team1           VARCHAR,
    team2           VARCHAR,
    toss_winner     VARCHAR,
    toss_decision   VARCHAR,
    winner          VARCHAR,
    win_by_runs     INTEGER,
    win_by_wickets  INTEGER,
    result          VARCHAR,        -- 'tie' | 'no result' | 'win'
    player_of_match VARCHAR,
    balls_per_over  INTEGER,
    umpire1         VARCHAR,
    umpire2         VARCHAR,
    event_group     VARCHAR,
    event_stage     VARCHAR
);
"""

DDL_INNINGS = """
CREATE TABLE IF NOT EXISTS innings (
    match_id        VARCHAR,
    innings_number  INTEGER,
    is_super_over   BOOLEAN,   -- TRUE for Super Over innings
    batting_team    VARCHAR,
    bowling_team    VARCHAR,
    total_runs      INTEGER,
    total_wickets   INTEGER,
    total_balls     INTEGER,
    PRIMARY KEY (match_id, innings_number)
);
"""

DDL_DELIVERIES = """
CREATE TABLE IF NOT EXISTS deliveries (
    delivery_id         BIGINT PRIMARY KEY,
    match_id            VARCHAR,
    innings_number      INTEGER,
    is_super_over       BOOLEAN,   -- TRUE for Super Over innings (not counted in standard career stats)
    over_number         INTEGER,
    ball_number         INTEGER,
    batter              VARCHAR,
    bowler              VARCHAR,
    non_striker         VARCHAR,
    runs_batter         INTEGER,
    runs_extras         INTEGER,
    runs_total          INTEGER,
    extras_wides        INTEGER,
    extras_noballs      INTEGER,
    extras_byes         INTEGER,
    extras_legbyes      INTEGER,
    extras_penalty      INTEGER,
    is_wicket           BOOLEAN,
    player_dismissed    VARCHAR,
    dismissal_kind      VARCHAR,
    fielder1            VARCHAR,
    fielder2            VARCHAR
);
"""

DDL_PLAYERS = """
CREATE TABLE IF NOT EXISTS players (
    player_id   VARCHAR PRIMARY KEY,
    name        VARCHAR
);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_date(val: str | None) -> str | None:
    """Return val unchanged; DuckDB will cast VARCHAR → DATE in COPY."""
    return val


def _outcome(info: dict[str, Any]) -> tuple[str | None, int | None, int | None, str]:
    """
    Parse the outcome block.
    Returns (winner, win_by_runs, win_by_wickets, result_type).
    result_type is one of: 'win', 'tie', 'no result', 'unknown'.
    """
    outcome = info.get("outcome", {})
    winner = outcome.get("winner")
    by = outcome.get("by", {})
    runs = by.get("runs") if by else None
    wickets = by.get("wickets") if by else None

    if outcome.get("result") == "tie":
        return winner, runs, wickets, "tie"
    if outcome.get("result") == "no result":
        return None, None, None, "no result"
    if winner:
        return winner, runs, wickets, "win"
    return None, None, None, "unknown"


# ---------------------------------------------------------------------------
# Core extractor
# ---------------------------------------------------------------------------

class MatchExtractor:
    """Extracts all four tables from one Cricsheet JSON dict."""

    def __init__(self, *, season_from_date_year: bool = False) -> None:
        self.matches:    list[dict] = []
        self.innings:    list[dict] = []
        self.deliveries: list[dict] = []
        self.players:    dict[str, str] = {}   # player_id → name
        self._delivery_id = 0
        self.season_from_date_year = season_from_date_year

    def _next_delivery_id(self) -> int:
        self._delivery_id += 1
        return self._delivery_id

    def process(self, match_id: str, data: dict[str, Any]) -> None:
        meta = data.get("meta", {})
        info = data.get("info", {})

        # --- Match row ---
        teams: list[str] = info.get("teams", [None, None])
        toss   = info.get("toss", {})
        dates  = info.get("dates", [])
        umpires = info.get("officials", {}).get("umpires", [])
        winner, win_runs, win_wkts, result = _outcome(info)

        pom_list = info.get("player_of_match", [])
        pom = ", ".join(pom_list) if pom_list else None
        season = info.get("season")
        if self.season_from_date_year and dates:
            season = str(dates[0])[:4]

        self.matches.append(
            {
                "match_id":       match_id,
                "data_version":   meta.get("data_version"),
                "created_date":   meta.get("created"),
                "season":         season,
                "match_type":     info.get("match_type"),
                "gender":         info.get("gender"),
                "team_type":      info.get("team_type"),
                "event_name":     info.get("event", {}).get("name"),
                "match_number":   info.get("event", {}).get("match_number"),
                "date":           dates[0] if dates else None,
                "city":           info.get("city"),
                "venue":          info.get("venue"),
                "team1":          teams[0] if len(teams) > 0 else None,
                "team2":          teams[1] if len(teams) > 1 else None,
                "toss_winner":    toss.get("winner"),
                "toss_decision":  toss.get("decision"),
                "winner":         winner,
                "win_by_runs":    win_runs,
                "win_by_wickets": win_wkts,
                "result":         result,
                "player_of_match": pom,
                "balls_per_over": info.get("balls_per_over", 6),
                "umpire1":        umpires[0] if len(umpires) > 0 else None,
                "umpire2":        umpires[1] if len(umpires) > 1 else None,
                "event_group":    info.get("event", {}).get("group"),
                "event_stage":    info.get("event", {}).get("stage"),
            }
        )

        # --- Players registry ---
        registry = info.get("registry", {}).get("people", {})
        for name, pid in registry.items():
            # last-write wins if pid already seen (names can alias)
            self.players[pid] = name

        # --- Innings ---
        raw_innings: list[dict] = data.get("innings", [])
        all_teams = list(info.get("players", {}).keys())

        for idx, inning in enumerate(raw_innings, start=1):
            batting_team = inning.get("team")
            bowling_team = next(
                (t for t in all_teams if t != batting_team), None
            )
            is_super_over = bool(inning.get("super_over", False))

            total_runs = 0
            total_wickets = 0
            ball_count = 0

            overs = inning.get("overs", [])
            for over_block in overs:
                over_num = over_block.get("over", 0)
                for ball_idx, delivery in enumerate(
                    over_block.get("deliveries", []), start=1
                ):
                    runs      = delivery.get("runs", {})
                    extras    = delivery.get("extras", {})
                    wickets   = delivery.get("wickets", [])

                    runs_batter = runs.get("batter", 0)
                    runs_extras = runs.get("extras", 0)
                    runs_total  = runs.get("total", 0)

                    total_runs += runs_total
                    if extras.get("wides", 0) == 0 and extras.get("noballs", 0) == 0:
                        ball_count += 1

                    is_wicket   = bool(wickets)
                    player_out  = None
                    dis_kind    = None
                    fielder1    = None
                    fielder2    = None

                    if wickets:
                        w = wickets[0]          # take first wicket in the delivery
                        player_out = w.get("player_out")
                        dis_kind   = w.get("kind")
                        total_wickets += 1
                        fielders = w.get("fielders", [])
                        fielder1 = fielders[0].get("name") if len(fielders) > 0 else None
                        fielder2 = fielders[1].get("name") if len(fielders) > 1 else None

                    self.deliveries.append(
                        {
                            "delivery_id":      self._next_delivery_id(),
                            "match_id":         match_id,
                            "innings_number":   idx,
                            "is_super_over":    is_super_over,
                            "over_number":      over_num,
                            "ball_number":      ball_idx,
                            "batter":           delivery.get("batter"),
                            "bowler":           delivery.get("bowler"),
                            "non_striker":      delivery.get("non_striker"),
                            "runs_batter":      runs_batter,
                            "runs_extras":      runs_extras,
                            "runs_total":       runs_total,
                            "extras_wides":     extras.get("wides", 0),
                            "extras_noballs":   extras.get("noballs", 0),
                            "extras_byes":      extras.get("byes", 0),
                            "extras_legbyes":   extras.get("legbyes", 0),
                            "extras_penalty":   extras.get("penalty", 0),
                            "is_wicket":        is_wicket,
                            "player_dismissed": player_out,
                            "dismissal_kind":   dis_kind,
                            "fielder1":         fielder1,
                            "fielder2":         fielder2,
                        }
                    )

            self.innings.append(
                {
                    "match_id":       match_id,
                    "innings_number": idx,
                    "is_super_over":  is_super_over,
                    "batting_team":   batting_team,
                    "bowling_team":   bowling_team,
                    "total_runs":     total_runs,
                    "total_wickets":  total_wickets,
                    "total_balls":    ball_count,
                }
            )


# ---------------------------------------------------------------------------
# Schema + incremental ingest
# ---------------------------------------------------------------------------

def ensure_schema(con: duckdb.DuckDBPyConnection) -> None:
    """Create tables if they do not exist."""
    for ddl in (DDL_MATCHES, DDL_INNINGS, DDL_DELIVERIES, DDL_PLAYERS):
        con.execute(ddl)
    con.execute("ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_group VARCHAR")
    con.execute("ALTER TABLE matches ADD COLUMN IF NOT EXISTS event_stage VARCHAR")


def delete_match_rows(con: duckdb.DuckDBPyConnection, match_id: str) -> None:
    """Remove one match so it can be re-ingested without orphan deliveries."""
    con.execute("DELETE FROM deliveries WHERE match_id = ?", [match_id])
    con.execute("DELETE FROM innings WHERE match_id = ?", [match_id])
    con.execute("DELETE FROM matches WHERE match_id = ?", [match_id])


def apply_retired_hurt_fallback(
    con: duckdb.DuckDBPyConnection,
    match_ids: list[str],
) -> int:
    """Mark missing Sportmonks retirements as outs based on innings state.

    Some Sportmonks fixtures expose tactical retirements in batting cards but not in
    ball events. In that case, one batter can disappear from an innings without a
    dismissal event, leaving more than two unresolved batters in completed innings.
    We mark unresolved non-terminal batters as ``retired hurt`` on their last faced
    delivery so batting averages and wickets are consistent.
    """
    fixed = 0
    for match_id in match_ids:
        if not match_id.startswith("sm_"):
            continue
        innings_rows = con.execute(
            """
            SELECT DISTINCT innings_number
            FROM deliveries
            WHERE match_id = ?
            ORDER BY innings_number
            """,
            [match_id],
        ).fetchall()
        for (innings_number,) in innings_rows:
            batter_rows = con.execute(
                """
                SELECT DISTINCT batter
                FROM deliveries
                WHERE match_id = ? AND innings_number = ?
                  AND batter IS NOT NULL AND batter <> ''
                """,
                [match_id, innings_number],
            ).fetchall()
            dismissed_rows = con.execute(
                """
                SELECT DISTINCT player_dismissed
                FROM deliveries
                WHERE match_id = ? AND innings_number = ?
                  AND is_wicket = TRUE
                  AND player_dismissed IS NOT NULL AND player_dismissed <> ''
                """,
                [match_id, innings_number],
            ).fetchall()
            batters = {r[0] for r in batter_rows}
            dismissed = {r[0] for r in dismissed_rows}
            unresolved = batters - dismissed
            if len(unresolved) <= 2:
                continue

            last_ball = con.execute(
                """
                SELECT batter, non_striker
                FROM deliveries
                WHERE match_id = ? AND innings_number = ?
                ORDER BY over_number DESC, ball_number DESC, delivery_id DESC
                LIMIT 1
                """,
                [match_id, innings_number],
            ).fetchone()
            if not last_ball:
                continue
            terminal_not_out = {x for x in last_ball if x}
            retirement_candidates = sorted(p for p in unresolved if p not in terminal_not_out)
            if not retirement_candidates:
                continue

            for player in retirement_candidates:
                row = con.execute(
                    """
                    SELECT delivery_id
                    FROM deliveries
                    WHERE match_id = ? AND innings_number = ? AND batter = ?
                    ORDER BY over_number DESC, ball_number DESC, delivery_id DESC
                    LIMIT 1
                    """,
                    [match_id, innings_number, player],
                ).fetchone()
                if not row:
                    continue
                con.execute(
                    """
                    UPDATE deliveries
                    SET is_wicket = TRUE,
                        player_dismissed = ?,
                        dismissal_kind = 'retired hurt'
                    WHERE delivery_id = ?
                    """,
                    [player, row[0]],
                )
                fixed += 1

            con.execute(
                """
                UPDATE innings
                SET total_wickets = (
                    SELECT COUNT(*)
                    FROM deliveries d
                    WHERE d.match_id = innings.match_id
                      AND d.innings_number = innings.innings_number
                      AND d.is_wicket = TRUE
                )
                WHERE match_id = ? AND innings_number = ?
                """,
                [match_id, innings_number],
            )
    return fixed


def infer_tournament_structure(con: duckdb.DuckDBPyConnection) -> int:
    """Fill missing World Cup group/stage metadata conservatively.

    Cricsheet records the tournament group on most, but not every, match. We
    preserve every supplied value and infer only blank values from known group
    membership and the date window of that stage. The final three fixtures in
    each edition are kept out of group tables as semi-finals/final.
    """
    rows = con.execute("""
        SELECT match_id, season, date, team1, team2, event_group, event_stage
        FROM matches
        WHERE event_name IN ('ICC Men''s T20 World Cup', 'ICC World Twenty20', 'World T20')
        ORDER BY season, date, match_id
    """).fetchall()
    if not rows:
        return 0

    by_season: dict[str, list[tuple]] = defaultdict(list)
    for row in rows:
        by_season[str(row[1])].append(row)

    changed = 0
    for season_rows in by_season.values():
        # The tournament has two semi-finals followed by the final. Preserve
        # supplied stage labels and fill only the blanks.
        knockout = season_rows[-3:]
        for position, row in enumerate(knockout):
            if row[6] is None:
                stage = "Final" if position == 2 else "Semi Final"
                con.execute(
                    "UPDATE matches SET event_stage = ? WHERE match_id = ?",
                    [stage, row[0]],
                )
                changed += 1

        groups: dict[str, dict[str, Any]] = {}
        for _, _, date, team1, team2, group, _ in season_rows:
            if not group:
                continue
            entry = groups.setdefault(group, {"teams": set(), "dates": []})
            entry["teams"].update((team1, team2))
            entry["dates"].append(date.toordinal())

        numeric_start = min(
            (
                min(item["dates"])
                for label, item in groups.items()
                if str(label).isdigit()
            ),
            default=None,
        )
        knockout_ids = {row[0] for row in knockout}

        for match_id, _, date, team1, team2, group, stage in season_rows:
            if group or stage or match_id in knockout_ids:
                continue
            candidates = []
            for label, item in groups.items():
                overlap = len({team1, team2} & item["teams"])
                if not overlap:
                    continue
                is_numeric = str(label).isdigit()
                if numeric_start is not None:
                    in_numeric_stage = date.toordinal() >= numeric_start
                    if in_numeric_stage != is_numeric:
                        continue
                center = statistics.median(item["dates"])
                candidates.append((-overlap, abs(date.toordinal() - center), label))
            if not candidates:
                continue
            inferred = min(candidates)[2]
            con.execute(
                "UPDATE matches SET event_group = ? WHERE match_id = ?",
                [inferred, match_id],
            )
            groups[inferred]["teams"].update((team1, team2))
            groups[inferred]["dates"].append(date.toordinal())
            changed += 1
    return changed


def ingest_json_paths(
    db_path: Path | str,
    paths: list[Path],
    *,
    replace_existing_match: bool = True,
) -> MatchExtractor:
    """Load specific JSON files into DuckDB; seed ``delivery_id`` from MAX(delivery_id).

    Use after adding Sportmonks-exported files (``sm_<fixture_id>.json``) without a full re-ingest.
    When ``replace_existing_match`` is True, any existing rows for the same ``match_id`` are removed first.
    """
    # Avoid conflicts with an already-open read-only connection for the same DB.
    try:
        from backend import database as _db

        if Path(db_path).resolve() == Path(_db.DB_PATH).resolve():
            connections = getattr(_db._local, "connections", {})
            existing_conn = connections.get("ipl")
            if existing_conn is not None:
                try:
                    existing_conn.close()
                except Exception:
                    pass
                connections.pop("ipl", None)
                _db._local.connections = connections
                versions = getattr(_db._local, "versions", {})
                versions.pop("ipl", None)
                _db._local.versions = versions
    except Exception:
        pass

    con = duckdb.connect(str(db_path))
    ensure_schema(con)

    last_id = con.execute(
        "SELECT COALESCE(MAX(delivery_id), 0) FROM deliveries"
    ).fetchone()[0]

    extractor = MatchExtractor()
    extractor._delivery_id = int(last_id)  # noqa: SLF001

    ingested_match_ids: list[str] = []
    for path in paths:
        match_id = path.stem
        ingested_match_ids.append(match_id)
        if replace_existing_match:
            delete_match_rows(con, match_id)
        with path.open("rb") as fh:
            data = orjson.loads(fh.read())
        extractor.process(match_id, data)

    _load_to_duckdb_rowwise(con, extractor)
    apply_retired_hurt_fallback(con, ingested_match_ids)
    con.close()
    return extractor


# ---------------------------------------------------------------------------
# DB loader
# ---------------------------------------------------------------------------

def _load_to_duckdb_rowwise(
    con: duckdb.DuckDBPyConnection,
    extractor: MatchExtractor,
) -> None:
    """Insert extracted rows without pandas (stable on stacks where pd+DuckDB segfaults)."""

    def insert_table(table: str, rows: list[dict]) -> None:
        if not rows:
            return
        cols = list(rows[0].keys())
        colnames = ", ".join(cols)
        placeholders = ", ".join(["?" for _ in cols])
        sql = f"INSERT INTO {table} ({colnames}) VALUES ({placeholders})"
        for row in rows:
            con.execute(sql, [row.get(c) for c in cols])

    insert_table("matches", extractor.matches)
    insert_table("innings", extractor.innings)
    insert_table("deliveries", extractor.deliveries)

    for pid, name in extractor.players.items():
        con.execute(
            """
            INSERT INTO players (player_id, name) VALUES (?, ?)
            ON CONFLICT (player_id) DO UPDATE SET name = EXCLUDED.name
            """,
            [pid, name],
        )


def _load_to_duckdb(
    con: duckdb.DuckDBPyConnection,
    extractor: MatchExtractor,
) -> None:
    """Bulk-insert all accumulated rows into DuckDB using DataFrames."""

    def df(rows: list[dict]) -> pd.DataFrame:
        return pd.DataFrame(rows) if rows else pd.DataFrame()

    matches_df    = df(extractor.matches)
    innings_df    = df(extractor.innings)
    deliveries_df = df(extractor.deliveries)
    players_df    = pd.DataFrame(
        [{"player_id": pid, "name": name}
         for pid, name in extractor.players.items()]
    )

    # Use DELETE + INSERT so reruns are idempotent even if delivery IDs change
    if not matches_df.empty:
        match_ids = matches_df["match_id"].tolist()
        ph = ", ".join(["?"] * len(match_ids))
        con.execute(f"DELETE FROM deliveries WHERE match_id IN ({ph})", match_ids)
        con.execute(f"DELETE FROM innings WHERE match_id IN ({ph})", match_ids)
        con.execute(f"DELETE FROM matches WHERE match_id IN ({ph})", match_ids)
        
        con.execute("INSERT INTO matches SELECT * FROM matches_df")

    if not innings_df.empty:
        con.execute("INSERT INTO innings SELECT * FROM innings_df")

    if not deliveries_df.empty:
        # delivery_id is globally unique across the extractor lifetime
        con.execute("INSERT INTO deliveries SELECT * FROM deliveries_df")

    if not players_df.empty:
        # Use explicit conflict target on primary key; update name on conflict
        con.execute("""
            INSERT INTO players (player_id, name)
            SELECT player_id, name FROM players_df
            ON CONFLICT (player_id) DO UPDATE SET name = EXCLUDED.name
        """)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Cricsheet JSONs into DuckDB")
    parser.add_argument("--src", default="ipl_json", help="Directory of JSON files")
    parser.add_argument("--db",  default="ipl.duckdb", help="DuckDB output file")
    parser.add_argument(
        "--reset", action="store_true",
        help="Drop and recreate all tables before ingestion"
    )
    parser.add_argument(
        "--batch", type=int, default=200,
        help="Flush to DB every N files (reduces memory usage)"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-ingest files even if they already exist in the database"
    )
    parser.add_argument(
        "--season-from-date-year",
        action="store_true",
        help="Use the match date year as season (useful for World Cup editions)",
    )
    parser.add_argument(
        "--only",
        nargs="*",
        metavar="GLOB",
        help="Ingest only these glob(s) relative to --src (e.g. sm_123.json). Seeds delivery_id from DB.",
    )
    args = parser.parse_args()

    src_dir = Path(args.src)
    if not src_dir.exists():
        log.error("Source directory %s does not exist.", src_dir)
        sys.exit(1)

    if args.only:
        json_files: list[Path] = []
        for pattern in args.only:
            json_files.extend(sorted(src_dir.glob(pattern)))
        # de-duplicate while preserving order
        seen: set[Path] = set()
        uniq: list[Path] = []
        for p in json_files:
            rp = p.resolve()
            if rp not in seen:
                seen.add(rp)
                uniq.append(p)
        json_files = uniq
    else:
        json_files = sorted(src_dir.glob("*.json"))

    if not json_files:
        log.error("No JSON files found in %s", src_dir)
        sys.exit(1)

    log.info("Found %d JSON files in %s", len(json_files), src_dir)
    log.info("Writing to DuckDB: %s", args.db)

    con = duckdb.connect(args.db)

    if args.reset:
        log.warning("--reset: dropping all existing tables.")
        for tbl in ("deliveries", "innings", "matches", "players"):
            con.execute(f"DROP TABLE IF EXISTS {tbl}")

    # Create schema
    ensure_schema(con)

    # Incremental logic: find existing match IDs
    existing_matches = set()
    if not args.reset and not args.only:
        try:
            res = con.execute("SELECT match_id FROM matches").fetchall()
            existing_matches = {r[0] for r in res}
        except Exception:
            # Table might not exist yet
            pass

    if not args.force and not args.only and not args.reset:
        total_before = len(json_files)
        json_files = [p for p in json_files if p.stem not in existing_matches]
        skipped = total_before - len(json_files)
        if skipped > 0:
            log.info("Skipping %d files already in database (use --force to re-ingest)", skipped)
        
        if not json_files:
            log.info("No new files to ingest. Everything is up to date.")
            con.close()
            return

    if args.only:
        last_id = con.execute(
            "SELECT COALESCE(MAX(delivery_id), 0) FROM deliveries"
        ).fetchone()[0]
        extractor = MatchExtractor(season_from_date_year=args.season_from_date_year)
        extractor._delivery_id = int(last_id)  # noqa: SLF001
        errors: list[str] = []
        for path in tqdm(json_files, desc="Ingesting (--only)", unit="file"):
            match_id = path.stem
            try:
                delete_match_rows(con, match_id)
                with path.open("rb") as fh:
                    data = orjson.loads(fh.read())
                extractor.process(match_id, data)
            except Exception as exc:  # noqa: BLE001
                log.warning("Skipping %s — %s: %s", path.name, type(exc).__name__, exc)
                errors.append(str(path))
        _load_to_duckdb_rowwise(con, extractor)
        apply_retired_hurt_fallback(con, [p.stem for p in json_files])
    else:
        extractor = MatchExtractor(season_from_date_year=args.season_from_date_year)
        errors: list[str] = []

        for i, path in enumerate(tqdm(json_files, desc="Ingesting", unit="file"), start=1):
            match_id = path.stem
            try:
                with path.open("rb") as fh:
                    data = orjson.loads(fh.read())
                extractor.process(match_id, data)
            except Exception as exc:  # noqa: BLE001
                log.warning("Skipping %s — %s: %s", path.name, type(exc).__name__, exc)
                errors.append(str(path))

            # Flush every `batch` files to keep memory bounded
            if i % args.batch == 0:
                _load_to_duckdb(con, extractor)
                extractor = MatchExtractor(season_from_date_year=args.season_from_date_year)
                # Reset delivery_id counter relative to what was loaded
                last_id = con.execute(
                    "SELECT COALESCE(MAX(delivery_id), 0) FROM deliveries"
                ).fetchone()[0]
                extractor._delivery_id = last_id  # noqa: SLF001

        # Final flush
        _load_to_duckdb(con, extractor)
        apply_retired_hurt_fallback(con, [p.stem for p in json_files])

    structural_updates = infer_tournament_structure(con)
    if structural_updates:
        log.info("Filled %d missing tournament group/stage values", structural_updates)

    # Summary
    print("\n" + "=" * 60)
    print("  Cricket Analytics — Ingestion Complete")
    print("=" * 60)
    for tbl in ("matches", "innings", "deliveries", "players"):
        count = con.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        print(f"  {tbl:<15} {count:>10,} rows")
    print("=" * 60)

    if errors:
        log.warning("%d file(s) had errors and were skipped:", len(errors))
        for e in errors:
            log.warning("  %s", e)

    # Quick sanity-check queries
    print("\nTop 5 run-scorers (all-time, excluding Super Overs):")
    print(
        con.execute("""
            SELECT batter, SUM(runs_batter) AS runs
            FROM deliveries
            WHERE NOT is_super_over
            GROUP BY batter
            ORDER BY runs DESC
            LIMIT 5
        """).df().to_string(index=False)
    )

    print("\nSeason-wise matches played:")
    print(
        con.execute("""
            SELECT season, COUNT(*) AS matches
            FROM matches
            GROUP BY season
            ORDER BY season
        """).df().to_string(index=False)
    )

    con.close()
    log.info("Done. Database saved to %s", args.db)


if __name__ == "__main__":
    main()
