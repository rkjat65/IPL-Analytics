"""Record the currently reviewed Commons category queue as unsuitable."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from discover_wikimedia_player_images import CANDIDATES_PATH, SEARCH_DECISIONS_PATH
from import_wikimedia_player_images import load_json, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm-reviewed",
        action="store_true",
        help="Required acknowledgement that every candidate in the current queue was reviewed",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.confirm_reviewed:
        raise SystemExit("Refusing to reject the queue without --confirm-reviewed")
    queue = load_json(CANDIDATES_PATH, {"players": []})
    decisions = load_json(SEARCH_DECISIONS_PATH, {"rejected": {}})
    players = 0
    images = 0
    for player in queue.get("players", []):
        titles = [item["commons_title"] for item in player.get("candidates", [])]
        if not titles:
            continue
        current = decisions.setdefault("rejected", {}).setdefault(
            player["player_id"],
            {
                "player_name": player["player_name"],
                "reason": "Manual visual review: unsuitable as a clear player avatar",
                "commons_titles": [],
            },
        )
        for title in titles:
            if title not in current["commons_titles"]:
                current["commons_titles"].append(title)
                images += 1
        players += 1
    decisions["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_json(SEARCH_DECISIONS_PATH, decisions)
    print(json.dumps({"players": players, "newly_rejected_images": images}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
