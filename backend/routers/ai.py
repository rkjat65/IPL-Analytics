"""AI-powered endpoints: commentary generation, natural language queries, thread composer."""

import os
import re
import time
import json
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..database import query
from ..tournaments import get_tournament
from .auth import get_current_user


# Billing stubs (payment module not yet deployed)
def check_quota(user_id, feature):
    return {"allowed": True}

def record_usage(user_id, feature):
    pass

# ── Gemini Setup ──────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    load_dotenv(_env_path, override=True)
except ImportError:
    pass

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
genai_client = None
model = None
GEMINI_AVAILABLE = False
MODEL_NAME = None

try:
    from google import genai
    if GEMINI_KEY and GEMINI_KEY != "your_gemini_api_key_here":
        genai_client = genai.Client(api_key=GEMINI_KEY)
        MODEL_NAME = "gemini-3.1-flash-lite-preview"
        GEMINI_AVAILABLE = True
        # Wrapper to keep model.generate_content() API compatible
        class _GeminiModel:
            def __init__(self, client, model_name):
                self._client = client
                self._model = model_name
            def generate_content(self, prompt):
                return self._client.models.generate_content(
                    model=self._model, contents=prompt
                )
        model = _GeminiModel(genai_client, MODEL_NAME)
except ImportError:
    pass

router = APIRouter(prefix="/api/ai", tags=["AI"])

# ── DB Schema for NL Query ────────────────────────────────────────────────────
DB_SCHEMA = """
You are a cricket analytics SQL expert. The database is DuckDB with these tables:

TABLE matches:
  match_id VARCHAR, season VARCHAR, date DATE, city VARCHAR, venue VARCHAR,
  team1 VARCHAR, team2 VARCHAR, toss_winner VARCHAR, toss_decision VARCHAR,
  winner VARCHAR, win_by_runs INTEGER, win_by_wickets INTEGER, result VARCHAR,
  player_of_match VARCHAR, event_name VARCHAR, match_number INTEGER

TABLE deliveries:
  delivery_id BIGINT, match_id VARCHAR, innings_number INTEGER, is_super_over BOOLEAN,
  over_number INTEGER, ball_number INTEGER, batter VARCHAR, bowler VARCHAR,
  non_striker VARCHAR, runs_batter INTEGER, runs_extras INTEGER, runs_total INTEGER,
  extras_wides INTEGER, extras_noballs INTEGER, extras_byes INTEGER, extras_legbyes INTEGER,
  is_wicket BOOLEAN, player_dismissed VARCHAR, dismissal_kind VARCHAR, fielder1 VARCHAR

TABLE innings:
  match_id VARCHAR, innings_number INTEGER, is_super_over BOOLEAN,
  batting_team VARCHAR, bowling_team VARCHAR, total_runs INTEGER,
  total_wickets INTEGER, total_balls INTEGER

TABLE players:
  player_id VARCHAR, name VARCHAR

IMPORTANT RULES:
- Generate ONLY SELECT queries. No INSERT, UPDATE, DELETE, DROP, ALTER, CREATE.
- Use DuckDB SQL syntax (not MySQL/PostgreSQL specific features).
- For powerplay: over_number BETWEEN 0 AND 5 (0-indexed, so 0-5 = overs 1-6)
- For middle overs: over_number BETWEEN 6 AND 14
- For death overs: over_number BETWEEN 15 AND 19
- Strike rate = (runs * 100.0) / balls
- Economy = (runs * 6.0) / balls
- Bowling average = runs / wickets
- Batting average = runs / dismissals
- For sixes: runs_batter = 6 AND extras_wides = 0  (no-balls count — a six off a no-ball is still a six for the batter)
- For fours: runs_batter = 4 AND extras_wides = 0  (no-balls count — a four off a no-ball is still a four for the batter)
- For batting balls faced: COUNT(CASE WHEN extras_wides = 0 THEN 1 END)  (batter faces no-balls; only wides are not faced)
- For bowling legal balls (overs): COUNT(CASE WHEN extras_wides = 0 AND extras_noballs = 0 THEN 1 END)
- Always exclude super overs: is_super_over = false (add this to WHERE clause)
- Player names are full names like 'V Kohli', 'MS Dhoni', 'JJ Bumrah'
- Use only teams present in the selected tournament database.
- Venue names have variants (e.g. 'Feroz Shah Kotla', 'Arun Jaitley Stadium', 'Arun Jaitley Stadium, Delhi' are the same ground). When querying by venue, use IN clause with all known variants or use LIKE. Key venues: 'Wankhede Stadium%' (Mumbai), 'Eden Gardens%' (Kolkata), '%Chinnaswamy%' (Bengaluru), '%Arun Jaitley%' OR 'Feroz Shah Kotla' (Delhi), '%Chidambaram%' (Chennai), '%Rajiv Gandhi%' (Hyderabad), '%Narendra Modi%' OR '%Sardar Patel%' (Ahmedabad), '%Bindra%' OR '%Punjab Cricket%Mohali%' (Mohali).
- Limit results to 20 rows max unless user asks for more.
- Always add meaningful column aliases.
- Return ONLY the SQL query, nothing else. No markdown, no explanation.

CRITICAL — "LAST N MATCHES" PATTERN:
When the user asks "who won MoM / who won / what happened in the last N matches", return ONE ROW PER MATCH (with date), NOT aggregated counts.
  WRONG: SELECT player_of_match, COUNT(*) FROM matches WHERE ... GROUP BY player_of_match ORDER BY MAX(date) DESC LIMIT 10
  CORRECT: SELECT date, player_of_match, winner, team1, team2 FROM matches WHERE ... ORDER BY date DESC LIMIT 10 -- chart:timeline

Only aggregate (COUNT/SUM/AVG) when the user explicitly asks for totals or rankings like "how many times", "most awards", "top scorers".

CHART TYPE HINTS — you MUST append one of these comments at the very end of every SQL query:
  -- chart:timeline   → use when result has a date column and one row = one match/event
  -- chart:bar        → use when result is a ranked list (player/team + numeric metric)
  -- chart:line       → use when result shows a trend over seasons or years
  -- chart:stat       → use when result is a single row summary
  -- chart:table      → use when result has many columns or mixed types
"""


def tournament_schema_context() -> str:
    tournament = get_tournament()
    team_rows = query("""
        SELECT DISTINCT team FROM (
            SELECT team1 AS team FROM matches
            UNION
            SELECT team2 AS team FROM matches
        ) ORDER BY team
    """)
    teams = ", ".join(row["team"] for row in team_rows)
    return (
        f"\nSELECTED TOURNAMENT: {tournament.name} ({tournament.short_name}).\n"
        f"The season column represents a {tournament.competition_label.lower()}.\n"
        f"Available teams: {teams}.\n"
        "Never combine data with another tournament."
    )

COMMENTARY_PROMPT = """You are @Rkjat65, a sharp cricket data analyst known for tweet-ready IPL insights.
Generate engaging social media commentary for the following cricket statistics.

Rules:
- Keep it under 280 characters (tweet-ready)
- Use numbers and stats prominently
- Add relevant emojis sparingly (1-2 max)
- Include 2-3 relevant hashtags like #IPL #CricketStats
- Be opinionated and insightful, not just descriptive
- Reference historical context when relevant
- Sign off style: analytical, confident, data-driven

Stats data:
{stats_json}

Context: {context}

Generate exactly 3 different commentary options (numbered 1-3), each as a standalone tweet.
"""

THREAD_PROMPT = """You are @Rkjat65, a sharp cricket data analyst. Create a Twitter thread from this data analysis.

Rules:
- Thread of 4-6 tweets (numbered 1/ to N/)
- First tweet should be a hook (attention-grabbing question or bold claim)
- Each tweet under 280 characters
- Use data/numbers prominently
- Last tweet should be a conclusion with #IPL #CricketStats #RKJAT65
- Add emojis sparingly
- Make it feel like a conversation, not a report

Topic: {topic}
Data:
{data_json}
"""


# ── Request/Response Models ───────────────────────────────────────────────────

class CommentaryRequest(BaseModel):
    stats: dict
    context: str = "IPL cricket statistics"

class NLQueryRequest(BaseModel):
    question: str
    season: Optional[str] = None

class ThreadRequest(BaseModel):
    topic: str
    data: list | dict

class CommentaryResponse(BaseModel):
    commentaries: list[str]
    model_used: str

class NLQueryResponse(BaseModel):
    question: str
    sql: str
    data: list[dict]
    insight: str
    chart_type: str
    chart_config: dict

class ThreadResponse(BaseModel):
    tweets: list[str]
    model_used: str


class AIImageRequest(BaseModel):
    question: str
    insight: str = ""
    data: list[dict] = []
    style: str = "vibrant"  # vibrant, neon, minimal


# ── Safety ────────────────────────────────────────────────────────────────────

FORBIDDEN_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
    "TRUNCATE", "REPLACE", "MERGE", "GRANT", "REVOKE",
    "EXEC", "EXECUTE", "CALL", "COPY", "ATTACH", "DETACH",
    "PRAGMA", "EXPORT", "IMPORT", "INSTALL", "LOAD",
]

def _extract_last_n(question: str) -> int | None:
    """Return N if the question asks about the 'last N matches', else None."""
    m = re.search(r'\blast\s+(\d+)\s+match', question, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # "last ten matches" etc.
    words = {"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,
             "eleven":11,"twelve":12,"fifteen":15,"twenty":20,"twenty-five":25,"twenty five":25}
    m2 = re.search(r'\blast\s+(' + '|'.join(words) + r')\s+match', question, re.IGNORECASE)
    if m2:
        return words[m2.group(1).lower()]
    return None


def _rewrite_last_n_sql(sql: str, question: str) -> tuple[str, str]:
    """
    If the question asks about the last N matches and the AI generated a
    GROUP BY / aggregation without filtering last N matches first, rewrite
    the SQL to use a CTE that limits to the last N matches, then return
    per-match rows (date, player_of_match, winner, team1, team2).

    Returns (rewritten_sql, chart_hint).
    """
    n = _extract_last_n(question)
    if n is None:
        return sql, _extract_chart_hint(sql)

    sql_upper = sql.upper()

    # Only rewrite if the SQL groups/aggregates without a subquery/CTE limit
    has_group_by = "GROUP BY" in sql_upper
    has_cte_limit = bool(re.search(r'LIMIT\s+\d+', sql_upper[:sql_upper.find("GROUP BY")], re.IGNORECASE)) if has_group_by else False
    has_subquery = sql_upper.count("SELECT") > 1

    if has_group_by and not has_cte_limit and not has_subquery:
        # Extract the WHERE clause from the generated SQL
        where_match = re.search(r'\bWHERE\b(.*?)(?:\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)',
                                sql, re.IGNORECASE | re.DOTALL)
        where_clause = where_match.group(1).strip() if where_match else "1=1"

        rewritten = f"""WITH last_matches AS (
    SELECT date, player_of_match, winner, team1, team2, result
    FROM matches
    WHERE {where_clause}
      AND player_of_match IS NOT NULL AND player_of_match != ''
    ORDER BY date DESC
    LIMIT {n}
)
SELECT date, player_of_match, winner, team1, team2
FROM last_matches
ORDER BY date DESC
-- chart:timeline"""
        return rewritten, "timeline"

    return sql, _extract_chart_hint(sql)


def _extract_chart_hint(sql: str) -> str | None:
    """Pull the -- chart:xxx hint out of the SQL if present."""
    m = re.search(r'--\s*chart:(\w+)', sql, re.IGNORECASE)
    return m.group(1).lower() if m else None


def validate_sql(sql: str) -> bool:
    """Ensure the SQL is a safe SELECT-only query."""
    cleaned = sql.strip().rstrip(";").upper()
    # Must start with SELECT or WITH (CTE)
    if not (cleaned.startswith("SELECT") or cleaned.startswith("WITH")):
        return False
    # Check for forbidden keywords as standalone words
    for kw in FORBIDDEN_KEYWORDS:
        if re.search(rf'\b{kw}\b', cleaned):
            return False
    # No semicolons in the middle (prevent injection of multiple statements)
    if ";" in sql.strip().rstrip(";"):
        return False
    return True


def detect_chart_type(sql: str, data: list[dict]) -> tuple[str, dict]:
    """Auto-detect the best chart type based on SQL hint and query results."""
    if not data:
        return "table", {}

    cols = list(data[0].keys())
    num_cols = [c for c in cols if isinstance(data[0].get(c), (int, float))]
    str_cols = [c for c in cols if isinstance(data[0].get(c), str)]

    # Check for explicit chart hint in SQL comment
    hint_match = re.search(r'--\s*chart:(\w+)', sql, re.IGNORECASE)
    if hint_match:
        hint = hint_match.group(1).lower()
        if hint == "timeline":
            date_col = next((c for c in cols if "date" in c.lower()), str_cols[0] if str_cols else cols[0])
            label_col = next((c for c in cols if c.lower() in ("player_of_match", "winner", "player", "name", "team")), None)
            num_col = num_cols[0] if num_cols else None
            return "timeline", {"dateKey": date_col, "labelKey": label_col, "valueKey": num_col, "allKeys": cols}
        if hint == "bar":
            x = str_cols[0] if str_cols else cols[0]
            return "bar", {"xKey": x, "yKeys": num_cols, "xLabel": x, "yLabel": num_cols[0] if num_cols else ""}
        if hint == "line":
            time_col = next((c for c in cols if c.lower() in ("season", "year", "date")), cols[0])
            return "line", {"xKey": time_col, "yKeys": num_cols, "xLabel": time_col, "yLabel": num_cols[0] if num_cols else ""}
        if hint == "stat":
            return "stat", {"metrics": cols}
        if hint == "table":
            return "table", {}

    # Single row = stat card
    if len(data) == 1:
        return "stat", {"metrics": cols}

    # Has a date column + no numeric column → timeline of labels
    if any("date" in c.lower() for c in cols) and not num_cols:
        date_col = next(c for c in cols if "date" in c.lower())
        label_col = next((c for c in cols if c != date_col), None)
        return "timeline", {"dateKey": date_col, "labelKey": label_col, "valueKey": None, "allKeys": cols}

    # Has a season/year column → line chart
    if any(c.lower() in ("season", "year") for c in cols):
        time_col = next(c for c in cols if c.lower() in ("season", "year"))
        return "line", {"xKey": time_col, "yKeys": num_cols, "xLabel": time_col, "yLabel": num_cols[0] if num_cols else ""}

    # 2+ numeric columns with a string column → grouped bar
    if len(num_cols) >= 2 and str_cols:
        return "bar", {"xKey": str_cols[0], "yKeys": num_cols, "xLabel": str_cols[0], "yLabel": "Value"}

    # One numeric, one string → horizontal bar (only if values vary; all-equal is meaningless as bar)
    if len(num_cols) == 1 and str_cols:
        values = [row.get(num_cols[0]) for row in data if row.get(num_cols[0]) is not None]
        if len(set(values)) <= 1:
            # All values identical — table is clearer
            return "table", {}
        return "bar", {"xKey": str_cols[0], "yKeys": num_cols, "xLabel": str_cols[0], "yLabel": num_cols[0]}

    return "table", {}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def ai_status():
    """Check if AI features are available."""
    return {
        "available": GEMINI_AVAILABLE,
        "model": MODEL_NAME if GEMINI_AVAILABLE else None,
        "message": "AI features ready" if GEMINI_AVAILABLE else "Set GEMINI_API_KEY in backend/.env"
    }


@router.post("/commentary", response_model=CommentaryResponse)
async def generate_commentary(req: CommentaryRequest, authorization: Optional[str] = Header(None)):
    """Generate tweet-ready commentary for cricket stats."""
    if not GEMINI_AVAILABLE:
        raise HTTPException(503, "AI not configured. Set GEMINI_API_KEY in backend/.env")

    # Quota check
    user = get_current_user(authorization)
    if user:
        quota = check_quota(user["id"], "ai_caption")
        if not quota["allowed"]:
            raise HTTPException(429, f"Daily limit reached ({quota['limit']}/day). Upgrade your plan for more AI captions.")

    prompt = COMMENTARY_PROMPT.format(
        stats_json=json.dumps(req.stats, indent=2),
        context=req.context
    )

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()

        # Parse numbered commentaries
        commentaries = []
        for line in text.split("\n"):
            line = line.strip()
            if line and re.match(r"^\d[.)\s]", line):
                # Remove the number prefix
                clean = re.sub(r"^\d[.)\s]+", "", line).strip()
                if clean:
                    commentaries.append(clean)

        # Fallback: if parsing failed, split by double newlines
        if not commentaries:
            commentaries = [p.strip() for p in text.split("\n\n") if p.strip()]

        # Ensure at least one commentary
        if not commentaries:
            commentaries = [text]

        # Record usage after success
        if user:
            record_usage(user["id"], "ai_caption")

        return CommentaryResponse(commentaries=commentaries[:3], model_used=MODEL_NAME)

    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {str(e)}")


@router.post("/query", response_model=NLQueryResponse)
async def nl_query(req: NLQueryRequest, authorization: Optional[str] = Header(None)):
    """Convert natural language question to SQL, execute, and return insight."""
    if not GEMINI_AVAILABLE:
        raise HTTPException(503, "AI not configured. Set GEMINI_API_KEY in backend/.env")

    # Quota check
    user = get_current_user(authorization)
    if user:
        quota = check_quota(user["id"], "ai_query")
        if not quota["allowed"]:
            raise HTTPException(429, f"Daily limit reached ({quota['limit']}/day). Upgrade your plan for more AI queries.")

    question = req.question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty")

    # Add season context if provided
    season_context = f"\nThe user is asking about edition/season: {req.season}" if req.season else ""
    schema_context = DB_SCHEMA + tournament_schema_context()

    # Step 1: Generate SQL
    sql_prompt = f"""{schema_context}{season_context}

User question: {question}

Return ONLY the DuckDB SQL query:"""

    try:
        sql_response = model.generate_content(sql_prompt)
        raw_sql = sql_response.text.strip()

        # Clean up: remove markdown code blocks if present
        raw_sql = re.sub(r"```sql\s*", "", raw_sql)
        raw_sql = re.sub(r"```\s*", "", raw_sql)
        raw_sql = raw_sql.strip().rstrip(";")

        # Python-side safety net: rewrite "last N matches" queries that the AI
        # incorrectly aggregated across all matches. This is deterministic and
        # does not depend on the LLM following prompt rules.
        raw_sql, _forced_chart = _rewrite_last_n_sql(raw_sql, question)

        if not validate_sql(raw_sql):
            raise HTTPException(400, "Generated query is not a safe SELECT statement. Please rephrase your question.")

        # Step 2: Execute with timeout (via LIMIT safety net)
        if "LIMIT" not in raw_sql.upper():
            raw_sql += " LIMIT 20"

        start = time.time()
        try:
            data = query(raw_sql)
        except Exception as db_err:
            # If query fails, try to get AI to fix it
            fix_prompt = f"""{schema_context}

The following SQL query failed with error: {str(db_err)}

Failed query: {raw_sql}

Original question: {question}

Generate a corrected DuckDB SQL query. Return ONLY the SQL:"""
            fix_response = model.generate_content(fix_prompt)
            fixed_sql = fix_response.text.strip()
            fixed_sql = re.sub(r"```sql\s*", "", fixed_sql)
            fixed_sql = re.sub(r"```\s*", "", fixed_sql)
            fixed_sql = fixed_sql.strip().rstrip(";")

            if not validate_sql(fixed_sql):
                raise HTTPException(400, f"Could not generate a valid query. DB error: {str(db_err)}")

            if "LIMIT" not in fixed_sql.upper():
                fixed_sql += " LIMIT 20"

            data = query(fixed_sql)
            raw_sql = fixed_sql

        elapsed = time.time() - start

        # Cap data at 50 rows
        data = data[:50]

        # Step 3: Detect chart type — forced chart from rewriter takes priority
        if _forced_chart:
            chart_type, chart_config = detect_chart_type(
                f"-- chart:{_forced_chart}\n" + raw_sql, data
            )
        else:
            chart_type, chart_config = detect_chart_type(raw_sql, data)

        # Step 4: Generate insight
        insight_prompt = f"""You are @Rkjat65, a cricket data analyst. Based on this query result, provide a brief 1-2 sentence insight.

Question: {question}
Data (first 10 rows): {json.dumps(data[:10], indent=2, default=str)}

Keep it analytical and data-driven. Under 200 characters. No hashtags."""

        insight_response = model.generate_content(insight_prompt)
        insight = insight_response.text.strip()

        # Record usage after success
        if user:
            record_usage(user["id"], "ai_query")

        return NLQueryResponse(
            question=question,
            sql=raw_sql,
            data=data,
            insight=insight,
            chart_type=chart_type,
            chart_config=chart_config,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"AI query failed: {str(e)}")


@router.post("/thread", response_model=ThreadResponse)
async def generate_thread(req: ThreadRequest, authorization: Optional[str] = Header(None)):
    """Generate a Twitter thread from data analysis."""
    if not GEMINI_AVAILABLE:
        raise HTTPException(503, "AI not configured. Set GEMINI_API_KEY in backend/.env")

    # Quota check
    user = get_current_user(authorization)
    if user:
        quota = check_quota(user["id"], "ai_thread")
        if not quota["allowed"]:
            raise HTTPException(429, f"Daily limit reached ({quota['limit']}/day). Upgrade your plan for more AI threads.")

    prompt = THREAD_PROMPT.format(
        topic=req.topic,
        data_json=json.dumps(req.data, indent=2, default=str)
    )

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()

        # Parse thread tweets (look for N/ pattern)
        tweets = []
        current = []
        for line in text.split("\n"):
            line = line.strip()
            if re.match(r"^\d+/", line):
                if current:
                    tweets.append(" ".join(current))
                current = [re.sub(r"^\d+/\s*", "", line)]
            elif line:
                current.append(line)
        if current:
            tweets.append(" ".join(current))

        # Fallback
        if not tweets:
            tweets = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not tweets:
            tweets = [text]

        # Record usage after success
        if user:
            record_usage(user["id"], "ai_thread")

        return ThreadResponse(tweets=tweets[:6], model_used=MODEL_NAME)

    except Exception as e:
        raise HTTPException(500, f"Thread generation failed: {str(e)}")


@router.get("/suggestions")
def get_suggestions():
    """Return example questions users can ask."""
    tournament = get_tournament()
    if tournament.slug == "t20wc":
        return {
            "suggestions": [
                "Who has scored the most T20 World Cup runs?",
                "Top 5 wicket takers in T20 World Cup history",
                "Compare India and Australia head to head",
                "Which team has the most T20 World Cup wins?",
                "Highest individual scores in the 2024 edition",
                "Which venue has the highest first-innings average?",
                "Compare Kohli and Rohit by edition",
                "Best bowling figures in a World Cup match",
            ]
        }
    return {
        "suggestions": [
            "Who has the highest strike rate in death overs?",
            "Top 5 six hitters in IPL history",
            "How many times has CSK won the toss and chosen to bat?",
            "Compare Kohli and Rohit batting average by season",
            "Which venue has the highest average first innings score?",
            "Most Player of the Match awards",
            "Best bowling figures in a single match",
            "Win percentage of teams batting first vs chasing",
            "Most runs scored in powerplay overs, all time",
            "Which bowler has dismissed Kohli the most?",
            "Head to head record between MI and CSK",
            "Highest individual scores in IPL",
        ]
    }


AI_IMAGE_PROMPT = """Create a vibrant, eye-catching social media infographic image for cricket/IPL analytics.

CRITICAL DATA RULES — READ CAREFULLY:
- You MUST show ONLY the exact data listed below. Do NOT invent, fabricate, or hallucinate ANY numbers, scores, runs, wickets, averages, or statistics.
- If a row only has a player name and a date, show ONLY that name and date — do NOT add any batting/bowling scores next to the name.
- If a column says "winner", that is a TEAM NAME, not a score — show it as text, not as a number.
- Do NOT add your own cricket statistics to any player shown. Only numbers explicitly in the data below may appear.
- If no numeric stats are in the data, make the NAMES and DATES the visual hero — large, bold text.

DESIGN REQUIREMENTS:
- Style: Bold, modern sports infographic with vibrant neon colors (cyan #00E5FF, magenta #FF2D78, lime #B8FF00 on dark background #0A0A0F)
- If player names appear, show stylized silhouette/caricature illustrations (NO realistic faces, NO made-up jersey numbers)
- Show the data as a clean, bold visual list or comparison (ranked list, stat cards, or timeline as appropriate)
- Use large, bold, easily readable typography for all names, dates and labels
- Make it look premium and professional like ESPN/Cricbuzz branded content
- Must include watermark text "@rkjat65" in bottom-right corner
- The image should be Twitter-optimized (landscape 16:9 ratio)
- Use cricket visual elements: stumps, cricket ball, bat silhouettes as decorative accents
- NO realistic photos — use illustrated/vector style
- Make the ACTUAL DATA the HERO of the image

CONTENT TO VISUALIZE:
Question: {question}
Key Insight: {insight}
Data (show ONLY these exact values — nothing else):
{data_summary}

Generate a single high-quality infographic image that would get high engagement on Twitter/X for a cricket analytics account."""


@router.post("/generate-image")
async def generate_ai_image(req: AIImageRequest, authorization: Optional[str] = Header(None)):
    """Generate a vibrant AI image using Gemini image model via new google.genai SDK."""
    if not GEMINI_AVAILABLE:
        raise HTTPException(503, "AI not configured. Set GEMINI_API_KEY in backend/.env")
    if not genai_client:
        raise HTTPException(503, "Image generation requires google-genai package. pip install google-genai")

    # Quota check
    user = get_current_user(authorization)
    if user:
        quota = check_quota(user["id"], "ai_image")
        if not quota["allowed"]:
            limit_msg = "AI Infographics are not available on the Free plan." if quota["limit"] == 0 else f"Daily limit reached ({quota['limit']}/day)."
            raise HTTPException(429, f"{limit_msg} Upgrade your plan for AI image generation.")

    import base64
    from google.genai import types as genai_types

    # Build data summary for the prompt — clear column labels to avoid hallucination
    data_summary = ""
    if req.data:
        rows = req.data[:10]
        # Print column names once as a header
        if rows:
            cols = list(rows[0].keys())
            data_summary += f"  Columns: {', '.join(cols)}\n"
            for i, row in enumerate(rows):
                # Format values clearly: skip None/empty, quote strings so Gemini knows they are labels not numbers
                parts = []
                for k, v in row.items():
                    if v is None or v == "":
                        continue
                    if isinstance(v, str):
                        parts.append(f'{k}="{v}"')
                    else:
                        parts.append(f"{k}={v}")
                data_summary += f"  [{i+1}] {', '.join(parts)}\n"
    else:
        data_summary = "  No tabular data — use the question and insight to create visual."

    prompt = AI_IMAGE_PROMPT.format(
        question=req.question,
        insight=req.insight,
        data_summary=data_summary,
    )

    try:
        response = genai_client.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        # Extract image from response parts
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data and part.inline_data.data:
                    img_data = part.inline_data.data
                    mime = part.inline_data.mime_type or "image/png"
                    if isinstance(img_data, bytes):
                        b64 = base64.b64encode(img_data).decode("utf-8")
                    else:
                        b64 = img_data
                    # Record usage after success
                    if user:
                        record_usage(user["id"], "ai_image")

                    return {
                        "image": f"data:{mime};base64,{b64}",
                        "model_used": "gemini-3.1-flash-image-preview",
                    }

        raise HTTPException(500, "AI model did not return an image. Try again.")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"AI image generation failed: {str(e)}")
