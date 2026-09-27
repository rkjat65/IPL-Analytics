"""DuckDB connection manager with thread-local connections."""

import os
import threading
import duckdb

from .tournaments import TOURNAMENTS, get_tournament_slug

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_default_duckdb = os.path.join(_repo_root, "ipl.duckdb")
# Oracle / Docker: compose sets DUCKDB_PATH=/data/ipl.duckdb so reads match persistent volume ingests.
DB_PATH = os.path.abspath(os.environ.get("DUCKDB_PATH", _default_duckdb))
DB_PATHS = {slug: item.db_path for slug, item in TOURNAMENTS.items()}

# ── Team name normalisation ──────────────────────────────────────────
TEAM_NAME_MAP = {
    "Delhi Daredevils": "Delhi Capitals",
    "Kings XI Punjab": "Punjab Kings",
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Rising Pune Supergiant": "Rising Pune Supergiants",
}


def normalize_team(name):
    """Map historical team names to current names."""
    return TEAM_NAME_MAP.get(name, name)


def team_variants(name):
    """Return all historical names for a team."""
    canonical = normalize_team(name)
    variants = [canonical]
    for old, new in TEAM_NAME_MAP.items():
        if new == canonical:
            variants.append(old)
    return list(set(variants))

# ── Venue name normalisation ─────────────────────────────────────────
VENUE_NAME_MAP = {
    # Arun Jaitley Stadium (formerly Feroz Shah Kotla), Delhi
    "Feroz Shah Kotla": "Arun Jaitley Stadium, Delhi",
    "Arun Jaitley Stadium": "Arun Jaitley Stadium, Delhi",
    "Arun Jaitley Stadium, Delhi": "Arun Jaitley Stadium, Delhi",
    "Feroz Shah Kotla Ground": "Arun Jaitley Stadium, Delhi",
    # M. Chinnaswamy Stadium, Bengaluru
    "M Chinnaswamy Stadium": "M Chinnaswamy Stadium, Bengaluru",
    "M.Chinnaswamy Stadium": "M Chinnaswamy Stadium, Bengaluru",
    "M Chinnaswamy Stadium, Bengaluru": "M Chinnaswamy Stadium, Bengaluru",
    # Narendra Modi Stadium (formerly Sardar Patel Stadium), Ahmedabad
    "Sardar Patel Stadium, Motera": "Narendra Modi Stadium, Ahmedabad",
    "Narendra Modi Stadium, Ahmedabad": "Narendra Modi Stadium, Ahmedabad",
    "Sardar Patel Stadium": "Narendra Modi Stadium, Ahmedabad",
    # Maharashtra Cricket Association Stadium, Pune
    "Subrata Roy Sahara Stadium": "Maharashtra Cricket Association Stadium, Pune",
    "Maharashtra Cricket Association Stadium": "Maharashtra Cricket Association Stadium, Pune",
    "Maharashtra Cricket Association Stadium, Pune": "Maharashtra Cricket Association Stadium, Pune",
    "MCA Stadium, Pune": "Maharashtra Cricket Association Stadium, Pune",
    # MA Chidambaram Stadium, Chepauk, Chennai
    "MA Chidambaram Stadium": "MA Chidambaram Stadium, Chennai",
    "MA Chidambaram Stadium, Chepauk": "MA Chidambaram Stadium, Chennai",
    "MA Chidambaram Stadium, Chepauk, Chennai": "MA Chidambaram Stadium, Chennai",
    "M. A. Chidambaram Stadium": "MA Chidambaram Stadium, Chennai",
    "MA Chidambaram Stadium, Chennai": "MA Chidambaram Stadium, Chennai",
    # Punjab Cricket Association IS Bindra Stadium, Mohali
    "Punjab Cricket Association IS Bindra Stadium": "IS Bindra Stadium, Mohali",
    "Punjab Cricket Association IS Bindra Stadium, Mohali": "IS Bindra Stadium, Mohali",
    "Punjab Cricket Association IS Bindra Stadium, Mohali, Chandigarh": "IS Bindra Stadium, Mohali",
    "Punjab Cricket Association Stadium, Mohali": "IS Bindra Stadium, Mohali",
    "IS Bindra Stadium, Mohali": "IS Bindra Stadium, Mohali",
    # Rajiv Gandhi International Stadium, Hyderabad
    "Rajiv Gandhi International Stadium": "Rajiv Gandhi International Stadium, Hyderabad",
    "Rajiv Gandhi International Stadium, Uppal": "Rajiv Gandhi International Stadium, Hyderabad",
    "Rajiv Gandhi International Stadium, Uppal, Hyderabad": "Rajiv Gandhi International Stadium, Hyderabad",
    "Rajiv Gandhi Intl. Cricket Stadium": "Rajiv Gandhi International Stadium, Hyderabad",
    # Wankhede Stadium, Mumbai
    "Wankhede Stadium": "Wankhede Stadium, Mumbai",
    "Wankhede Stadium, Mumbai": "Wankhede Stadium, Mumbai",
    # Eden Gardens, Kolkata
    "Eden Gardens": "Eden Gardens, Kolkata",
    "Eden Gardens, Kolkata": "Eden Gardens, Kolkata",
    # Sawai Mansingh Stadium, Jaipur
    "Sawai Mansingh Stadium": "Sawai Mansingh Stadium, Jaipur",
    "Sawai Mansingh Stadium, Jaipur": "Sawai Mansingh Stadium, Jaipur",
    # Dr DY Patil Sports Academy, Mumbai
    "Dr DY Patil Sports Academy": "Dr DY Patil Sports Academy, Mumbai",
    "Dr DY Patil Sports Academy, Mumbai": "Dr DY Patil Sports Academy, Mumbai",
    # Brabourne Stadium, Mumbai
    "Brabourne Stadium": "Brabourne Stadium, Mumbai",
    "Brabourne Stadium, Mumbai": "Brabourne Stadium, Mumbai",
    # Dubai International Cricket Stadium
    "Dubai International Cricket Stadium": "Dubai International Cricket Stadium",
    "Dubai International Stadium": "Dubai International Cricket Stadium",
    # Sheikh Zayed Stadium, Abu Dhabi
    "Sheikh Zayed Stadium": "Sheikh Zayed Stadium, Abu Dhabi",
    "Zayed Cricket Stadium, Abu Dhabi": "Sheikh Zayed Stadium, Abu Dhabi",
    # HPCA Stadium, Dharamsala
    "Himachal Pradesh Cricket Association Stadium": "HPCA Stadium, Dharamsala",
    "Himachal Pradesh Cricket Association Stadium, Dharamsala": "HPCA Stadium, Dharamsala",
    # ACA-VDCA Stadium, Visakhapatnam
    "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium": "ACA-VDCA Stadium, Visakhapatnam",
    "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium, Visakhapatnam": "ACA-VDCA Stadium, Visakhapatnam",
    # Ekana Stadium, Lucknow
    "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium, Lucknow": "Ekana Cricket Stadium, Lucknow",
    "Ekana Cricket Stadium": "Ekana Cricket Stadium, Lucknow",
    "Ekana Cricket Stadium, Lucknow": "Ekana Cricket Stadium, Lucknow",
    # Mullanpur (keep separate from Mohali)
    "Maharaja Yadavindra Singh International Cricket Stadium, Mullanpur": "MYSI Cricket Stadium, Mullanpur",
    "Maharaja Yadavindra Singh International Cricket Stadium, New Chandigarh": "MYSI Cricket Stadium, Mullanpur",
    "Maharaja Yadavindra Singh International Cricket Stadium": "MYSI Cricket Stadium, Mullanpur",
    # JSCA Ranchi
    "JSCA International Stadium Complex": "JSCA International Stadium Complex, Ranchi",
    "JSCA International Stadium Complex, Ranchi": "JSCA International Stadium Complex, Ranchi",

}


def normalize_venue(name):
    """Map venue name variants to a canonical standardized name."""
    if not name:
        return name
    return VENUE_NAME_MAP.get(name, name)


# SQL CASE expression for normalizing venue names inside queries.
# Usage: f"({VENUE_NORM_SQL}) AS venue" in SELECT clauses.
def _build_venue_norm_sql():
    # Deduplicate: only entries where key != value
    cases = []
    seen = set()
    for old, new in VENUE_NAME_MAP.items():
        if old != new and old not in seen:
            safe_old = old.replace("'", "''")
            safe_new = new.replace("'", "''")
            cases.append(f"WHEN venue = '{safe_old}' THEN '{safe_new}'")
            seen.add(old)
    return "CASE " + " ".join(cases) + " ELSE venue END"


VENUE_NORM_SQL = _build_venue_norm_sql()


_local = threading.local()
_db_versions = {slug: 0 for slug in TOURNAMENTS}
_db_version_lock = threading.Lock()


def get_db() -> duckdb.DuckDBPyConnection:
    """Return a tournament-scoped thread-local read-only DuckDB connection.

    Automatically reopens if the global DB version has been bumped
    (e.g. after a new match is ingested).
    """
    tournament = get_tournament_slug()
    db_path = DB_PATHS[tournament]
    connections = getattr(_local, "connections", {})
    versions = getattr(_local, "versions", {})
    local_ver = versions.get(tournament, -1)
    conn = connections.get(tournament)
    if local_ver != _db_versions[tournament]:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        conn = duckdb.connect(db_path, read_only=True)
        connections[tournament] = conn
        versions[tournament] = _db_versions[tournament]
    elif conn is None:
        conn = duckdb.connect(db_path, read_only=True)
        connections[tournament] = conn
        versions[tournament] = _db_versions[tournament]
    _local.connections = connections
    _local.versions = versions
    return conn


def refresh_db(tournament: str | None = None):
    """Bump the global DB version so all threads reopen their connections.

    Call after ingesting new matches into ipl.duckdb so read-only snapshots
    pick up the latest data.
    """
    slug = tournament or get_tournament_slug()
    with _db_version_lock:
        _db_versions[slug] += 1


# Reusable CTE that resolves super-over winners for tied matches.
# Returns match_id + so_winner.  Use: LEFT JOIN super_over_winners sow ON ...
# For the one double-tied super over (match 729315, KKR vs RR 2014),
# KKR won on boundary count (1 six vs 1 four).
SUPER_OVER_WINNER_CTE = """
    super_over_winners AS (
        SELECT i.match_id,
            CASE
                WHEN MAX(CASE WHEN rn = 2 THEN total_runs END) > MAX(CASE WHEN rn = 1 THEN total_runs END)
                    THEN MAX(CASE WHEN rn = 2 THEN batting_team END)
                WHEN MAX(CASE WHEN rn = 1 THEN total_runs END) > MAX(CASE WHEN rn = 2 THEN total_runs END)
                    THEN MAX(CASE WHEN rn = 1 THEN batting_team END)
                -- Tied super over (only match 729315): KKR won by boundary count
                WHEN i.match_id = 729315
                    THEN 'Kolkata Knight Riders'
                ELSE NULL
            END AS so_winner
        FROM (
            SELECT match_id, innings_number, batting_team, total_runs,
                ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY innings_number DESC) AS rn
            FROM innings
            WHERE is_super_over = true
        ) i
        WHERE rn <= 2
        GROUP BY i.match_id
    )
"""


def query(sql: str, params: list | None = None) -> list[dict]:
    """Execute a SQL query and return results as a list of dicts."""
    conn = get_db()
    if params:
        result = conn.execute(sql, params)
    else:
        result = conn.execute(sql)
    columns = [desc[0] for desc in result.description]
    rows = result.fetchall()
    return [dict(zip(columns, row)) for row in rows]
