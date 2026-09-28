"""Import manually approved images from the Commons category candidate queue."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from discover_wikimedia_player_images import CANDIDATES_PATH
from import_wikimedia_player_images import (
    ATTRIBUTION_PATH,
    IMAGE_DIR,
    load_json,
    make_avatar,
    request_bytes,
    safe_filename,
    write_json,
)


ROOT = Path(__file__).resolve().parents[1]
SELECTIONS_PATH = ROOT / "data" / "wikimedia_commons_search_selections.json"


def main() -> int:
    queue = load_json(CANDIDATES_PATH, {"players": []})
    selections = load_json(SELECTIONS_PATH, {"approved": {}}).get("approved", {})
    attribution = load_json(
        ATTRIBUTION_PATH,
        {"generated_at": None, "source": "Wikimedia Commons", "images": {}},
    )
    queued = {player["player_id"]: player for player in queue.get("players", [])}
    imported = []
    errors = []
    for player_id, selection in selections.items():
        player = queued.get(player_id)
        if not player:
            errors.append({"player": selection.get("player_name"), "error": "player is not in candidate queue"})
            continue
        candidate = next(
            (
                item
                for item in player.get("candidates", [])
                if item.get("commons_title") == selection.get("commons_title")
            ),
            None,
        )
        if not candidate:
            errors.append({"player": player["player_name"], "error": "approved title is not in candidate queue"})
            continue
        filename = f"{safe_filename(player['player_name'])}.webp"
        try:
            make_avatar(request_bytes(candidate["download_url"]), IMAGE_DIR / filename)
        except Exception as exc:
            errors.append({"player": player["player_name"], "error": str(exc)})
            continue
        attribution["images"][player_id] = {
            "player_id": player_id,
            "player_name": player["player_name"],
            "filename": filename,
            "wikidata_item": player["wikidata_item"],
            **candidate,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "modified": True,
            "modification": "Square 512x512 WebP portrait crop",
            "discovery_method": player["discovery_method"],
            "review_status": "manually_approved",
        }
        imported.append(player["player_name"])

    attribution["generated_at"] = datetime.now(timezone.utc).isoformat()
    write_json(ATTRIBUTION_PATH, attribution)
    print(json.dumps({"selected": len(selections), "imported": imported, "errors": errors}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
