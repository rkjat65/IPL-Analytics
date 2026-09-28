"""Download square preview crops for the review-only Commons candidate queue."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from discover_wikimedia_player_images import CANDIDATES_PATH
from import_wikimedia_player_images import load_json, make_avatar, request_bytes, safe_filename, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="Directory for temporary WebP previews")
    parser.add_argument("--player", action="append", default=[], help="Player name to preview; repeatable")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    selected = {name.casefold() for name in args.player}
    report = load_json(CANDIDATES_PATH, {"players": []})
    args.destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    errors = []
    for player in report.get("players", []):
        if selected and player["player_name"].casefold() not in selected:
            continue
        for index, candidate in enumerate(player.get("candidates", []), start=1):
            filename = f"{safe_filename(player['player_name'])}__{index:02d}.webp"
            destination = args.destination / filename
            try:
                make_avatar(request_bytes(candidate["download_url"]), destination)
            except Exception as exc:
                errors.append({"player": player["player_name"], "title": candidate["commons_title"], "error": str(exc)})
                continue
            manifest.append(
                {
                    "player_name": player["player_name"],
                    "preview": filename,
                    "commons_title": candidate["commons_title"],
                    "commons_page": candidate["commons_page"],
                    "license": candidate["license"],
                }
            )
    write_json(args.destination / "manifest.json", {"previews": manifest, "errors": errors})
    print(json.dumps({"previews": len(manifest), "errors": len(errors)}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
