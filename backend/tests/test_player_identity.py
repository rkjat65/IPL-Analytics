import json
import unittest
from pathlib import Path

from PIL import Image

from backend.database import query
from backend.player_identity import identity_for
from backend.routers.meta import player_image_credits, search_players
from backend.tournaments import reset_tournament, set_tournament


class TestPlayerIdentity(unittest.TestCase):
    def _in_tournament(self, slug, callback):
        token = set_tournament(slug)
        try:
            return callback()
        finally:
            reset_tournament(token)

    def test_known_name_variants_resolve_to_one_person(self):
        abbreviated = identity_for("V Kohli")
        full = identity_for("Virat Kohli")
        nickname = identity_for("Cheeku")
        self.assertIsNotNone(abbreviated)
        self.assertEqual(abbreviated["id"], full["id"])
        self.assertEqual(full["id"], nickname["id"])
        self.assertEqual(full["name"], "Virat Kohli")
        self.assertIn("King Kohli", full["famous_names"])

    def test_databases_contain_players_not_officials(self):
        for slug, expected in (("ipl", 816), ("t20wc", 955)):
            rows = self._in_tournament(
                slug,
                lambda: query(
                    "SELECT COUNT(*) AS count, "
                    "COUNT(*) FILTER (WHERE name = 'HDPK Dharmasena') AS officials "
                    "FROM players"
                ),
            )
            self.assertEqual(rows[0]["count"], expected)
            self.assertEqual(rows[0]["officials"], 0)

    def test_world_cup_variants_are_merged_in_stats(self):
        rows = self._in_tournament(
            "t20wc",
            lambda: query(
                "SELECT batter, SUM(runs_batter) AS runs "
                "FROM deliveries WHERE batter IN ('V Kohli', 'Virat Kohli') "
                "GROUP BY batter"
            ),
        )
        self.assertEqual(rows, [{"batter": "Virat Kohli", "runs": 1292}])

    def test_famous_name_is_searchable_in_each_tournament(self):
        for slug in ("ipl", "t20wc"):
            results = self._in_tournament(slug, lambda: search_players(q="Cheeku"))
            self.assertEqual(results[0], "Virat Kohli")

    def test_player_rows_store_machine_readable_aliases(self):
        rows = self._in_tournament(
            "ipl",
            lambda: query("SELECT aliases, famous_names FROM players WHERE name = 'Virat Kohli'"),
        )
        self.assertEqual(len(rows), 1)
        self.assertIn("V Kohli", json.loads(rows[0]["aliases"]))
        self.assertIn("King Kohli", json.loads(rows[0]["famous_names"]))

    def test_wikimedia_image_credits_reference_publishable_square_assets(self):
        credits = player_image_credits()
        self.assertGreaterEqual(len(credits["images"]), 10)
        image_dir = Path(__file__).resolve().parents[1] / "player_images"
        for item in credits["images"]:
            self.assertTrue(item["commons_page"].startswith("https://commons.wikimedia.org/"))
            self.assertTrue(item["license"])
            self.assertTrue(item["artist"])
            path = image_dir / item["filename"]
            self.assertTrue(path.is_file(), path)
            with Image.open(path) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertEqual(image.size, (512, 512))


if __name__ == "__main__":
    unittest.main()
