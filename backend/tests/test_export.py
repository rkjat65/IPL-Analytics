import unittest

from backend.database import query
from backend.routers.export import _careers, _teams, _venues
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


    def test_venue_export_merges_name_variants(self):
        token = set_tournament("ipl")
        try:
            data = _venues("ipl")
        finally:
            reset_tournament(token)
        wankhede = data["venues"]["Wankhede Stadium, Mumbai"]
        self.assertGreaterEqual(len(wankhede["aliases"]), 2)
        self.assertEqual(sum(a["matches"] for a in wankhede["aliases"]), wankhede["matches"])
        self.assertEqual(wankhede["bat_first_won"] + wankhede["chase_won"], wankhede["decided"])
        self.assertEqual(wankhede["decided"] + wankhede["tied"] + wankhede["no_result"], wankhede["matches"])
        self.assertGreaterEqual(wankhede["highest_total"]["runs"], wankhede["lowest_total"]["runs"])
        self.assertTrue(all(b["id"] for b in wankhede["top_batters"]))

    def test_team_export_finds_titles_and_finishes(self):
        token = set_tournament("t20wc")
        try:
            data = _teams("t20wc")
        finally:
            reset_tournament(token)
        india = data["teams"]["India"]
        self.assertIn("2007", india["titles"])
        self.assertEqual(india["won"] + india["lost"] + india["tied"] + india["no_result"], india["matches"])
        self.assertEqual(sum(e["played"] for e in india["editions"]), india["matches"])
        finishes = {e["edition"]: e["finish"] for e in india["editions"]}
        self.assertEqual(finishes["2014"], "Runners-up")
        self.assertIsNone(finishes["2021"])
        self.assertEqual(len([t for t in data["teams"].values() if "2009" in t["titles"]]), 1)


if __name__ == "__main__":
    unittest.main()
