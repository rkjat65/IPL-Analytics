import unittest

from backend.database import query
from backend.routers.export import _careers
from backend.tournaments import reset_tournament, set_tournament

KOHLI = "ba607b88"
BUMRAH = "462411b3"


def careers(slug):
    token = set_tournament(slug)
    try:
        return _careers(slug)
    finally:
        reset_tournament(token)


class CareerExportTests(unittest.TestCase):
    def test_batting_follows_scorebook_conventions(self):
        data = careers("ipl")
        kohli = data["players"][KOHLI]
        self.assertEqual(kohli["name"], "Virat Kohli")
        c = kohli["career"]
        token = set_tournament("ipl")
        try:
            raw = query(
                "SELECT SUM(runs_batter) AS runs, COUNT(CASE WHEN extras_wides = 0 THEN 1 END) AS balls "
                "FROM deliveries WHERE batter = 'Virat Kohli' AND NOT is_super_over"
            )[0]
        finally:
            reset_tournament(token)
        self.assertEqual(c["runs"], raw["runs"])
        self.assertEqual(c["balls"], raw["balls"])
        self.assertGreaterEqual(c["matches"], c["innings"])
        self.assertGreater(c["outs"], 200)
        self.assertGreaterEqual(c["hundreds"], 8)
        self.assertEqual(kohli["teams"][0]["team"], "Royal Challengers Bengaluru")

    def test_seasons_add_up_to_the_career(self):
        data = careers("ipl")
        for pid in (KOHLI, BUMRAH):
            p = data["players"][pid]
            for key in ("matches", "innings", "runs", "balls", "outs", "wickets", "bowl_balls", "conceded", "catches", "awards"):
                self.assertEqual(sum(s[key] for s in p["seasons"]), p["career"][key], (pid, key))
            editions = [s["edition"] for s in p["seasons"]]
            self.assertEqual(editions, sorted(editions))
            self.assertTrue(all(len(e) == 4 and e.isdigit() for e in editions))

    def test_bowling_best_and_hauls(self):
        data = careers("ipl")
        c = data["players"][BUMRAH]["career"]
        self.assertGreater(c["wickets"], 150)
        self.assertRegex(c["best"], r"^\d+/\d+$")
        self.assertGreaterEqual(int(c["best"].split("/")[0]), 5)
        self.assertGreaterEqual(c["five_w"], 1)

    def test_line_ups_count_matches_without_batting_or_bowling(self):
        data = careers("ipl")
        fielded_only = [p for p in data["players"].values() if p["career"]["matches"] > max(p["career"]["innings"], p["career"]["bowl_innings"])]
        self.assertTrue(fielded_only)

    def test_world_cup_export_is_isolated(self):
        data = careers("t20wc")
        self.assertEqual(data["meta"]["tournament"], "t20wc")
        kohli = data["players"][KOHLI]
        self.assertEqual({t["team"] for t in kohli["teams"]}, {"India"})
        self.assertLess(kohli["career"]["runs"], 2000)


if __name__ == "__main__":
    unittest.main()
