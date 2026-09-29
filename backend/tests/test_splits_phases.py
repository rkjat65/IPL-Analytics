import unittest

from fastapi import HTTPException

from backend.routers.phases import over_profile, phase_leaders, phase_summary
from backend.routers.players import player_splits
from backend.tournaments import reset_tournament, set_tournament


class InTournament:
    def __init__(self, slug):
        self.slug = slug

    def __enter__(self):
        self.token = set_tournament(self.slug)

    def __exit__(self, *exc):
        reset_tournament(self.token)


class PlayerSplitTests(unittest.TestCase):
    def test_batting_splits_for_a_top_order_batter(self):
        s = player_splits("Virat Kohli")
        bat = s["batting"]
        positions = {r["position"]: r for r in bat["positions"]}
        self.assertIn(3, positions)
        self.assertGreater(positions[3]["innings"], 50)
        self.assertEqual(sum(r["innings"] for r in bat["positions"]), sum(r["innings"] for r in bat["venues"]))
        self.assertEqual(bat["venues"][0]["venue"], "M Chinnaswamy Stadium, Bengaluru")
        self.assertEqual(len(bat["by_over"]), 20)
        self.assertEqual(bat["by_over"][0]["over"], 1)
        kinds = {r["kind"] for r in bat["dismissals"]}
        self.assertIn("caught", kinds)
        self.assertIn("not out", kinds)
        self.assertEqual(sum(r["innings"] for r in bat["scores"]), sum(r["innings"] for r in bat["positions"]))

    def test_bowling_splits_for_a_death_bowler(self):
        s = player_splits("Jasprit Bumrah")
        bowl = s["bowling"]
        self.assertEqual(len(bowl["by_over"]), 20)
        death = [r for r in bowl["by_over"] if r["over"] >= 16]
        self.assertGreater(sum(r["wickets"] for r in death), 40)
        self.assertTrue(all(r["economy"] is None or r["economy"] > 0 for r in bowl["by_over"]))
        self.assertGreater(bowl["venues"][0]["wickets"], 20)

    def test_unknown_player_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            player_splits("Zzyzx Qwertyuiop")
        self.assertEqual(ctx.exception.status_code, 404)


class PhaseTests(unittest.TestCase):
    def test_phase_summary_shape(self):
        s = phase_summary()
        self.assertEqual([p["phase"] for p in s["phases"]], ["powerplay", "middle", "death"])
        death = s["phases"][2]
        self.assertGreater(death["run_rate"], s["phases"][1]["run_rate"])
        self.assertGreater(death["balls"], 10000)
        self.assertEqual(len(s["by_innings"]), 6)
        self.assertTrue(s["venues"] and "powerplay_rr" in s["venues"][0])
        self.assertTrue(any(t["decision"] == "field" for t in s["toss"]))
        self.assertGreater(s["chase"]["matches"], 1000)
        self.assertTrue(0 < s["chase"]["chase_win_pct"] < 100)

    def test_overs_and_leaders(self):
        overs = over_profile()
        self.assertEqual([r["over"] for r in overs], list(range(1, 21)))
        self.assertGreater(overs[19]["run_rate"], overs[9]["run_rate"])
        first = over_profile(innings=1)
        self.assertGreaterEqual(first[0]["innings"], overs[0]["innings"] / 2 - 5)
        leaders = phase_leaders(phase="death", min_balls=200, limit=5)
        self.assertTrue(all(r["balls"] >= 200 for r in leaders["batters"]))
        self.assertEqual(leaders["batters"], sorted(leaders["batters"], key=lambda r: -r["runs"]))
        self.assertTrue(leaders["bowlers"] and leaders["bowlers"][0]["wickets"] >= leaders["bowlers"][-1]["wickets"])
        filtered = phase_summary(season="2024", team="Royal Challengers Bengaluru", venue="M Chinnaswamy Stadium, Bengaluru")
        self.assertTrue(filtered["phases"])

    def test_world_cup_isolation(self):
        with InTournament("t20wc"):
            s = phase_summary()
            self.assertEqual(len(s["phases"]), 3)
            self.assertNotIn("Mumbai Indians", {v["venue"] for v in s["venues"]})
            self.assertTrue(player_splits("Virat Kohli")["batting"]["positions"])


if __name__ == "__main__":
    unittest.main()
