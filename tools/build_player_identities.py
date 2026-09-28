"""Build the canonical player identity catalogue used by both tournaments.

The catalogue is intentionally generated from two sources:

* local match line-ups, which define who is actually a player in this product;
* the official Cricsheet people and alternate-name registers, which provide
  stable identifiers and name variants.

Run from the repository root::

    python tools/build_player_identities.py
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.player_aliases import PLAYER_ALIASES  # noqa: E402


PEOPLE_URL = "https://cricsheet.org/register/people.csv"
NAMES_URL = "https://cricsheet.org/register/names.csv"
DEFAULT_OUTPUT = ROOT / "data" / "player_identities.json"
MATCH_SOURCES = (
    ("ipl", ROOT / "ipl_json"),
    ("t20wc", ROOT / "T20 World Cup" / "t20wc_matches"),
)

# Nicknames are editorial data rather than identity evidence. They are kept
# separate from alternate spellings so the UI can present them honestly.
FAMOUS_NAMES: dict[str, list[str]] = {
    "V Kohli": ["King Kohli", "Cheeku"],
    "RG Sharma": ["Hitman"],
    "MS Dhoni": ["Captain Cool", "Thala", "Mahi"],
    "JJ Bumrah": ["Boom", "Boom Boom Bumrah"],
    "S Dhawan": ["Gabbar"],
    "DA Warner": ["The Bull"],
    "SK Raina": ["Mr IPL", "Chinna Thala"],
    "AB de Villiers": ["Mr 360"],
    "CH Gayle": ["Universe Boss"],
    "SA Yadav": ["SKY"],
    "RA Jadeja": ["Jaddu", "Sir Jadeja"],
    "AC Gilchrist": ["Gilly"],
    "R Dravid": ["The Wall"],
    "SC Ganguly": ["Dada"],
    "MEK Hussey": ["Mr Cricket"],
    "SL Malinga": ["Slinga"],
    "AD Russell": ["Dre Russ", "Muscle Russell"],
    "DA Miller": ["Killer Miller"],
}

# Small, explicit tie-breakers where automatic "most complete" scoring would
# prefer an unusual spacing/capitalisation or a less reliable long variant.
PREFERRED_NAMES = {
    "SA Yadav": "Suryakumar Yadav",
    "AB de Villiers": "AB de Villiers",
    "SN Khan": "Sarfaraz Khan",
    "RP Singh": "RP Singh",
}


def _download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Crickrida/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        destination.write_bytes(response.read())


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _iter_player_contexts(data: dict[str, Any]):
    info = data.get("info", {})
    lineups = info.get("players", {})
    name_to_teams: dict[str, set[str]] = defaultdict(set)
    for team, names in lineups.items():
        for name in names:
            name_to_teams[name].add(team)
            yield team, name

    for name in info.get("player_of_match", []):
        teams = name_to_teams.get(name) or {""}
        for team in teams:
            yield team, name

    teams = list(lineups)
    for innings in data.get("innings", []):
        batting_team = innings.get("team", "")
        bowling_team = next((team for team in teams if team != batting_team), "")
        for over in innings.get("overs", []):
            for delivery in over.get("deliveries", []):
                for key in ("batter", "non_striker"):
                    if delivery.get(key):
                        yield batting_team, delivery[key]
                if delivery.get("bowler"):
                    yield bowling_team, delivery["bowler"]
                for wicket in delivery.get("wickets", []):
                    if wicket.get("player_out"):
                        yield batting_team, wicket["player_out"]
                    for fielder in wicket.get("fielders", []):
                        if fielder.get("name"):
                            yield bowling_team, fielder["name"]


def _initial_like(token: str) -> bool:
    clean = re.sub(r"[^A-Za-z]", "", token)
    return bool(clean) and len(clean) <= 3 and clean.upper() == clean


def _display_score(name: str) -> tuple[int, int, int, int, str]:
    tokens = [token for token in re.split(r"\s+", name.strip()) if token]
    full_words = sum(1 for token in tokens if len(re.sub(r"[^A-Za-z]", "", token)) >= 3 and not _initial_like(token))
    initials = sum(1 for token in tokens if _initial_like(token))
    noise = int("," in name or "(" in name or ")" in name or any(ch.isdigit() for ch in name))
    # Prefer recognisable full names, then useful detail, while avoiding noisy
    # scorecard disambiguators and very long descriptive strings.
    return (full_words, -initials, -noise, min(len(name), 60), name.casefold())


def _manual_full_name_candidates(source_name: str) -> set[str]:
    surname = source_name.split()[-1].casefold() if source_name.split() else ""
    blocked = {
        "king", "boom", "sir", "mr", "captain", "the", "universe",
        "hitman", "gabbar", "thala", "mahi", "sky", "jaddu", "dada", "gilly",
    }
    candidates = set()
    for alias, target in PLAYER_ALIASES.items():
        parts = alias.split()
        if target != source_name or len(parts) < 2 or parts[-1].casefold() != surname:
            continue
        if parts[0].casefold() in blocked or len(set(parts)) != len(parts):
            continue
        candidates.add(alias.title())
    return candidates


def build_catalogue(people_path: Path, names_path: Path) -> dict[str, Any]:
    people = _read_csv(people_path)
    alternate_names = _read_csv(names_path)
    people_by_id = {row["identifier"]: row for row in people}

    official_aliases: dict[str, set[str]] = defaultdict(set)
    ids_by_label: dict[str, set[str]] = defaultdict(set)
    for row in people:
        for label in (row.get("name"), row.get("unique_name")):
            if label:
                official_aliases[row["identifier"]].add(label)
                ids_by_label[label.casefold()].add(row["identifier"])
    for row in alternate_names:
        official_aliases[row["identifier"]].add(row["name"])
        ids_by_label[row["name"].casefold()].add(row["identifier"])

    contexts: dict[str, set[str]] = defaultdict(set)
    local_ids: dict[tuple[str, str], set[str]] = defaultdict(set)
    global_local_ids: dict[str, set[str]] = defaultdict(set)
    tournaments_by_context: dict[tuple[str, str], set[str]] = defaultdict(set)
    for tournament, source in MATCH_SOURCES:
        for path in sorted(source.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            registry = data.get("info", {}).get("registry", {}).get("people", {})
            for team, raw_name in _iter_player_contexts(data):
                key = (team, raw_name)
                contexts[team].add(raw_name)
                tournaments_by_context[key].add(tournament)
                if raw_name in registry:
                    local_ids[key].add(registry[raw_name])
                    global_local_ids[raw_name.casefold()].add(registry[raw_name])

    all_raw_names = sorted({name for names in contexts.values() for name in names})
    preliminary: dict[str, str] = {}
    for raw_name in all_raw_names:
        ids = global_local_ids.get(raw_name.casefold()) or ids_by_label.get(raw_name.casefold(), set())
        if len(ids) == 1:
            preliminary[raw_name] = next(iter(ids))

    # Curated aliases resolve common full-name/initial pairs before heuristic
    # matching. The target itself must map unambiguously to the Register.
    for raw_name in all_raw_names:
        if raw_name in preliminary:
            continue
        target = PLAYER_ALIASES.get(raw_name.casefold())
        target_ids = (
            global_local_ids.get((target or "").casefold())
            or ids_by_label.get((target or "").casefold(), set())
        )
        if len(target_ids) == 1:
            preliminary[raw_name] = next(iter(target_ids))

    # Recent feeds often provide a full name without a registry block. Link it
    # to an older initial-based name only when the same team yields one unique
    # identified candidate with the same first initial and surname.
    for team, names in contexts.items():
        for raw_name in names:
            key = (team, raw_name)
            direct = local_ids.get(key, set())
            if len(direct) == 1:
                preliminary[raw_name] = next(iter(direct))
                continue
            if raw_name in preliminary:
                continue
            parts = raw_name.replace("-", " ").split()
            if len(parts) < 2:
                continue
            candidates = set()
            for other in names:
                other_parts = other.replace("-", " ").split()
                if not other_parts:
                    continue
                if (
                    other_parts[-1].casefold() == parts[-1].casefold()
                    and other_parts[0][0].casefold() == parts[0][0].casefold()
                    and other in preliminary
                ):
                    candidates.add(preliminary[other])
            if len(candidates) == 1:
                preliminary[raw_name] = next(iter(candidates))

    identities: dict[str, dict[str, Any]] = {}
    team_aliases: dict[str, str] = {}
    raw_to_ids: dict[str, set[str]] = defaultdict(set)
    raw_by_id: dict[str, set[str]] = defaultdict(set)
    tournaments_by_id: dict[str, set[str]] = defaultdict(set)

    for team, names in contexts.items():
        for raw_name in names:
            key = (team, raw_name)
            ids = local_ids.get(key, set())
            player_id = next(iter(ids)) if len(ids) == 1 else preliminary.get(raw_name)
            if not player_id:
                digest = hashlib.sha1(raw_name.casefold().encode("utf-8")).hexdigest()[:12]
                player_id = f"local-{digest}"
            team_aliases[f"{team.casefold()}|{raw_name.casefold()}"] = player_id
            raw_to_ids[raw_name.casefold()].add(player_id)
            raw_by_id[player_id].add(raw_name)
            tournaments_by_id[player_id].update(tournaments_by_context.get(key, set()))

    for player_id, raw_names in raw_by_id.items():
        official = people_by_id.get(player_id, {})
        source_name = official.get("name") or sorted(raw_names)[0]
        famous = FAMOUS_NAMES.get(source_name, [])
        official_names = {source_name} | official_aliases.get(player_id, set())
        aliases = set(raw_names) | official_names | _manual_full_name_candidates(source_name)
        # Raw scorecard variants and curated full-name aliases can fill gaps in
        # the official register. Editorial famous names stay searchable but
        # are never allowed to replace the person's actual display name.
        display_candidates = aliases - set(famous)
        preferred = PREFERRED_NAMES.get(source_name)
        display_name = preferred if preferred in display_candidates else max(display_candidates, key=_display_score)
        aliases.update(famous)
        identities[player_id] = {
            "id": player_id,
            "name": display_name,
            "source_name": source_name,
            "aliases": sorted(aliases, key=str.casefold),
            "famous_names": famous,
            "tournaments": sorted(tournaments_by_id[player_id]),
            "cricinfo_id": official.get("key_cricinfo") or None,
        }

    # A handful of different people genuinely share the same full name. Keep
    # their database/profile keys distinct instead of silently merging stats.
    ids_by_display: dict[str, list[str]] = defaultdict(list)
    for player_id, identity in identities.items():
        ids_by_display[identity["name"].casefold()].append(player_id)
    for player_ids in ids_by_display.values():
        if len(player_ids) < 2:
            continue
        ordered = sorted(
            player_ids,
            key=lambda pid: (
                "(" in (people_by_id.get(pid, {}).get("unique_name") or ""),
                people_by_id.get(pid, {}).get("unique_name") or pid,
            ),
        )
        for position, player_id in enumerate(ordered, start=1):
            if position == 1:
                continue
            distinct_name = f"{identities[player_id]['name']} ({position})"
            identities[player_id]["name"] = distinct_name
            identities[player_id]["aliases"].append(distinct_name)
            identities[player_id]["aliases"].sort(key=str.casefold)

    aliases: dict[str, str] = {}
    for raw_key, player_ids in raw_to_ids.items():
        if len(player_ids) == 1:
            aliases[raw_key] = next(iter(player_ids))
    for player_id, identity in identities.items():
        for alias in identity["aliases"]:
            key = alias.casefold()
            existing = aliases.get(key)
            if existing is None or existing == player_id:
                aliases[key] = player_id
            else:
                aliases.pop(key, None)

    return {
        "source": {
            "people": PEOPLE_URL,
            "names": NAMES_URL,
            "license": "Open Data Commons Attribution License",
        },
        "counts": {
            "identities": len(identities),
            "aliases": len(aliases),
            "team_aliases": len(team_aliases),
        },
        "identities": dict(sorted(identities.items())),
        "aliases": dict(sorted(aliases.items())),
        "team_aliases": dict(sorted(team_aliases.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--people", type=Path)
    parser.add_argument("--names", type=Path)
    args = parser.parse_args()

    cache = Path(tempfile.gettempdir()) / "crickrida-cricsheet-register"
    people_path = args.people or cache / "people.csv"
    names_path = args.names or cache / "names.csv"
    if not people_path.exists():
        _download(PEOPLE_URL, people_path)
    if not names_path.exists():
        _download(NAMES_URL, names_path)

    catalogue = build_catalogue(people_path, names_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalogue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(catalogue["counts"], indent=2))


if __name__ == "__main__":
    main()
