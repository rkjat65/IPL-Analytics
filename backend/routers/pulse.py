"""Cricket Pulse — Auto-discovery engine for tweet-worthy IPL insights.

Finds milestones, streaks, anomalies, records, and historical moments
from the DuckDB database and packages them as ready-to-share content.
"""

import hashlib
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..database import query, normalize_team

router = APIRouter(prefix="/api/pulse", tags=["Pulse"])

# ── Helpers ──────────────────────────────────────────────────────────────────

def _id(category: str, *parts):
    raw = f"{category}_{'_'.join(str(p) for p in parts)}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _score(base: int, **boosts) -> int:
    """Calculate shareability score 0-100."""
    s = base
    for k, v in boosts.items():
        s += v
    return max(0, min(100, s))


def _tweet(headline: str, detail: str = "", hashtags: str = "#IPL #CricketStats #Crickrida") -> str:
    parts = [headline]
    if detail:
        parts.append("")
        parts.append(detail)
    parts.append("")
    parts.append(hashtags)
    return "\n".join(parts)


# ── Insight Discovery Engines ────────────────────────────────────────────────

def discover_milestones() -> list[dict]:
    """Find players approaching round-number milestones."""
    insights = []

    # Batting milestones
    BATTING_MILESTONES = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]
    batters = query("""
        SELECT batter AS player,
               SUM(runs_batter) AS total_runs,
               COUNT(DISTINCT match_id) AS matches
        FROM deliveries
        WHERE is_super_over = false
        GROUP BY batter
        HAVING total_runs >= 800
        ORDER BY total_runs DESC
    """)

    for b in batters:
        runs = b["total_runs"]
        for milestone in BATTING_MILESTONES:
            remaining = milestone - runs
            if 1 <= remaining <= 100:
                proximity_boost = int((100 - remaining) * 0.3)
                milestone_boost = min(milestone // 1000 * 5, 25)
                insights.append({
                    "id": _id("milestone_runs", b["player"], milestone),
                    "category": "milestone",
                    "icon": "🎯",
                    "headline": f"{b['player']} is {remaining} runs away from {milestone:,} IPL runs",
                    "detail": f"Currently at {runs:,} runs in {b['matches']} matches. A big innings could seal it!",
                    "stats": {"player": b["player"], "current": runs, "target": milestone, "remaining": remaining, "matches": b["matches"]},
                    "tweet_text": _tweet(
                        f"🎯 {b['player']} is just {remaining} runs away from {milestone:,} IPL runs!",
                        f"Currently: {runs:,} runs in {b['matches']} matches.\nOne big knock and history is made.",
                    ),
                    "card_config": {
                        "style": "neon", "title": b["player"],
                        "subtitle": "MILESTONE WATCH", "hero_stat": str(remaining),
                        "hero_label": f"RUNS TO {milestone:,}",
                        "stats": {"Current Runs": f"{runs:,}", "Matches": str(b["matches"]), "Target": f"{milestone:,}"},
                    },
                    "shareability_score": _score(65, proximity=proximity_boost, milestone=milestone_boost),
                    "tags": ["batting", "milestones", b["player"]],
                })
                break  # only closest milestone per player

    # Sixes milestones
    SIX_MILESTONES = [100, 150, 200, 250, 300, 350, 400]
    sixers = query("""
        SELECT batter AS player,
               COUNT(*) AS total_sixes,
               COUNT(DISTINCT match_id) AS matches
        FROM deliveries
        WHERE runs_batter = 6 AND extras_wides = 0
          AND is_super_over = false
        GROUP BY batter
        HAVING total_sixes >= 80
        ORDER BY total_sixes DESC
    """)

    for s in sixers:
        sixes = s["total_sixes"]
        for milestone in SIX_MILESTONES:
            remaining = milestone - sixes
            if 1 <= remaining <= 20:
                insights.append({
                    "id": _id("milestone_sixes", s["player"], milestone),
                    "category": "milestone",
                    "icon": "💥",
                    "headline": f"{s['player']} needs {remaining} more sixes to reach {milestone} IPL sixes!",
                    "detail": f"Currently at {sixes} sixes in {s['matches']} matches.",
                    "stats": {"player": s["player"], "current": sixes, "target": milestone, "remaining": remaining},
                    "tweet_text": _tweet(
                        f"💥 {s['player']} is {remaining} sixes from reaching {milestone} IPL sixes!",
                        f"Current tally: {sixes} maximums in {s['matches']} matches."
                    ),
                    "card_config": {
                        "style": "electric", "title": s["player"],
                        "subtitle": "SIX-HITTING MILESTONE", "hero_stat": str(remaining),
                        "hero_label": f"TO {milestone} SIXES",
                        "stats": {"Current Sixes": str(sixes), "Matches": str(s["matches"]), "Target": str(milestone)},
                    },
                    "shareability_score": _score(60, proximity=int((20 - remaining) * 2)),
                    "tags": ["batting", "sixes", s["player"]],
                })
                break

    # Wicket milestones
    WICKET_MILESTONES = [50, 75, 100, 125, 150, 175, 200]
    bowlers = query("""
        SELECT bowler AS player,
               COUNT(*) AS total_wickets,
               COUNT(DISTINCT match_id) AS matches
        FROM deliveries
        WHERE is_wicket = true AND is_super_over = false
          AND dismissal_kind NOT IN ('run out', 'retired hurt', 'retired out', 'obstructing the field')
        GROUP BY bowler
        HAVING total_wickets >= 40
        ORDER BY total_wickets DESC
    """)

    for bw in bowlers:
        wkts = bw["total_wickets"]
        for milestone in WICKET_MILESTONES:
            remaining = milestone - wkts
            if 1 <= remaining <= 15:
                insights.append({
                    "id": _id("milestone_wickets", bw["player"], milestone),
                    "category": "milestone",
                    "icon": "🔥",
                    "headline": f"{bw['player']} is {remaining} wickets from {milestone} IPL wickets!",
                    "detail": f"Currently at {wkts} wickets in {bw['matches']} matches.",
                    "stats": {"player": bw["player"], "current": wkts, "target": milestone, "remaining": remaining},
                    "tweet_text": _tweet(
                        f"🔥 {bw['player']} — just {remaining} wickets from the {milestone}-wicket club!",
                        f"Standing at {wkts} wickets in {bw['matches']} IPL matches."
                    ),
                    "card_config": {
                        "style": "neon", "title": bw["player"],
                        "subtitle": "WICKET MILESTONE", "hero_stat": str(remaining),
                        "hero_label": f"TO {milestone} WKTS",
                        "stats": {"Wickets": str(wkts), "Matches": str(bw["matches"]), "Target": str(milestone)},
                    },
                    "shareability_score": _score(60, proximity=int((15 - remaining) * 3)),
                    "tags": ["bowling", "milestones", bw["player"]],
                })
                break

    return insights


def discover_streaks() -> list[dict]:
    """Find notable team and player streaks."""
    insights = []

    # Team winning streaks (all-time best)
    teams_data = query("""
        WITH team_matches AS (
            SELECT
                CASE WHEN team1 = winner THEN team1
                     WHEN team2 = winner THEN team2
                END AS team,
                date, winner, match_id,
                team1, team2
            FROM matches
            WHERE winner IS NOT NULL
        ),
        all_team_games AS (
            SELECT team1 AS team, date, winner, match_id FROM matches WHERE winner IS NOT NULL
            UNION ALL
            SELECT team2 AS team, date, winner, match_id FROM matches WHERE winner IS NOT NULL
        ),
        ordered AS (
            SELECT team, date,
                   CASE WHEN team = winner THEN 'W' ELSE 'L' END AS result,
                   ROW_NUMBER() OVER (PARTITION BY team ORDER BY date DESC) AS rn
            FROM all_team_games
            WHERE team IS NOT NULL
        )
        SELECT team,
               MIN(CASE WHEN result = 'L' THEN rn ELSE 999 END) - 1 AS current_win_streak
        FROM ordered
        GROUP BY team
        HAVING current_win_streak >= 3
        ORDER BY current_win_streak DESC
    """)

    for t in teams_data:
        streak = t["current_win_streak"]
        team = normalize_team(t["team"])
        if streak >= 4:
            insights.append({
                "id": _id("streak_team", team),
                "category": "streak",
                "icon": "🔥",
                "headline": f"{team} are on a {streak}-match winning streak!",
                "detail": "On fire! Can they keep the momentum going?",
                "stats": {"team": team, "streak": streak, "type": "wins"},
                "tweet_text": _tweet(
                    f"🔥 {team} — {streak} wins in a row!",
                    "That's elite form. Who's stopping this train?"
                ),
                "card_config": {
                    "style": "electric", "title": team,
                    "subtitle": "WIN STREAK", "hero_stat": str(streak),
                    "hero_label": "CONSECUTIVE WINS",
                },
                "shareability_score": _score(55, streak=min(streak * 5, 30)),
                "tags": ["teams", "streaks", team],
            })

    # Top scorers' consistency — players with most 50+ scores
    consistent = query("""
        WITH innings AS (
            SELECT batter, match_id, SUM(runs_batter) AS runs
            FROM deliveries
            WHERE is_super_over = false
            GROUP BY batter, match_id
        )
        SELECT batter AS player,
               COUNT(*) FILTER (WHERE runs >= 50) AS fifties,
               COUNT(*) AS matches,
               ROUND(COUNT(*) FILTER (WHERE runs >= 50) * 100.0 / COUNT(*), 1) AS fifty_pct
        FROM innings
        GROUP BY batter
        HAVING matches >= 50 AND fifty_pct >= 20
        ORDER BY fifty_pct DESC
        LIMIT 5
    """)

    for c in consistent:
        insights.append({
            "id": _id("consistency", c["player"]),
            "category": "streak",
            "icon": "🏆",
            "headline": f"{c['player']} scores 50+ in {c['fifty_pct']}% of innings!",
            "detail": f"{c['fifties']} half-centuries in {c['matches']} innings — elite consistency.",
            "stats": {"player": c["player"], "fifties": c["fifties"], "matches": c["matches"], "rate": f"{c['fifty_pct']}%"},
            "tweet_text": _tweet(
                f"🏆 {c['player']} — 50+ in every {int(100 / c['fifty_pct'])}th innings!",
                f"{c['fifties']} fifties in {c['matches']} innings ({c['fifty_pct']}% conversion rate).\nThat's consistency you can't ignore."
            ),
            "card_config": {
                "style": "neon", "title": c["player"],
                "subtitle": "CONSISTENCY KING", "hero_stat": f"{c['fifty_pct']}%",
                "hero_label": "50+ RATE",
                "stats": {"Fifties": str(c["fifties"]), "Innings": str(c["matches"]), "Conversion": f"{c['fifty_pct']}%"},
            },
            "shareability_score": _score(68, rate=int(c["fifty_pct"] * 0.5)),
            "tags": ["batting", "consistency", c["player"]],
        })

    return insights


def discover_did_you_know() -> list[dict]:
    """Find surprising and unusual statistical facts."""
    insights = []

    # Batter vs Bowler dominance
    dominance = query("""
        SELECT d.batter, d.bowler,
               SUM(d.runs_batter) AS runs, COUNT(*) AS balls,
               ROUND(SUM(d.runs_batter) * 100.0 / NULLIF(COUNT(*), 0), 1) AS sr,
               COUNT(*) FILTER (WHERE d.runs_batter = 6 AND d.extras_wides = 0 AND d.extras_noballs = 0) AS sixes
        FROM deliveries d
        WHERE d.is_super_over = false
        GROUP BY d.batter, d.bowler
        HAVING balls >= 30 AND sr >= 180
        ORDER BY sr DESC
        LIMIT 8
    """)

    for d in dominance:
        insights.append({
            "id": _id("matchup", d["batter"], d["bowler"]),
            "category": "did_you_know",
            "icon": "⚡",
            "headline": f"{d['batter']} smashes {d['bowler']} at {d['sr']} SR!",
            "detail": f"{d['runs']} runs off {d['balls']} balls with {d['sixes']} sixes. Total domination.",
            "stats": {"batter": d["batter"], "bowler": d["bowler"], "runs": d["runs"], "balls": d["balls"], "sr": d["sr"], "sixes": d["sixes"]},
            "tweet_text": _tweet(
                f"⚡ {d['batter']} vs {d['bowler']}:",
                f"{d['runs']} runs off {d['balls']} balls at {d['sr']} SR.\n{d['sixes']} sixes. Pure domination. 🏏"
            ),
            "card_config": {
                "style": "electric", "title": f"{d['batter']} vs {d['bowler']}",
                "subtitle": "MATCHUP DOMINANCE", "hero_stat": str(d["sr"]),
                "hero_label": "STRIKE RATE",
                "stats": {"Runs": str(d["runs"]), "Balls": str(d["balls"]), "Sixes": str(d["sixes"])},
            },
            "shareability_score": _score(72, sr=int((d["sr"] - 180) * 0.3)),
            "tags": ["matchups", d["batter"], d["bowler"]],
        })

    # Players with most ducks
    ducks = query("""
        WITH innings AS (
            SELECT batter, match_id, SUM(runs_batter) AS runs
            FROM deliveries
            WHERE is_super_over = false
            GROUP BY batter, match_id
        )
        SELECT batter AS player,
               COUNT(*) FILTER (WHERE runs = 0) AS ducks,
               COUNT(*) AS total_innings
        FROM innings
        GROUP BY batter
        HAVING ducks >= 10
        ORDER BY ducks DESC
        LIMIT 5
    """)

    for dk in ducks:
        insights.append({
            "id": _id("ducks", dk["player"]),
            "category": "did_you_know",
            "icon": "🦆",
            "headline": f"{dk['player']} has {dk['ducks']} ducks in IPL!",
            "detail": f"Out for zero {dk['ducks']} times in {dk['total_innings']} innings. Even legends walk back sometimes.",
            "stats": {"player": dk["player"], "ducks": dk["ducks"], "innings": dk["total_innings"]},
            "tweet_text": _tweet(
                f"🦆 {dk['player']} — {dk['ducks']} ducks in {dk['total_innings']} IPL innings!",
                f"Even the greats have bad days.\nBut {dk['player']} keeps coming back stronger."
            ),
            "card_config": {
                "style": "vintage", "title": dk["player"],
                "subtitle": "DID YOU KNOW?", "hero_stat": str(dk["ducks"]),
                "hero_label": "GOLDEN DUCKS",
                "stats": {"Ducks": str(dk["ducks"]), "Innings": str(dk["total_innings"])},
            },
            "shareability_score": _score(65, ducks=min(dk["ducks"] * 2, 20)),
            "tags": ["fun_facts", "ducks", dk["player"]],
        })

    # Highest individual scores all time
    big_scores = query("""
        SELECT batter AS player,
               SUM(runs_batter) AS score,
               COUNT(*) FILTER (WHERE extras_wides = 0) AS balls,
               COUNT(*) FILTER (WHERE runs_batter = 6 AND extras_wides = 0) AS sixes,
               COUNT(*) FILTER (WHERE runs_batter = 4 AND extras_wides = 0) AS fours,
               ROUND(SUM(runs_batter) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE extras_wides = 0), 0), 1) AS sr,
               match_id
        FROM deliveries
        WHERE is_super_over = false
        GROUP BY batter, match_id
        ORDER BY score DESC
        LIMIT 5
    """)

    for bs in big_scores:
        m_info = query("SELECT team1, team2, season, date FROM matches WHERE match_id = ?", [bs["match_id"]])
        context = f"{m_info[0]['team1']} vs {m_info[0]['team2']}, {m_info[0]['season']}" if m_info else ""
        insights.append({
            "id": _id("big_score", bs["player"], bs["score"]),
            "category": "record_watch",
            "icon": "🏏",
            "headline": f"{bs['player']} — {bs['score']}* off {bs['balls']} balls!",
            "detail": f"{bs['fours']} fours, {bs['sixes']} sixes at {bs['sr']} SR. {context}",
            "stats": {"player": bs["player"], "score": bs["score"], "balls": bs["balls"], "sr": bs["sr"], "fours": bs["fours"], "sixes": bs["sixes"]},
            "tweet_text": _tweet(
                f"🏏 {bs['player']} — {bs['score']}* ({bs['balls']}b)",
                f"{bs['fours']} fours, {bs['sixes']} sixes, {bs['sr']} SR.\n{context}\nOne of IPL's greatest knocks ever. 🔥"
            ),
            "card_config": {
                "style": "electric", "title": bs["player"],
                "subtitle": "ALL-TIME HIGH SCORE", "hero_stat": str(bs["score"]),
                "hero_label": f"OFF {bs['balls']} BALLS",
                "stats": {"Strike Rate": str(bs["sr"]), "Fours": str(bs["fours"]), "Sixes": str(bs["sixes"])},
            },
            "shareability_score": _score(80, runs=min(bs["score"] // 10, 15)),
            "tags": ["records", "batting", bs["player"]],
        })

    # Most economical death-over bowlers
    death_econ = query("""
        SELECT bowler AS player,
               COUNT(DISTINCT match_id) AS matches,
               COUNT(*) AS balls,
               SUM(runs_total) AS runs,
               ROUND(SUM(runs_total) * 6.0 / NULLIF(COUNT(*), 0), 2) AS economy,
               COUNT(*) FILTER (WHERE is_wicket = true) AS wickets
        FROM deliveries
        WHERE over_number >= 15 AND is_super_over = false
        GROUP BY bowler
        HAVING balls >= 200
        ORDER BY economy ASC
        LIMIT 5
    """)

    for de in death_econ:
        insights.append({
            "id": _id("death_econ", de["player"]),
            "category": "did_you_know",
            "icon": "🎯",
            "headline": f"{de['player']} — {de['economy']} economy in death overs!",
            "detail": f"The death-over specialist: {de['wickets']} wickets in {de['matches']} matches at the death.",
            "stats": {"player": de["player"], "economy": de["economy"], "balls": de["balls"], "wickets": de["wickets"], "matches": de["matches"]},
            "tweet_text": _tweet(
                f"🎯 {de['player']} — {de['economy']} economy at the death!",
                f"{de['wickets']} wickets in death overs across {de['matches']} matches.\nWhen it matters most, this bowler delivers."
            ),
            "card_config": {
                "style": "neon", "title": de["player"],
                "subtitle": "DEATH OVER SPECIALIST", "hero_stat": str(de["economy"]),
                "hero_label": "ECONOMY",
                "stats": {"Wickets": str(de["wickets"]), "Balls": str(de["balls"]), "Matches": str(de["matches"])},
            },
            "shareability_score": _score(70, econ=int((12 - de["economy"]) * 5)),
            "tags": ["bowling", "death_overs", de["player"]],
        })

    # Teams that have never won at certain venues (min 3 matches)
    venue_nemesis = query("""
        WITH team_venue AS (
            SELECT CASE WHEN team1 = t.team THEN team1 ELSE team2 END AS team,
                   m.venue, m.winner
            FROM matches m,
            (SELECT DISTINCT team1 AS team FROM matches UNION SELECT DISTINCT team2 FROM matches) t
            WHERE (m.team1 = t.team OR m.team2 = t.team) AND m.winner IS NOT NULL
        )
        SELECT team, venue,
               COUNT(*) AS matches,
               COUNT(*) FILTER (WHERE winner = team) AS wins,
               COUNT(*) FILTER (WHERE winner != team) AS losses
        FROM team_venue
        GROUP BY team, venue
        HAVING matches >= 4 AND wins = 0
        ORDER BY losses DESC
        LIMIT 5
    """)

    for vn in venue_nemesis:
        team = normalize_team(vn["team"])
        insights.append({
            "id": _id("venue_curse", team, vn["venue"]),
            "category": "did_you_know",
            "icon": "😱",
            "headline": f"{team} have NEVER won at {vn['venue']}!",
            "detail": f"Lost all {vn['losses']} matches at this venue. The curse is real.",
            "stats": {"team": team, "venue": vn["venue"], "matches": vn["matches"], "losses": vn["losses"]},
            "tweet_text": _tweet(
                f"😱 {team} — 0 wins in {vn['losses']} matches at {vn['venue']}!",
                "A genuine bogey ground. Will they ever break the curse?"
            ),
            "card_config": {
                "style": "vintage", "title": team,
                "subtitle": "BOGEY GROUND", "hero_stat": f"0/{vn['losses']}",
                "hero_label": "WIN RECORD",
                "stats": {"Venue": vn["venue"], "Matches": str(vn["matches"]), "Losses": str(vn["losses"])},
            },
            "shareability_score": _score(72, matches=min(vn["losses"] * 4, 20)),
            "tags": ["teams", "venues", team],
        })

    return insights


def discover_on_this_day(target_date: date | None = None) -> list[dict]:
    """Find IPL moments that happened on a given date (or today) in history."""
    insights = []
    today = target_date or date.today()

    matches_today = query("""
        SELECT m.match_id, m.season, m.date, m.team1, m.team2, m.winner,
               m.win_by_runs, m.win_by_wickets, m.venue, m.player_of_match
        FROM matches m
        WHERE EXTRACT(MONTH FROM m.date) = ? AND EXTRACT(DAY FROM m.date) = ?
        ORDER BY m.season DESC
    """, [today.month, today.day])

    for m in matches_today:
        match_date = m["date"]
        if isinstance(match_date, str):
            match_date = datetime.strptime(match_date, "%Y-%m-%d").date()
        years_ago = today.year - match_date.year
        margin = f"{m['win_by_runs']} runs" if m.get("win_by_runs") else f"{m['win_by_wickets']} wickets" if m.get("win_by_wickets") else ""
        winner = normalize_team(m["winner"]) if m.get("winner") else "No result"

        # Get top performer from that match
        top_bat = query("""
            SELECT batter AS player, SUM(runs_batter) AS runs, COUNT(*) AS balls
            FROM deliveries WHERE match_id = ? AND is_super_over = false
            GROUP BY batter ORDER BY runs DESC LIMIT 1
        """, [m["match_id"]])

        top_perf = f"{top_bat[0]['player']}: {top_bat[0]['runs']}({top_bat[0]['balls']})" if top_bat else ""

        insights.append({
            "id": _id("otd", m["match_id"]),
            "category": "on_this_day",
            "icon": "📅",
            "headline": f"On this day in {m['season']}: {normalize_team(m['team1'])} vs {normalize_team(m['team2'])}",
            "detail": f"{winner} won by {margin}. POTM: {m.get('player_of_match', 'N/A')}. {top_perf}. ({years_ago} years ago)",
            "stats": {
                "season": m["season"], "team1": normalize_team(m["team1"]), "team2": normalize_team(m["team2"]),
                "winner": winner, "margin": margin, "venue": m["venue"],
                "potm": m.get("player_of_match"), "years_ago": years_ago,
            },
            "tweet_text": _tweet(
                f"📅 #OnThisDay in IPL {m['season']} ({years_ago} years ago)",
                f"{normalize_team(m['team1'])} vs {normalize_team(m['team2'])}\n{winner} won by {margin}\n🏏 POTM: {m.get('player_of_match', 'N/A')}"
            ),
            "card_config": {
                "style": "vintage", "title": f"{normalize_team(m['team1'])} vs {normalize_team(m['team2'])}",
                "subtitle": f"ON THIS DAY — IPL {m['season']}", "hero_stat": str(years_ago),
                "hero_label": "YEARS AGO",
                "stats": {"Winner": winner, "Margin": margin, "Venue": m["venue"], "POTM": m.get("player_of_match", "N/A")},
            },
            "shareability_score": _score(55, years=min(years_ago * 3, 25)),
            "tags": ["on_this_day", m["season"]],
        })

    return insights


def discover_records() -> list[dict]:
    """Find all-time records and record holders."""
    insights = []

    # Most POTM awards
    potm = query("""
        SELECT player_of_match AS player, COUNT(*) AS awards
        FROM matches
        WHERE player_of_match IS NOT NULL
        GROUP BY player_of_match
        ORDER BY awards DESC
        LIMIT 5
    """)

    for i, p in enumerate(potm):
        insights.append({
            "id": _id("potm", p["player"]),
            "category": "record_watch",
            "icon": "🏅",
            "headline": f"{p['player']} — {p['awards']} Player of the Match awards!",
            "detail": f"{'The undisputed match-winner!' if i == 0 else 'One of the greatest match-winners in IPL history.'}",
            "stats": {"player": p["player"], "awards": p["awards"], "rank": i + 1},
            "tweet_text": _tweet(
                f"🏅 {p['player']} — {p['awards']} POTM awards in IPL!",
                f"{'#1 all-time match-winner.' if i == 0 else f'Ranked #{i+1} all-time.'}\nAbsolute game-changer."
            ),
            "card_config": {
                "style": "neon", "title": p["player"],
                "subtitle": "PLAYER OF THE MATCH", "hero_stat": str(p["awards"]),
                "hero_label": "POTM AWARDS",
            },
            "shareability_score": _score(70, awards=min(p["awards"] * 2, 20), rank=max(15 - i * 5, 0)),
            "tags": ["records", "potm", p["player"]],
        })

    # Highest team totals
    big_totals = query("""
        SELECT i.batting_team AS team, i.total_runs AS score,
               i.total_wickets AS wickets, m.season, m.venue,
               m.team1, m.team2
        FROM innings i
        JOIN matches m ON i.match_id = m.match_id
        WHERE i.is_super_over = false
        ORDER BY i.total_runs DESC
        LIMIT 5
    """)

    for bt in big_totals:
        opponent = normalize_team(bt["team2"]) if normalize_team(bt["team1"]) == normalize_team(bt["team"]) else normalize_team(bt["team1"])
        insights.append({
            "id": _id("big_total", bt["team"], bt["score"], bt["season"]),
            "category": "record_watch",
            "icon": "📊",
            "headline": f"{normalize_team(bt['team'])} scored {bt['score']}/{bt['wickets']}!",
            "detail": f"vs {opponent} in IPL {bt['season']} at {bt['venue']}. One of the highest totals ever!",
            "stats": {"team": normalize_team(bt["team"]), "score": bt["score"], "wickets": bt["wickets"], "season": bt["season"], "opponent": opponent},
            "tweet_text": _tweet(
                f"📊 {normalize_team(bt['team'])} — {bt['score']}/{bt['wickets']}",
                f"vs {opponent}, IPL {bt['season']} at {bt['venue']}.\nAmong the highest totals in IPL history!"
            ),
            "card_config": {
                "style": "electric", "title": normalize_team(bt["team"]),
                "subtitle": "MONSTER TOTAL", "hero_stat": str(bt["score"]),
                "hero_label": f"vs {opponent}",
                "stats": {"Season": bt["season"], "Wickets Lost": str(bt["wickets"]), "Venue": bt["venue"]},
            },
            "shareability_score": _score(68, score=min(bt["score"] // 20, 15)),
            "tags": ["records", "team_totals"],
        })

    return insights


# ── API Endpoints ────────────────────────────────────────────────────────────

@router.get("/feed")
def get_pulse_feed(category: Optional[str] = None, limit: int = 30):
    """Main feed: aggregated, auto-discovered insights sorted by shareability."""
    all_insights = []

    try:
        all_insights.extend(discover_milestones())
    except Exception as e:
        print(f"[Pulse] milestones error: {e}")

    try:
        all_insights.extend(discover_streaks())
    except Exception as e:
        print(f"[Pulse] streaks error: {e}")

    try:
        all_insights.extend(discover_did_you_know())
    except Exception as e:
        print(f"[Pulse] did_you_know error: {e}")

    try:
        all_insights.extend(discover_records())
    except Exception as e:
        print(f"[Pulse] records error: {e}")

    if category:
        all_insights = [i for i in all_insights if i["category"] == category]

    # Sort by shareability score, highest first
    all_insights.sort(key=lambda x: x["shareability_score"], reverse=True)

    return {
        "total": len(all_insights),
        "insights": all_insights[:limit],
        "categories": list(set(i["category"] for i in all_insights)),
    }


@router.get("/on-this-day")
def get_on_this_day(month: int | None = None, day: int | None = None):
    """Historical IPL moments on today's date (or a specific month/day)."""
    from datetime import date as _date
    target = None
    if month and day:
        try:
            target = _date(2000, month, day)  # year doesn't matter, we only use month/day
        except ValueError:
            pass
    insights = discover_on_this_day(target)
    actual_date = target or _date.today()
    return {
        "date": actual_date.isoformat(),
        "total": len(insights),
        "insights": insights,
    }


@router.get("/calendar-month")
def get_calendar_month(month: int):
    """Return which days in a given month had IPL matches (across all years)."""
    if month < 1 or month > 12:
        raise HTTPException(400, "Month must be 1-12")
    rows = query("""
        SELECT EXTRACT(DAY FROM date)::INTEGER AS day, COUNT(*) AS match_count
        FROM matches
        WHERE EXTRACT(MONTH FROM date) = ?
        GROUP BY day
        ORDER BY day
    """, [month])
    days = {r["day"]: r["match_count"] for r in rows}
    return {"month": month, "days": days}


@router.get("/trending")
def get_trending(limit: int = 10):
    """Top N highest-shareability insights — the cream of the crop."""
    all_insights = []

    try:
        all_insights.extend(discover_milestones())
        all_insights.extend(discover_streaks())
        all_insights.extend(discover_did_you_know())
        all_insights.extend(discover_records())
    except Exception:
        pass

    all_insights.sort(key=lambda x: x["shareability_score"], reverse=True)

    return {
        "insights": all_insights[:limit],
        "total": len(all_insights),
    }


@router.post("/insight-card")
async def generate_insight_card(req: dict):
    """Generate a branded image card from an insight's card_config."""
    try:
        from .images import generate_stat_card_image, ImageGenRequest

        config = req.get("card_config", {})
        dims = req.get("dimensions", {"width": 1200, "height": 675})

        image_req = ImageGenRequest(
            style=config.get("style", "neon"),
            width=dims.get("width", 1200),
            height=dims.get("height", 675),
            title=config.get("title"),
            subtitle=config.get("subtitle"),
            hero_stat=config.get("hero_stat"),
            hero_label=config.get("hero_label"),
            stats=config.get("stats"),
            team_color=config.get("team_color"),
        )

        import base64
        img_bytes = generate_stat_card_image(image_req)
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        return {"image": f"data:image/png;base64,{b64}"}

    except Exception as e:
        raise HTTPException(500, f"Card generation failed: {str(e)}")
