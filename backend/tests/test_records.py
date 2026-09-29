import unittest

from backend.routers.players import player_index
from backend.routers.records import (
    duel_records,
    innings_records,
    partnership_records,
    records_summary,
    special_records,
    team_records,
)
from backend.tournaments import reset_tournament, set_tournament


class InTournament:
    def __init__(self, slug):
        self.slug = slug

    def __enter__(self):
        self.token = set_tournament(self.slug)

    def __exit__(self, *exc):
        reset_tournament(self.token)


class InningsRecordTests(unittest.TestCase):
    def test_highest_scores_are_ranked_and_carry_context(self):
        rows = innings_records(kind="highest_scores", limit=5)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows, sorted(rows, key=lambda r: -r["runs"]))
        top = rows[0]
        self.assertGreaterEqual(top["runs"], 150)
        for key in ("player", "team", "opponent", "match_id", "season", "date", "venue", "balls", "fours", "sixes", "sr", "not_out"):
            self.assertIn(key, top)
        self.assertNotIn("Royal Challengers Bangalore", {r["team"] for r in rows} | {r["opponent"] for r in rows})

    def test_fastest_fifty_counts_balls_to_the_milestone(self):
        rows = innings_records(kind="fastest_fifties", limit=3)
        self.assertLessEqual(rows[0]["balls"], 20)
        self.assertGreaterEqual(rows[0]["runs"], 50)
        self.assertLessEqual(rows[0]["balls"], rows[0]["balls_faced"])
        hundreds = innings_records(kind="fastest_hundreds", limit=3)
        self.assertGreaterEqual(hundreds[0]["runs"], 100)
        self.assertLess(hundreds[0]["balls"], 50)

    def test_best_bowling_prefers_wickets_then_runs(self):
        rows = innings_records(kind="best_bowling", limit=10)
        self.assertGreaterEqual(rows[0]["wickets"], 5)
        self.assertEqual(rows, sorted(rows, key=lambda r: (-r["wickets"], r["conceded"])))
        self.assertRegex(rows[0]["overs"], r"^\d+\.\d$")
        economy = innings_records(kind="best_economy", limit=5)
        self.assertTrue(all(r["balls"] >= 24 for r in economy))
        self.assertLess(economy[0]["economy"], 3)

    def test_filters_narrow_the_record(self):
        rows = innings_records(kind="highest_scores", season="2016", team="Royal Challengers Bengaluru", limit=3)
        self.assertTrue(rows)
        self.assertTrue(all(r["season"] == "2016" and r["team"] == "Royal Challengers Bengaluru" for r in rows))
        venue_rows = innings_records(kind="most_sixes", venue="Wankhede Stadium, Mumbai", limit=3)
        self.assertTrue(all(r["venue"] == "Wankhede Stadium, Mumbai" for r in venue_rows))
        expensive = innings_records(kind="most_expensive", limit=3)
        self.assertGreaterEqual(expensive[0]["conceded"], 30)


class TeamAndPartnershipTests(unittest.TestCase):
    def test_partnerships_name_two_batters(self):
        rows = partnership_records(limit=5)
        top = rows[0]
        self.assertGreaterEqual(top["runs"], 200)
        self.assertNotEqual(top["batter1"], top["batter2"])
        self.assertTrue(1 <= top["wicket"] <= 10)
        second = partnership_records(wicket=2, limit=3)
        self.assertTrue(all(r["wicket"] == 2 for r in second))

    def test_team_records(self):
        totals = team_records(kind="highest_totals", limit=3)
        self.assertGreaterEqual(totals[0]["runs"], 250)
        self.assertEqual(totals[0]["overs"], "20.0")
        lowest = team_records(kind="lowest_totals", limit=3)
        self.assertLess(lowest[0]["runs"], 80)
        chases = team_records(kind="highest_chases", limit=3)
        self.assertTrue(all(r["innings_number"] == 2 and r["won"] for r in chases))
        wins = team_records(kind="biggest_wins_runs", limit=3)
        self.assertGreaterEqual(wins[0]["win_by_runs"], 100)
        by_wickets = team_records(kind="biggest_wins_wickets", limit=3)
        self.assertEqual(by_wickets[0]["win_by_wickets"], 10)

    def test_special_records(self):
        hats = special_records(kind="hat_tricks", limit=200)
        self.assertGreaterEqual(len(hats), 15)
        self.assertEqual(hats[0]["victims"].count(","), 2)
        awards = special_records(kind="most_awards", limit=3)
        self.assertGreaterEqual(awards[0]["awards"], 15)
        ducks = special_records(kind="most_ducks", limit=3)
        self.assertGreaterEqual(ducks[0]["ducks"], ducks[0]["golden_ducks"])
        supers = special_records(kind="super_overs", limit=50)
        self.assertTrue(supers)
        self.assertTrue(all(r["super_over_innings"] >= 1 for r in supers))

    def test_duels_and_summary(self):
        duels = duel_records(sort_by="balls", min_balls=60, limit=5)
        self.assertGreaterEqual(duels[0]["balls"], 60)
        self.assertIn("dot_pct", duels[0])
        summary = records_summary()
        self.assertIn("highest_scores", summary)
        self.assertGreaterEqual(summary["hat_tricks"]["count"], 15)


class PlayerIndexTests(unittest.TestCase):
    def test_index_lists_every_player_with_role_and_span(self):
        rows = player_index()
        self.assertGreater(len(rows), 600)
        kohli = next(r for r in rows if r["player"] == "Virat Kohli")
        self.assertEqual(kohli["role"], "Batter")
        self.assertGreater(kohli["matches"], 200)
        self.assertIn("Royal Challengers Bengaluru", kohli["teams"])
        self.assertIn(kohli["first_season"], ("2007/08", "2008"))
        filtered = player_index(q="bumrah", role="Bowler")
        self.assertTrue(filtered and all("bumrah" in r["player"].lower() for r in filtered))


class TournamentIsolationTests(unittest.TestCase):
    def test_world_cup_records_come_from_the_world_cup_database(self):
        with InTournament("t20wc"):
            rows = innings_records(kind="highest_scores", limit=3)
            self.assertTrue(rows)
            self.assertNotIn("Mumbai Indians", {r["team"] for r in rows})
            totals = team_records(kind="highest_totals", limit=1)
            self.assertLess(totals[0]["runs"], 300)
            self.assertTrue(player_index(q="kohli"))


if __name__ == "__main__":
    unittest.main()
