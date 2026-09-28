"""Discover review-only Wikimedia Commons alternatives for missing avatars.

The primary importer only trusts Wikidata P18 images matched through the
ESPNcricinfo identifier.  This second-stage tool keeps the same identity link,
but searches Commons by the Wikidata English label when no acceptable local
avatar exists.  Search results are never downloaded automatically: the output
is a candidate queue that must be visually and legally reviewed first.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from import_wikimedia_player_images import (
    ATTRIBUTION_PATH,
    CATALOGUE_PATH,
    COMMONS_API,
    DECISIONS_PATH,
    IMAGE_DIR,
    WIKIDATA_SPARQL,
    chunks,
    commons_metadata,
    existing_image,
    load_json,
    request_json,
    reusable_license,
    write_json,
)


ROOT = Path(__file__).resolve().parents[1]
CANDIDATES_PATH = ROOT / "data" / "wikimedia_commons_search_candidates.json"
SEARCH_DECISIONS_PATH = ROOT / "data" / "wikimedia_commons_search_decisions.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--player", action="append", default=[], help="Canonical player name; repeatable")
    parser.add_argument("--limit", type=int, default=0, help="Limit missing identities searched")
    parser.add_argument("--results", type=int, default=5, help="Maximum Commons results per player")
    parser.add_argument(
        "--include-name-search",
        action="store_true",
        help="Also search Commons by name when Wikidata has no exact Commons category",
    )
    return parser.parse_args()


def wikidata_people(cricinfo_ids: list[str], batch_size: int = 100) -> dict[str, dict[str, str]]:
    results: dict[str, dict[str, str]] = {}
    for batch in chunks(cricinfo_ids, batch_size):
        values = " ".join(json.dumps(value) for value in batch)
        query = f"""
        SELECT ?cricinfo ?item ?itemLabel ?commonsCategory WHERE {{
          VALUES ?cricinfo {{ {values} }}
          ?item wdt:P2697 ?cricinfo.
          OPTIONAL {{ ?item wdt:P373 ?commonsCategory. }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        """
        payload = request_json(WIKIDATA_SPARQL, {"format": "json", "query": query})
        for binding in payload.get("results", {}).get("bindings", []):
            cricinfo_id = binding["cricinfo"]["value"]
            results.setdefault(
                cricinfo_id,
                {
                    "wikidata_item": binding["item"]["value"].rsplit("/", 1)[-1],
                    "wikidata_label": binding.get("itemLabel", {}).get("value", ""),
                    "commons_category": binding.get("commonsCategory", {}).get("value", ""),
                },
            )
        time.sleep(0.15)
    return results


def commons_search_titles(label: str, limit: int) -> list[str]:
    queries = [f'intitle:"{label}"', f'"{label}" cricketer']
    titles: list[str] = []
    for query in queries:
        payload = request_json(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "list": "search",
                "srnamespace": "6",
                "srlimit": limit,
                "srsearch": query,
            },
        )
        for row in payload.get("query", {}).get("search", []):
            title = row.get("title", "")
            if title and title not in titles:
                titles.append(title)
            if len(titles) >= limit:
                return titles
        if titles:
            break
        time.sleep(0.1)
    return titles


def commons_category_titles(category: str, limit: int) -> list[str]:
    payload = request_json(
        COMMONS_API,
        {
            "action": "query",
            "format": "json",
            "list": "categorymembers",
            "cmtitle": f"Category:{category}",
            "cmnamespace": "6",
            "cmtype": "file",
            "cmlimit": limit,
        },
    )
    return [
        row["title"]
        for row in payload.get("query", {}).get("categorymembers", [])
        if row.get("title")
    ]


def verified_commons_categories(people: dict[str, dict[str, str]]) -> dict[str, str]:
    """Find unlinked Commons categories whose Wikibase item is the same player."""
    expected: dict[str, str] = {}
    for person in people.values():
        if person.get("commons_category") or not person.get("wikidata_label"):
            continue
        qid = person["wikidata_item"]
        label = person["wikidata_label"]
        expected[f"Category:{label}"] = qid
        expected[f"Category:{label} (cricketer)"] = qid

    verified: dict[str, str] = {}
    for batch in chunks(sorted(expected), 40):
        payload = request_json(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "pageprops",
                "titles": "|".join(batch),
            },
        )
        for page in payload.get("query", {}).get("pages", []):
            title = page.get("title", "")
            qid = page.get("pageprops", {}).get("wikibase_item")
            if qid and expected.get(title) == qid:
                verified[qid] = title.removeprefix("Category:")
        time.sleep(0.1)
    return verified


def main() -> int:
    args = parse_args()
    catalogue = load_json(CATALOGUE_PATH, {"identities": {}})
    decisions = load_json(DECISIONS_PATH, {"rejected": {}})
    search_decisions = load_json(SEARCH_DECISIONS_PATH, {"rejected": {}})
    attribution = load_json(ATTRIBUTION_PATH, {"images": {}})
    selected_names = {name.casefold() for name in args.player}

    identities = [
        identity
        for identity in catalogue.get("identities", {}).values()
        if identity.get("cricinfo_id")
        and not existing_image(identity, IMAGE_DIR)
        and (not selected_names or identity.get("name", "").casefold() in selected_names)
    ]
    identities.sort(key=lambda identity: identity.get("name", "").casefold())
    if args.limit:
        identities = identities[: args.limit]

    people = wikidata_people(sorted({str(identity["cricinfo_id"]) for identity in identities}))
    verified_categories = verified_commons_categories(people)
    title_map: dict[str, list[str]] = {}
    identity_rows: list[dict[str, Any]] = []
    for identity in identities:
        person = people.get(str(identity["cricinfo_id"]), {})
        label = person.get("wikidata_label") or identity["name"]
        category = person.get("commons_category") or verified_categories.get(person.get("wikidata_item", ""))
        if category:
            titles = commons_category_titles(category, args.results)
        elif args.include_name_search:
            titles = commons_search_titles(label, args.results)
        else:
            titles = []
        title_map[identity["id"]] = titles
        identity_rows.append(
            {
                "identity": identity,
                "person": person,
                "search_label": label,
                "discovery_method": (
                    "wikidata_commons_category"
                    if person.get("commons_category")
                    else "verified_commons_category"
                    if category
                    else "commons_search" if args.include_name_search else "none"
                ),
            }
        )
        time.sleep(0.1)

    all_titles = sorted({title for titles in title_map.values() for title in titles})
    metadata = commons_metadata(all_titles) if all_titles else {}
    candidates: list[dict[str, Any]] = []
    rejected_titles = {
        player_id: decision.get("commons_title")
        for player_id, decision in decisions.get("rejected", {}).items()
    }
    search_rejected_titles = {
        player_id: set(row.get("commons_titles", []))
        for player_id, row in search_decisions.get("rejected", {}).items()
    }
    attributed_titles = {
        record.get("commons_title")
        for record in attribution.get("images", {}).values()
    }
    for row in identity_rows:
        identity = row["identity"]
        images = []
        for title in title_map.get(identity["id"], []):
            item = metadata.get(title)
            if (
                not item
                or not reusable_license(item)
                or rejected_titles.get(identity["id"]) == title
                or title in search_rejected_titles.get(identity["id"], set())
                or title in attributed_titles
            ):
                continue
            images.append(item)
        if images:
            candidates.append(
                {
                    "player_id": identity["id"],
                    "player_name": identity["name"],
                    "cricinfo_id": str(identity["cricinfo_id"]),
                    **row["person"],
                    "search_label": row["search_label"],
                    "discovery_method": row["discovery_method"],
                    "candidates": images,
                }
            )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Wikimedia Commons search",
        "review_required": True,
        "searched": len(identities),
        "players_with_candidates": len(candidates),
        "candidate_images": sum(len(row["candidates"]) for row in candidates),
        "players": candidates,
    }
    write_json(CANDIDATES_PATH, report)
    print(
        json.dumps(
            {key: value for key, value in report.items() if key != "players"},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
