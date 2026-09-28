"""Resolve live/API display names to canonical names in the deliveries table."""

import functools

from .database import query
from .player_identity import identity_for
from .player_aliases import PLAYER_ALIASES
from .tournaments import get_tournament_slug


def _compact_token(value: str) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalpha())


def _token_matches_first_name(target_first: str, candidate_first: str) -> bool:
    """Return True when a DB first token plausibly matches the full first name.

    Handles exact/prefix matches plus abbreviated DB forms like "RK" for
    "Rinku" so ambiguous surname matches don't resolve to the wrong player.
    """
    target = _compact_token(target_first)
    candidate = _compact_token(candidate_first)
    if not target or not candidate:
        return False
    if target == candidate or target.startswith(candidate) or candidate.startswith(target):
        return True
    if len(candidate) <= 3:
        pos = 0
        for ch in target:
            if pos < len(candidate) and ch == candidate[pos]:
                pos += 1
        if pos == len(candidate):
            return True
    return False


def resolve_player_name(name: str, role: str = "bat", *, allow_aliases: bool = False) -> str:
    return _resolve_player_name(
        get_tournament_slug(), name, role, allow_aliases=allow_aliases
    )


@functools.lru_cache(maxsize=1024)
def _resolve_player_name(
    tournament: str,
    name: str,
    role: str = "bat",
    *,
    allow_aliases: bool = False,
) -> str:
    """Map a full player name to the canonical DB name.

    Manual alias overrides are intentionally opt-in so they are only used by the
    Sportmonks live/inject pipeline, not by the main historical DB search or
    analytics paths.
    """
    # ``tournament`` is deliberately part of the cache key. SQL execution uses
    # the request-local context selected by middleware.
    del tournament
    col = "batter" if role == "bat" else "bowler"
    raw = name.strip()
    if not raw:
        return raw

    term = raw.lower()
    identity = identity_for(raw)
    if identity:
        candidate = identity["name"]
        hit = query(
            f"SELECT DISTINCT {col} FROM deliveries WHERE {col} = ? LIMIT 1",
            [candidate],
        )
        if hit:
            return hit[0][col]

    if allow_aliases and term in PLAYER_ALIASES:
        cand = PLAYER_ALIASES[term]
        hit = query(
            f"SELECT DISTINCT {col} FROM deliveries WHERE {col} = ? LIMIT 1",
            [cand],
        )
        if hit:
            return hit[0][col]

    exact = query(
        f"SELECT DISTINCT {col} FROM deliveries WHERE {col} = ? LIMIT 1",
        [raw],
    )
    if exact:
        return exact[0][col]

    parts = raw.split()
    if len(parts) >= 2:
        last = parts[-1]
        first_initial = parts[0][0].upper()
        abbr = f"{parts[0][0]} {last}"
        abbr_rows = query(
            f"SELECT DISTINCT {col} FROM deliveries WHERE {col} = ? LIMIT 1",
            [abbr],
        )
        if abbr_rows:
            return abbr_rows[0][col]

        if len(parts) >= 3:
            mid_initial = parts[1][0] if len(parts[1]) > 0 else ""
            abbr2 = f"{parts[0][0]}{mid_initial} {last}"
            abbr2_rows = query(
                f"SELECT DISTINCT {col} FROM deliveries WHERE {col} = ? LIMIT 1",
                [abbr2],
            )
            if abbr2_rows:
                return abbr2_rows[0][col]

        like_rows = query(
            f"SELECT DISTINCT {col} FROM deliveries WHERE {col} LIKE ? LIMIT 40",
            [f"%{last}%"],
        )
        if len(like_rows) == 1:
            return like_rows[0][col]
        # Disambiguate same surname (e.g. A Ashish Reddy vs Nithish Kumar Reddy):
        # require last-name suffix AND same first-letter as the live feed name.
        initial_hits = [
            row[col]
            for row in like_rows
            if (row[col] or "").endswith(last)
            and len(row[col]) > 0
            and row[col][0].upper() == first_initial
        ]
        if len(initial_hits) == 1:
            return initial_hits[0]
        if len(initial_hits) > 1:
            target_first = parts[0]
            narrowed_hits = [
                val for val in initial_hits
                if _token_matches_first_name(target_first, val.split()[0] if val.split() else "")
            ]
            if len(narrowed_hits) == 1:
                return narrowed_hits[0]
            if len(narrowed_hits) > 1:
                narrowed_hits.sort(key=lambda val: (len(val.split()[0]), len(val)))
                return narrowed_hits[0]

    return name


def _has_batting_rows(canonical: str) -> bool:
    r = query(
        "SELECT 1 FROM deliveries WHERE batter = ? AND is_super_over = false LIMIT 1",
        [canonical],
    )
    return bool(r)


def _has_bowling_rows(canonical: str) -> bool:
    r = query(
        "SELECT 1 FROM deliveries WHERE bowler = ? AND is_super_over = false LIMIT 1",
        [canonical],
    )
    return bool(r)


def canonical_player_slug(display_name: str) -> str | None:
    """Return canonical DB name for profile URL if player has batting or bowling data."""
    raw = (display_name or "").strip()
    if not raw:
        return None
    db_bat = resolve_player_name(raw, "bat")
    if _has_batting_rows(db_bat):
        return db_bat
    db_bowl = resolve_player_name(raw, "bowl")
    if _has_bowling_rows(db_bowl):
        return db_bowl
    return None
