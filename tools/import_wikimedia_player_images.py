"""Import reusable player portraits from Wikidata and Wikimedia Commons.

The importer uses the ESPNcricinfo identifier already stored in
``data/player_identities.json`` to make a high-confidence Wikidata match.  It
then reads the Commons file metadata, keeps only a conservative set of
commercially reusable licences, downloads the image, creates a square WebP
avatar, and records the attribution required to publish it.

Existing player images are never replaced unless ``--overwrite`` is passed.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlencode, urlparse
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CATALOGUE_PATH = ROOT / "data" / "player_identities.json"
ATTRIBUTION_PATH = ROOT / "data" / "player_image_attributions.json"
REPORT_PATH = ROOT / "data" / "wikimedia_player_images_report.json"
DECISIONS_PATH = ROOT / "data" / "wikimedia_player_image_decisions.json"
IMAGE_DIR = ROOT / "backend" / "player_images"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = (
    "Crickrida/1.0 (https://crickrida.rkjat.in; "
    "https://github.com/rkjat65/IPL-Analytics)"
)

# Cropping creates a derivative.  These licences permit commercial reuse and
# derivatives when their attribution/share-alike requirements are preserved.
ALLOWED_LICENSE_MARKERS = (
    "cc0",
    "cc by",
    "cc-by",
    "creative commons attribution",
    "public domain",
    "pd-",
    "godl-india",
    "government open data license",
)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(value: str | None) -> str:
    parser = _TextExtractor()
    parser.feed(value or "")
    return " ".join(html.unescape("".join(parser.parts)).split())


def chunks(values: list[Any], size: int) -> Iterable[list[Any]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def request_json(url: str, params: dict[str, Any], retries: int = 3) -> dict[str, Any]:
    target = f"{url}?{urlencode(params)}"
    for attempt in range(retries):
        try:
            request = Request(target, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def request_bytes(url: str, retries: int = 3) -> bytes:
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=60) as response:
                return response.read()
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def wikidata_images(cricinfo_ids: list[str], batch_size: int = 100) -> dict[str, dict[str, str]]:
    results: dict[str, dict[str, str]] = {}
    for batch in chunks(cricinfo_ids, batch_size):
        values = " ".join(json.dumps(value) for value in batch)
        query = f"""
        SELECT ?cricinfo (SAMPLE(?item) AS ?item) (SAMPLE(?image) AS ?image) WHERE {{
          VALUES ?cricinfo {{ {values} }}
          ?item wdt:P2697 ?cricinfo;
                wdt:P18 ?image.
        }} GROUP BY ?cricinfo
        """
        payload = request_json(WIKIDATA_SPARQL, {"format": "json", "query": query})
        for binding in payload.get("results", {}).get("bindings", []):
            cricinfo_id = binding["cricinfo"]["value"]
            results[cricinfo_id] = {
                "wikidata_item": binding["item"]["value"].rsplit("/", 1)[-1],
                "image_url": binding["image"]["value"],
            }
        time.sleep(0.15)
    return results


def commons_title(image_url: str) -> str:
    filename = unquote(urlparse(image_url).path.rsplit("/", 1)[-1])
    return f"File:{filename.replace('_', ' ')}"


def commons_metadata(titles: list[str], batch_size: int = 40) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for batch in chunks(titles, batch_size):
        payload = request_json(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "imageinfo",
                "iiprop": "url|extmetadata|size|mime",
                "iiurlwidth": "900",
                "titles": "|".join(batch),
            },
        )
        for page in payload.get("query", {}).get("pages", []):
            info_rows = page.get("imageinfo") or []
            if not info_rows:
                continue
            info = info_rows[0]
            ext = info.get("extmetadata") or {}

            def meta(key: str) -> str:
                return str((ext.get(key) or {}).get("value") or "")

            title = page.get("title") or ""
            results[title] = {
                "commons_title": title,
                "commons_page": info.get("descriptionurl") or (
                    "https://commons.wikimedia.org/wiki/" + title.replace(" ", "_")
                ),
                "download_url": info.get("thumburl") or info.get("url"),
                "original_url": info.get("url"),
                "width": info.get("width"),
                "height": info.get("height"),
                "mime": info.get("mime"),
                "artist": plain_text(meta("Artist")),
                "credit": plain_text(meta("Credit")),
                "license": plain_text(meta("LicenseShortName") or meta("UsageTerms")),
                "license_url": meta("LicenseUrl"),
                "attribution": plain_text(meta("Attribution")),
                "attribution_required": meta("AttributionRequired").casefold() == "true",
                "restrictions": plain_text(meta("Restrictions")),
            }
        time.sleep(0.15)
    return results


def reusable_license(metadata: dict[str, Any]) -> bool:
    licence = f"{metadata.get('license', '')} {metadata.get('license_url', '')}".casefold()
    return any(marker in licence for marker in ALLOWED_LICENSE_MARKERS)


def safe_filename(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", name).strip(" .")


def existing_image(identity: dict[str, Any], image_dir: Path) -> Path | None:
    stems = {
        str(value).strip().casefold()
        for value in [identity.get("name"), identity.get("source_name"), *identity.get("aliases", [])]
        if value
    }
    for path in image_dir.iterdir():
        if path.is_file() and path.suffix.casefold() in {".png", ".jpg", ".jpeg", ".webp"}:
            if path.stem.casefold() in stems:
                return path
    return None


def make_avatar(source: bytes, destination: Path, size: int = 512) -> None:
    with Image.open(BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        # A high crop centre works better for portraits and cricket photos than
        # a geometric centre while still retaining shoulders and team kit.
        avatar = ImageOps.fit(
            image,
            (size, size),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.32),
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        avatar.save(destination, "WEBP", quality=84, method=6)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--player", action="append", default=[], help="Canonical player name; repeatable")
    parser.add_argument("--limit", type=int, default=0, help="Limit selected catalogue entries")
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing local player image")
    parser.add_argument("--dry-run", action="store_true", help="Resolve and report without downloading images")
    parser.add_argument("--size", type=int, default=512, help="Square WebP output size")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    catalogue = load_json(CATALOGUE_PATH, {"identities": {}})
    identities = list(catalogue.get("identities", {}).values())
    selected_names = {name.casefold() for name in args.player}
    if selected_names:
        identities = [item for item in identities if item.get("name", "").casefold() in selected_names]
    identities = [item for item in identities if item.get("cricinfo_id")]
    identities.sort(key=lambda item: item.get("name", "").casefold())
    if args.limit:
        identities = identities[:args.limit]

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    pending: list[dict[str, Any]] = []
    skipped_existing: list[str] = []
    for identity in identities:
        current = existing_image(identity, IMAGE_DIR)
        if current and not args.overwrite:
            skipped_existing.append(identity["name"])
        else:
            pending.append(identity)

    wd = wikidata_images(sorted({str(item["cricinfo_id"]) for item in pending})) if pending else {}
    title_by_id = {
        cricinfo_id: commons_title(value["image_url"])
        for cricinfo_id, value in wd.items()
    }
    commons = commons_metadata(sorted(set(title_by_id.values()))) if title_by_id else {}

    attribution = load_json(
        ATTRIBUTION_PATH,
        {"generated_at": None, "source": "Wikimedia Commons", "images": {}},
    )
    decisions = load_json(DECISIONS_PATH, {"rejected": {}})
    imported: list[str] = []
    unmatched: list[str] = []
    rejected_license: list[dict[str, str]] = []
    rejected_quality: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    for identity in pending:
        name = identity["name"]
        cricinfo_id = str(identity["cricinfo_id"])
        wd_item = wd.get(cricinfo_id)
        if not wd_item:
            unmatched.append(name)
            continue
        title = title_by_id[cricinfo_id]
        decision = decisions.get("rejected", {}).get(identity["id"])
        if decision and decision.get("commons_title") == title:
            rejected_quality.append({"player": name, "reason": decision.get("reason", "manual review")})
            continue
        metadata = commons.get(title)
        if not metadata or not metadata.get("download_url"):
            unmatched.append(name)
            continue
        if not reusable_license(metadata):
            rejected_license.append({"player": name, "license": metadata.get("license") or "unknown"})
            continue

        filename = f"{safe_filename(name)}.webp"
        destination = IMAGE_DIR / filename
        record = {
            "player_id": identity["id"],
            "player_name": name,
            "filename": filename,
            "wikidata_item": wd_item["wikidata_item"],
            **metadata,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "modified": True,
            "modification": f"Square {args.size}x{args.size} WebP portrait crop",
        }
        if not args.dry_run:
            try:
                make_avatar(request_bytes(metadata["download_url"]), destination, args.size)
            except Exception as exc:
                errors.append({"player": name, "error": str(exc)})
                continue
            attribution["images"][identity["id"]] = record
        imported.append(name)

    now = datetime.now(timezone.utc).isoformat()
    report = {
        "generated_at": now,
        "dry_run": args.dry_run,
        "selected": len(identities),
        "pending": len(pending),
        "imported": imported,
        "skipped_existing": skipped_existing,
        "unmatched": unmatched,
        "rejected_license": rejected_license,
        "rejected_quality": rejected_quality,
        "errors": errors,
    }
    if not args.dry_run:
        attribution["generated_at"] = now
        write_json(ATTRIBUTION_PATH, attribution)
    write_json(REPORT_PATH, report)
    print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in report.items()}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
