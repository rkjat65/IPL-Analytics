"""Server-side SEO for the single-page app.

Crawlers and link-preview bots (Google, Bing, AI answer engines, WhatsApp, X)
often don't run JavaScript, so every route gets real HTML from the server:
a page-specific <title>, description, canonical URL, Open Graph/Twitter tags,
JSON-LD and a readable summary with internal links inside #root. React
replaces that summary when it mounts, and react-helmet-async takes over the
tags (they carry data-rh so Helmet treats them as its own).
"""

from __future__ import annotations

import html
import json
from dataclasses import dataclass, field
from functools import lru_cache
from urllib.parse import quote

from .database import normalize_team, query
from .tournaments import TOURNAMENTS, get_tournament, get_tournament_slug

SITE_URL = "https://crickrida.rkjat.in"
SITE_NAME = "Crickrida"
TWITTER_HANDLE = "@Rkjat65"


@dataclass
class PageMeta:
    title: str
    description: str
    path: str  # canonical path, without the tournament query
    heading: str = ""
    kicker: str = ""
    stats: list[tuple[str, str]] = field(default_factory=list)
    links: list[tuple[str, str]] = field(default_factory=list)
    links_heading: str = ""
    schema: list[dict] = field(default_factory=list)
    status: int = 200
    og_type: str = "website"


# ── URL helpers ──────────────────────────────────────────────────────────────

def _tq(slug: str | None = None) -> str:
    """Query string that selects a tournament; IPL is the default (none)."""
    slug = slug or get_tournament_slug()
    return "" if slug == "ipl" else f"?tournament={slug}"


def canonical_url(path: str, slug: str | None = None) -> str:
    return f"{SITE_URL}{path}{_tq(slug)}"


def enc(value) -> str:
    return quote(str(value), safe="")


def og_image_url(path: str, slug: str | None = None) -> str:
    slug = slug or get_tournament_slug()
    return f"{SITE_URL}/api/og?path={quote(path, safe='')}&tournament={slug}"


def _fmt(value, decimals: int = 2) -> str:
    if value is None or value == "":
        return "–"
    if isinstance(value, float):
        return f"{value:,.{decimals}f}"
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def _breadcrumbs(items: list[tuple[str, str]]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": canonical_url(path)}
            for i, (name, path) in enumerate(items)
        ],
    }


# ── Data (cached per tournament; the databases are read-only) ───────────────

@lru_cache(maxsize=4)
def _seasons(slug: str) -> list[str]:
    rows = query("SELECT DISTINCT season FROM matches ORDER BY season")
    return [r["season"] for r in rows]


@lru_cache(maxsize=4)
def _teams(slug: str) -> list[dict]:
    """Teams under their current names (historical names folded in)."""
    rows = query(
        """
        SELECT team, COUNT(*) AS matches,
               SUM(CASE WHEN winner = team THEN 1 ELSE 0 END) AS wins
        FROM (SELECT team1 AS team, winner FROM matches
              UNION ALL SELECT team2 AS team, winner FROM matches)
        GROUP BY team
        """
    )
    merged: dict[str, dict] = {}
    for r in rows:
        name = normalize_team(r["team"])
        entry = merged.setdefault(name, {"team": name, "matches": 0, "wins": 0})
        entry["matches"] += r["matches"]
        entry["wins"] += r["wins"]
    return sorted(merged.values(), key=lambda e: -e["matches"])


@lru_cache(maxsize=4)
def _top_batters(slug: str, limit: int = 50) -> list[dict]:
    return query(
        """
        SELECT batter AS player, SUM(runs_batter) AS runs
        FROM deliveries WHERE NOT is_super_over
        GROUP BY batter ORDER BY runs DESC LIMIT ?
        """,
        [limit],
    )


@lru_cache(maxsize=4)
def _top_bowlers(slug: str, limit: int = 50) -> list[dict]:
    return query(
        """
        SELECT bowler AS player,
               SUM(CASE WHEN is_wicket AND dismissal_kind NOT IN
                   ('run out','retired hurt','retired out','obstructing the field')
                   THEN 1 ELSE 0 END) AS wickets
        FROM deliveries WHERE NOT is_super_over
        GROUP BY bowler ORDER BY wickets DESC LIMIT ?
        """,
        [limit],
    )


@lru_cache(maxsize=4)
def _all_players(slug: str) -> tuple[set, set]:
    batters = {r["p"] for r in query("SELECT DISTINCT batter AS p FROM deliveries")}
    bowlers = {r["p"] for r in query("SELECT DISTINCT bowler AS p FROM deliveries")}
    return batters, bowlers


@lru_cache(maxsize=4)
def _venues(slug: str) -> list[dict]:
    from .routers.venues import list_venues

    return list_venues()


@lru_cache(maxsize=4)
def _recent_matches(slug: str, limit: int = 40) -> list[dict]:
    rows = query(
        """
        SELECT match_id, date, season, team1, team2, winner
        FROM matches ORDER BY date DESC, match_id DESC LIMIT ?
        """,
        [limit],
    )
    for r in rows:
        for key in ("team1", "team2", "winner"):
            if r.get(key):
                r[key] = normalize_team(r[key])
    return rows


@lru_cache(maxsize=4)
def _all_matches(slug: str) -> list[dict]:
    return query("SELECT match_id, date FROM matches ORDER BY date")


@lru_cache(maxsize=2048)
def _player(slug: str, name: str) -> tuple[dict | None, dict | None]:
    from .routers.players import batting_profile, bowling_profile

    batters, bowlers = _all_players(slug)
    bat = bowl = None
    if name in batters:
        bat = (batting_profile(name) or {}).get("career") or None
    if name in bowlers:
        bowl = (bowling_profile(name) or {}).get("career") or None
        if bowl and not bowl.get("wickets") and not bowl.get("total_balls"):
            bowl = None
    return bat, bowl


@lru_cache(maxsize=512)
def _team(slug: str, name: str) -> dict | None:
    from .routers.teams import team_stats

    if name not in {t["team"] for t in _teams(slug)}:
        return None
    return team_stats(name)


@lru_cache(maxsize=512)
def _venue(slug: str, name: str) -> dict | None:
    from .routers.venues import venue_stats

    try:
        data = venue_stats(name)
    except Exception:
        return None
    stats = (data or {}).get("stats") or {}
    return data if stats.get("matches") else None


@lru_cache(maxsize=4096)
def _match(slug: str, match_id: str) -> dict | None:
    rows = query(
        """
        SELECT m.*, (SELECT LIST(STRUCT_PACK(team := batting_team, runs := total_runs,
                     wkts := total_wickets, balls := total_balls) ORDER BY innings_number)
                     FROM innings i WHERE i.match_id = m.match_id AND NOT i.is_super_over) AS inns
        FROM matches m WHERE m.match_id = ?
        """,
        [match_id],
    )
    if not rows:
        return None
    m = rows[0]
    for key in ("team1", "team2", "winner", "toss_winner"):
        if m.get(key):
            m[key] = normalize_team(m[key])
    for inn in m.get("inns") or []:
        inn["team"] = normalize_team(inn["team"])
    return m


@lru_cache(maxsize=256)
def _season(slug: str, season: str) -> dict | None:
    from .routers.seasons import season_summary

    if season not in _seasons(slug):
        return None
    return season_summary(season)


# ── Page builders ────────────────────────────────────────────────────────────

def _static_pages() -> dict[str, tuple[str, str]]:
    t = get_tournament()
    comp, comps = t.competition_label.lower(), f"{t.competition_label}s"
    return {
        "/dashboard": (
            f"{t.short_name} Dashboard — Stats, Leaderboards & {t.competition_label} Trends",
            f"Free {t.short_name} analytics built on ball-by-ball data: batting and bowling "
            f"leaderboards, match results, records and {comp} trends. No sign-up needed.",
        ),
        "/matches": (
            f"{t.short_name} Matches — Full Archive, Scorecards & Results",
            f"Browse every {t.name} match with scorecards, results and match summaries. "
            f"Filter by {comp} and team.",
        ),
        "/batting": (
            f"{t.short_name} Batting Records & Leaderboard",
            f"{t.name} batting records: top run-scorers, strike rates, centuries, fifties "
            f"and averages across every {comp}.",
        ),
        "/bowling": (
            f"{t.short_name} Bowling Records & Leaderboard",
            f"{t.name} bowling records: top wicket-takers, economy rates, averages and "
            f"best figures across every {comp}.",
        ),
        "/batting/compare": (
            f"{t.short_name} Batting Comparison — Compare Players Side by Side",
            f"Compare any {t.short_name} batters side by side: runs, average, strike rate, "
            "centuries and more.",
        ),
        "/teams": (
            f"{t.short_name} Teams — Stats, Win Records & History",
            f"Every {t.name} team: win rates, head-to-head records, {comp} history and titles.",
        ),
        "/venues": (
            f"{t.short_name} Venues — Stadium Stats & Records",
            f"{t.name} venue analytics: average scores, highest and lowest totals, toss and "
            "chasing records for every ground.",
        ),
        "/seasons": (
            f"{t.short_name} {comps} — Records, Standings & Leaders",
            f"Every {t.name} {comp}: champions, standings, leading run-scorers and "
            "wicket-takers.",
        ),
        "/h2h": (
            f"{t.short_name} Head-to-Head — Team Rivalry Stats",
            f"Compare any two {t.name} teams: all-time win-loss records, venues and recent form.",
        ),
        "/charts": (
            f"{t.short_name} Charts & Insights — Visual Analytics",
            f"Visual analytics for {t.name}: phase run rates, dismissals, toss impact and "
            "scoring trends.",
        ),
        "/pulse": (
            f"Cricket Pulse — Trending {t.short_name} Insights, Streaks & On This Day",
            f"Fresh {t.short_name} insights from ball-by-ball data: milestones, streaks, records "
            "about to fall and what happened on this day in history.",
        ),
        "/player-impact": (
            f"{t.short_name} Player Impact Index — Batting, Bowling & All-Rounder Ratings",
            f"Who really wins {t.short_name} matches? Impact ratings for batters, bowlers and "
            "all-rounders that go beyond raw totals.",
        ),
        "/content-studio": (
            "Studio — Free Cricket Stat Card Maker",
            f"Turn any {t.short_name} stat into a branded card for X, Instagram, LinkedIn or "
            "stories in seconds. Free, no sign-up.",
        ),
        "/fantasy": (
            f"{t.short_name} Fantasy Picks — Projected Points, Captain & Vice-Captain",
            f"Pick two {t.short_name} teams and a venue to get projected fantasy points from recent "
            "form and venue record, with a suggested XI, captain and vice-captain. Free.",
        ),
        "/quiz": (
            f"Guess the {t.short_name} Player — Cricket Stats Quiz",
            f"Can you name the {t.short_name} player from their career stats? Play the free quiz, "
            "keep your streak and share your score.",
        ),
        "/bowling/compare": (
            f"{t.short_name} Bowling Comparison — Compare Bowlers Side by Side",
            f"Compare {t.short_name} bowlers side by side: wickets, economy, average, strike rate "
            "and dot-ball percentage.",
        ),
        "/records": (
            f"{t.short_name} Records: Highest Scores, Best Bowling, Partnerships and Fastest Fifties",
            f"Every {t.name} record from ball-by-ball data: highest scores, fastest fifties and hundreds, "
            f"best bowling figures, highest totals and chases, biggest wins, partnerships, hat-tricks and "
            f"batter-versus-bowler duels, filterable by {comp}, team and venue.",
        ),
        "/players": (
            f"{t.short_name} Players: Every Cricketer in the Archive",
            f"Browse every {t.name} player with role, teams, {comps.lower()} played, runs, average, "
            "strike rate, wickets and economy.",
        ),
        "/matchups": (
            f"{t.short_name} Batter vs Bowler Matchups: Head-to-Head Duels",
            f"Pick any {t.short_name} batter and bowler to see their ball-by-ball duel: balls, runs, strike rate, "
            "dismissals, dot-ball and boundary rates by phase, plus the most contested matchups in the archive.",
        ),
        "/faq": (
            f"{t.short_name} FAQ — Frequently Asked Questions",
            f"Answers to common questions about the {t.name}: format, records, teams and players.",
        ),
        "/privacy": ("Privacy Policy", "How Crickrida handles information. No sign-up, no ad trackers."),
        "/terms": ("Terms of Use", "The terms for using Crickrida's free cricket analytics."),
        "/account-deletion": ("Delete a Legacy Account", "How to delete a Crickrida account created before accounts were retired."),
    }


def _static_links(path: str) -> tuple[str, list[tuple[str, str]]]:
    slug = get_tournament_slug()
    tq = _tq(slug)
    if path == "/batting":
        return "Top run-scorers", [
            (f"{r['player']} — {r['runs']:,} runs", f"/batting/{enc(r['player'])}{tq}")
            for r in _top_batters(slug)
        ]
    if path == "/bowling":
        return "Top wicket-takers", [
            (f"{r['player']} — {r['wickets']:,} wickets", f"/bowling/{enc(r['player'])}{tq}")
            for r in _top_bowlers(slug)
        ]
    if path in ("/players", "/matchups"):
        return "Most-capped players", [
            (f"{r['player']} — {r['runs']:,} runs", f"/batting/{enc(r['player'])}{tq}")
            for r in _top_batters(slug, 25)
        ] + [
            (f"{r['player']} — {r['wickets']:,} wickets", f"/bowling/{enc(r['player'])}{tq}")
            for r in _top_bowlers(slug, 25)
        ]
    if path == "/records":
        return "Record lists", [
            (label, f"/records?tab={tab}&kind={kind}{tq.replace('?', '&')}")
            for tab, kind, label in (
                ("batting", "highest_scores", "Highest individual scores"),
                ("batting", "fastest_fifties", "Fastest fifties"),
                ("batting", "fastest_hundreds", "Fastest hundreds"),
                ("batting", "most_sixes", "Most sixes in an innings"),
                ("bowling", "best_bowling", "Best bowling figures"),
                ("bowling", "best_economy", "Best economy in a full spell"),
                ("bowling", "most_expensive", "Most expensive overs"),
                ("team", "highest_totals", "Highest team totals"),
                ("team", "lowest_totals", "Lowest team totals"),
                ("team", "highest_chases", "Highest successful chases"),
                ("team", "biggest_wins_runs", "Biggest wins by runs"),
                ("partnerships", "any", "Highest partnerships"),
                ("special", "hat_tricks", "Hat-tricks"),
                ("special", "most_awards", "Most player of the match awards"),
                ("duels", "balls", "Most contested batter versus bowler duels"),
            )
        ]
    if path in ("/teams", "/h2h"):
        return "Teams", [
            (f"{r['team']} — {r['wins']} wins in {r['matches']} matches", f"/teams/{enc(r['team'])}{tq}")
            for r in _teams(slug)
        ]
    if path == "/venues":
        return "Venues", [
            (f"{v['venue']} — {v['matches']} matches", f"/venues/{enc(v['venue'])}{tq}")
            for v in _venues(slug)[:80]
        ]
    if path == "/seasons":
        return get_tournament().competition_label + "s", [
            (s, f"/seasons/{enc(s)}{tq}") for s in reversed(_seasons(slug))
        ]
    if path in ("/matches", "/dashboard"):
        return "Recent matches", [
            (f"{m['team1']} vs {m['team2']} · {m['date']}", f"/matches/{enc(m['match_id'])}{tq}")
            for m in _recent_matches(slug, 25 if path == "/dashboard" else 40)
        ]
    return "", []


def _player_page(name: str, as_bowler: bool) -> PageMeta | None:
    from .player_identity import identity_for

    t = get_tournament()
    slug = t.slug
    identity = identity_for(name)
    if identity:
        name = identity["name"]
    bat, bowl = _player(slug, name)
    if not bat and not bowl:
        return None
    primary_bowling = as_bowler and bowl is not None or bat is None
    path = f"/{'bowling' if primary_bowling else 'batting'}/{enc(name)}"
    stats: list[tuple[str, str]] = []
    parts: list[str] = []
    if bat:
        parts.append(
            f"{_fmt(bat.get('runs'))} runs in {_fmt(bat.get('innings'))} innings at an average of "
            f"{_fmt(bat.get('avg'))} and a strike rate of {_fmt(bat.get('sr'))}"
            f" ({bat.get('hundreds') or 0} hundreds, {bat.get('fifties') or 0} fifties, highest {bat.get('highest', '–')})"
        )
    if bowl:
        parts.append(
            f"{_fmt(bowl.get('wickets'))} wickets at an economy of {_fmt(bowl.get('economy'))} "
            f"(average {_fmt(bowl.get('avg'))}, best {bowl.get('best_figures') or '–'})"
        )
    if primary_bowling and bowl:
        stats = [("Wickets", _fmt(bowl.get("wickets"))), ("Economy", _fmt(bowl.get("economy"))),
                 ("Average", _fmt(bowl.get("avg"))), ("Best", str(bowl.get("best_figures") or "–"))]
    elif bat:
        stats = [("Runs", _fmt(bat.get("runs"))), ("Average", _fmt(bat.get("avg"))),
                 ("Strike rate", _fmt(bat.get("sr"))), ("100s / 50s", f"{bat.get('hundreds') or 0} / {bat.get('fifties') or 0}")]
    role = "all-rounder" if bat and bowl and (bowl.get("wickets") or 0) >= 10 and (bat.get("runs") or 0) >= 300 \
        else ("bowler" if primary_bowling else "batter")
    description = f"{name} {t.short_name} career stats: " + "; ".join(parts) + ". Season-by-season numbers, phase splits and matchups on Crickrida."
    section = "Bowling Records" if primary_bowling else "Batting Records"
    return PageMeta(
        title=f"{name} — {t.short_name} Stats, Records & Career Profile",
        description=description,
        path=path,
        heading=name,
        kicker=f"{t.short_name} · {role} profile",
        stats=stats,
        og_type="profile",
        schema=[
            {
                "@context": "https://schema.org",
                "@type": "Person",
                "name": name,
                **({"alternateName": identity["famous_names"]} if identity and identity.get("famous_names") else {}),
                "url": canonical_url(path),
                "description": description,
                "knowsAbout": ["Cricket", t.name],
            },
            _breadcrumbs([("Dashboard", "/dashboard"),
                          (section, "/bowling" if primary_bowling else "/batting"),
                          (name, path)]),
        ],
        links_heading="Explore",
        links=[(f"{t.short_name} {section.lower()}", f"{'/bowling' if primary_bowling else '/batting'}{_tq()}"),
               ("Player impact ratings", f"/player-impact{_tq()}"),
               ("Make a stat card in Studio", f"/content-studio{_tq()}")],
    )


def _team_page(name: str) -> PageMeta | None:
    t = get_tournament()
    s = _team(t.slug, name)
    if not s:
        return None
    path = f"/teams/{enc(name)}"
    titles = s.get("titles") or 0
    description = (
        f"{name} {t.short_name} record: {_fmt(s.get('matches'))} matches, {_fmt(s.get('wins'))} wins, "
        f"{_fmt(s.get('losses'))} losses ({_fmt(s.get('win_pct'))}% win rate)"
        + (f" and {titles} title{'s' if titles != 1 else ''}" if titles else "")
        + f" across {s.get('seasons_played') or 0} {t.competition_label.lower()}s. Head-to-head records and history on Crickrida."
    )
    return PageMeta(
        title=f"{name} — {t.short_name} Team Profile, Stats & Records",
        description=description,
        path=path,
        heading=name,
        kicker=f"{t.short_name} · {t.team_label.lower()} profile",
        stats=[("Matches", _fmt(s.get("matches"))), ("Wins", _fmt(s.get("wins"))),
               ("Win %", _fmt(s.get("win_pct"), 1)), ("Titles", _fmt(titles))],
        schema=[
            {"@context": "https://schema.org", "@type": "SportsTeam", "name": name,
             "sport": "Cricket", "url": canonical_url(path), "description": description,
             "memberOf": {"@type": "SportsOrganization", "name": t.name}},
            _breadcrumbs([("Dashboard", "/dashboard"), ("Teams", "/teams"), (name, path)]),
        ],
        links_heading="Other teams",
        links=[(r["team"], f"/teams/{enc(r['team'])}{_tq()}") for r in _teams(t.slug) if r["team"] != name],
    )


def _venue_page(name: str) -> PageMeta | None:
    t = get_tournament()
    data = _venue(t.slug, name)
    if not data:
        return None
    s = data["stats"]
    canonical_name = data.get("venue") or name
    path = f"/venues/{enc(canonical_name)}"
    description = (
        f"{canonical_name} {t.short_name} stats: {_fmt(s.get('matches'))} matches, average first-innings "
        f"score {_fmt(s.get('avg_1st_innings'), 1)}, highest total {_fmt(s.get('highest_total'))}, "
        f"lowest {_fmt(s.get('lowest_total'))}; teams batting first won {_fmt(s.get('bat_first_win_pct'), 1)}%."
    )
    return PageMeta(
        title=f"{canonical_name} — {t.short_name} Venue Stats, Records & Pitch Report",
        description=description,
        path=path,
        heading=canonical_name,
        kicker=f"{t.short_name} · venue",
        stats=[("Matches", _fmt(s.get("matches"))), ("Avg 1st inns", _fmt(s.get("avg_1st_innings"), 1)),
               ("Highest", _fmt(s.get("highest_total"))), ("Bat-first win %", _fmt(s.get("bat_first_win_pct"), 1))],
        schema=[
            {"@context": "https://schema.org", "@type": "StadiumOrArena", "name": canonical_name,
             "url": canonical_url(path), "description": description},
            _breadcrumbs([("Dashboard", "/dashboard"), ("Venues", "/venues"), (canonical_name, path)]),
        ],
        links_heading="Other venues",
        links=[(v["venue"], f"/venues/{enc(v['venue'])}{_tq()}") for v in _venues(t.slug)[:30] if v["venue"] != canonical_name],
    )


def _innings_text(inn: dict) -> str:
    balls = inn.get("balls") or 0
    overs = f"{balls // 6}.{balls % 6}" if balls else ""
    return f"{inn['team']} {inn['runs']}/{inn['wkts']}" + (f" ({overs} ov)" if overs else "")


def _match_page(match_id: str) -> PageMeta | None:
    t = get_tournament()
    m = _match(t.slug, match_id)
    if not m:
        return None
    path = f"/matches/{enc(match_id)}"
    inns = m.get("inns") or []
    if m.get("winner"):
        margin = (f"{m['win_by_runs']} runs" if m.get("win_by_runs")
                  else f"{m['win_by_wickets']} wickets" if m.get("win_by_wickets") else "")
        result = f"{m['winner']} won" + (f" by {margin}" if margin else "")
    else:
        result = (m.get("result") or "No result").replace("_", " ").capitalize()
    score = "; ".join(_innings_text(i) for i in inns)
    when = f" on {m['date']}" if m.get("date") else ""
    description = (
        f"{m['team1']} vs {m['team2']}, {t.short_name} {m.get('season', '')}, at {m.get('venue') or 'unknown venue'}{when}. "
        f"{result}." + (f" Scores: {score}." if score else "")
        + (f" Player of the match: {m['player_of_match']}." if m.get("player_of_match") else "")
        + " Full scorecard and over-by-over analysis."
    )
    stats = [(i["team"], f"{i['runs']}/{i['wkts']}") for i in inns[:2]]
    if m.get("player_of_match"):
        stats.append(("Player of match", m["player_of_match"]))
    event = {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        "name": f"{m['team1']} vs {m['team2']} — {t.short_name} {m.get('season', '')}",
        "sport": "Cricket",
        "startDate": str(m.get("date") or ""),
        "url": canonical_url(path),
        "description": description,
        "eventStatus": "https://schema.org/EventScheduled",
        "competitor": [{"@type": "SportsTeam", "name": m["team1"]}, {"@type": "SportsTeam", "name": m["team2"]}],
    }
    if m.get("venue"):
        event["location"] = {"@type": "Place", "name": m["venue"], "address": m.get("city") or m["venue"]}
    return PageMeta(
        title=f"{m['team1']} vs {m['team2']} — {t.short_name} {m.get('season', '')} Scorecard & Result",
        description=description,
        path=path,
        heading=f"{m['team1']} vs {m['team2']}",
        kicker=f"{t.short_name} {m.get('season', '')} · {m.get('date', '')}",
        stats=stats,
        schema=[event, _breadcrumbs([("Dashboard", "/dashboard"), ("Matches", "/matches"),
                                     (f"{m['team1']} vs {m['team2']}", path)])],
        links_heading="Teams and venue",
        links=[(m["team1"], f"/teams/{enc(m['team1'])}{_tq()}"),
               (m["team2"], f"/teams/{enc(m['team2'])}{_tq()}")]
        + ([(m["venue"], f"/venues/{enc(m['venue'])}{_tq()}")] if m.get("venue") else []),
    )


def _season_page(season: str) -> PageMeta | None:
    t = get_tournament()
    s = _season(t.slug, season)
    if not s:
        return None
    path = f"/seasons/{enc(season)}"
    oc, pc = s.get("orange_cap") or {}, s.get("purple_cap") or {}
    bits = []
    if s.get("winner"):
        bits.append(f"Champions: {s['winner']}")
    if oc.get("player"):
        bits.append(f"{'Orange Cap' if t.slug == 'ipl' else 'Leading run-scorer'}: {oc['player']} ({oc.get('runs')} runs)")
    if pc.get("player"):
        bits.append(f"{'Purple Cap' if t.slug == 'ipl' else 'Leading wicket-taker'}: {pc['player']} ({pc.get('wickets')} wickets)")
    description = (
        f"{t.short_name} {season} {t.competition_label.lower()} review: {s.get('total_matches', 0)} matches"
        + (f" from {s['start_date']} to {s['end_date']}" if s.get("start_date") else "")
        + ". " + ". ".join(bits) + ". Standings, results and leaders on Crickrida."
    )
    return PageMeta(
        title=f"{t.short_name} {season} — Champions, Points Table, Top Scorers & Wicket-Takers",
        description=description,
        path=path,
        heading=f"{t.short_name} {season}",
        kicker=f"{t.short_name} · {t.competition_label.lower()} review",
        stats=[(k, v) for k, v in [("Champions", s.get("winner")),
                                   ("Top scorer", oc.get("player")),
                                   ("Top wicket-taker", pc.get("player")),
                                   ("Matches", _fmt(s.get("total_matches")))] if v],
        schema=[
            {"@context": "https://schema.org", "@type": "SportsEvent",
             "name": f"{t.name} {season}", "sport": "Cricket", "url": canonical_url(path),
             "description": description, "startDate": str(s.get("start_date") or ""),
             "endDate": str(s.get("end_date") or "")},
            _breadcrumbs([("Dashboard", "/dashboard"), (t.competition_label + "s", "/seasons"),
                          (season, path)]),
        ],
        links_heading=f"Other {t.competition_label.lower()}s",
        links=[(x, f"/seasons/{enc(x)}{_tq()}") for x in reversed(_seasons(t.slug)) if x != season],
    )


def page_meta(raw_path: str) -> PageMeta:
    """Meta for a URL path (already percent-decoded by the web framework)."""
    path = "/" + raw_path.strip("/")
    t = get_tournament()
    statics = _static_pages()
    if path in ("/", ""):
        path = "/dashboard"
    if path in statics:
        title, description = statics[path]
        heading, links = _static_links(path)
        crumbs = [("Dashboard", "/dashboard")] + ([] if path == "/dashboard" else [(title.split(" — ")[0], path)])
        return PageMeta(title=title, description=description, path=path,
                        heading=title.split(" — ")[0], kicker=f"{t.short_name} analytics",
                        links_heading=heading, links=links, schema=[_breadcrumbs(crumbs)])

    parts = path.split("/")[1:]
    head, rest = parts[0], "/".join(parts[1:])
    meta = None
    try:
        if head in ("batting", "bowling", "players") and rest:
            meta = _player_page(rest, as_bowler=head == "bowling")
        elif head == "teams" and rest:
            meta = _team_page(rest)
        elif head == "venues" and rest:
            meta = _venue_page(rest)
        elif head == "matches" and rest:
            meta = _match_page(rest)
        elif head == "seasons" and rest:
            meta = _season_page(rest)
    except Exception:  # never let SEO rendering break the page itself
        meta = None
    if meta:
        return meta
    return PageMeta(
        title="Page not found",
        description="This page doesn't exist on Crickrida. Explore free IPL and T20 World Cup analytics instead.",
        path=path,
        heading="Page not found",
        status=404,
        links_heading="Popular pages",
        links=[("Dashboard", f"/dashboard{_tq()}"), ("Batting records", f"/batting{_tq()}"),
               ("Bowling records", f"/bowling{_tq()}"), ("Matches", f"/matches{_tq()}")],
    )


# ── HTML injection ───────────────────────────────────────────────────────────

def _e(value) -> str:
    return html.escape(str(value), quote=True)


def head_tags(meta: PageMeta) -> str:
    slug = get_tournament_slug()
    full_title = f"{meta.title} | {SITE_NAME}"
    url = canonical_url(meta.path, slug)
    image = og_image_url(meta.path, slug)
    tags = [
        f'<meta name="description" content="{_e(meta.description)}" data-rh="true">',
        f'<link rel="canonical" href="{_e(url)}" data-rh="true">',
        f'<meta property="og:title" content="{_e(full_title)}" data-rh="true">',
        f'<meta property="og:description" content="{_e(meta.description)}" data-rh="true">',
        f'<meta property="og:image" content="{_e(image)}" data-rh="true">',
        '<meta property="og:image:width" content="1200" data-rh="true">',
        '<meta property="og:image:height" content="630" data-rh="true">',
        f'<meta property="og:url" content="{_e(url)}" data-rh="true">',
        f'<meta property="og:type" content="{meta.og_type}" data-rh="true">',
        f'<meta property="og:site_name" content="{SITE_NAME}" data-rh="true">',
        '<meta name="twitter:card" content="summary_large_image" data-rh="true">',
        f'<meta name="twitter:site" content="{TWITTER_HANDLE}" data-rh="true">',
        f'<meta name="twitter:title" content="{_e(full_title)}" data-rh="true">',
        f'<meta name="twitter:description" content="{_e(meta.description)}" data-rh="true">',
        f'<meta name="twitter:image" content="{_e(image)}" data-rh="true">',
    ]
    if meta.status == 404:
        tags.append('<meta name="robots" content="noindex" data-rh="true">')
    for schema in meta.schema:
        payload = json.dumps(schema, ensure_ascii=False).replace("</", "<\\/")
        tags.append(f'<script type="application/ld+json" data-rh="true">{payload}</script>')
    return "\n    ".join(tags)


def body_html(meta: PageMeta) -> str:
    """Readable, crawlable summary shown until React mounts."""
    out = ['<main style="max-width:880px;margin:0 auto;padding:40px 20px;font-family:Inter,system-ui,sans-serif;color:#E0E0F0">']
    out.append(f'<p style="font:12px JetBrains Mono,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8888A0;margin:0 0 8px">{_e(meta.kicker or SITE_NAME)}</p>')
    out.append(f'<h1 style="font:700 36px Space Grotesk,sans-serif;margin:0 0 12px">{_e(meta.heading or meta.title)}</h1>')
    out.append(f'<p style="color:#A0A0B8;line-height:1.6;margin:0 0 20px">{_e(meta.description)}</p>')
    if meta.stats:
        out.append('<dl style="display:flex;flex-wrap:wrap;gap:12px;margin:0 0 24px">')
        for label, value in meta.stats:
            out.append(
                '<div style="border:1px solid #2A2A3C;border-radius:12px;padding:10px 14px;min-width:120px">'
                f'<dt style="font:11px JetBrains Mono,monospace;text-transform:uppercase;color:#8888A0">{_e(label)}</dt>'
                f'<dd style="margin:4px 0 0;font:700 22px Space Grotesk,sans-serif">{_e(value)}</dd></div>'
            )
        out.append("</dl>")
    if meta.links:
        out.append(f'<h2 style="font:600 18px Space Grotesk,sans-serif;margin:24px 0 8px">{_e(meta.links_heading or "Explore")}</h2><ul style="padding-left:18px;line-height:1.9">')
        for text, href in meta.links:
            out.append(f'<li><a href="{_e(href)}" style="color:#00E5FF">{_e(text)}</a></li>')
        out.append("</ul>")
    out.append("</main>")
    return "".join(out)


def render_index(index_html: str, raw_path: str) -> tuple[str, int]:
    meta = page_meta(raw_path)
    full_title = f"{meta.title} | {SITE_NAME}"
    doc = index_html
    start, end = doc.find("<title>"), doc.find("</title>")
    if start != -1 and end != -1:
        doc = doc[:start] + f"<title>{_e(full_title)}</title>\n    " + head_tags(meta) + doc[end + len("</title>"):]
    doc = doc.replace('<div id="root"></div>', f'<div id="root">{body_html(meta)}</div>', 1)
    return doc, meta.status


# ── Sitemap ──────────────────────────────────────────────────────────────────

def _url_entry(loc: str, lastmod: str | None, changefreq: str, priority: str) -> str:
    return (
        f"<url><loc>{_e(loc)}</loc>"
        + (f"<lastmod>{lastmod}</lastmod>" if lastmod else "")
        + f"<changefreq>{changefreq}</changefreq><priority>{priority}</priority></url>"
    )


def build_sitemap() -> str:
    """Every indexable page for every tournament (T20 WC via ?tournament=)."""
    from .tournaments import reset_tournament, set_tournament

    entries: list[str] = []
    for slug in TOURNAMENTS:
        token = set_tournament(slug)
        try:
            matches = _all_matches(slug)
            last = str(matches[-1]["date"]) if matches else None
            for path in _static_pages():
                if path in ("/privacy", "/terms", "/account-deletion"):
                    if slug != "ipl":
                        continue
                    entries.append(_url_entry(canonical_url(path, slug), None, "yearly", "0.2"))
                    continue
                priority = "1.0" if path == "/dashboard" else "0.8"
                entries.append(_url_entry(canonical_url(path, slug), last, "weekly", priority))
            for season in _seasons(slug):
                entries.append(_url_entry(canonical_url(f"/seasons/{enc(season)}", slug), last, "monthly", "0.7"))
            for team in _teams(slug):
                entries.append(_url_entry(canonical_url(f"/teams/{enc(team['team'])}", slug), last, "weekly", "0.7"))
            for venue in _venues(slug):
                entries.append(_url_entry(canonical_url(f"/venues/{enc(venue['venue'])}", slug), last, "monthly", "0.6"))
            batters, bowlers = _all_players(slug)
            for name in sorted(batters):
                entries.append(_url_entry(canonical_url(f"/batting/{enc(name)}", slug), last, "weekly", "0.6"))
            for name in sorted(bowlers - batters):
                entries.append(_url_entry(canonical_url(f"/bowling/{enc(name)}", slug), last, "weekly", "0.5"))
            for m in matches:
                entries.append(_url_entry(canonical_url(f"/matches/{enc(m['match_id'])}", slug), str(m["date"]), "yearly", "0.5"))
        finally:
            reset_tournament(token)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n"
    )
