import unittest

from fastapi import HTTPException

from backend.routers.fantasy import fantasy_picks
from backend.routers.quiz import _careers, quiz_player


class FantasyTest(unittest.TestCase):
    def test_picks_an_xi_from_both_squads(self):
        r = fantasy_picks(team1="Mumbai Indians", team2="Chennai Super Kings", venue="Wankhede Stadium, Mumbai")
        self.assertEqual(len(r["xi"]), 11)
        self.assertEqual(r["captain"], r["xi"][0])
        by_name = {p["player"]: p for p in r["players"]}
        teams = [by_name[n]["team"] for n in r["xi"]]
        self.assertLessEqual(max(teams.count(t) for t in set(teams)), 7)
        bowling = [n for n in r["xi"] if by_name[n]["role"] in ("Bowler", "All-rounder")]
        self.assertGreaterEqual(len(bowling), 3)
        self.assertEqual(r["players"], sorted(r["players"], key=lambda p: -p["projected"]))

    def test_historical_team_names_resolve(self):
        r = fantasy_picks(team1="Royal Challengers Bengaluru", team2="Delhi Capitals", venue=None)
        self.assertEqual(len(r["xi"]), 11)

    def test_unknown_team_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            fantasy_picks(team1="Nope XI", team2="Mumbai Indians", venue=None)
        self.assertEqual(ctx.exception.status_code, 404)


class QuizTest(unittest.TestCase):
    def test_question_has_answer_among_four_options(self):
        q = quiz_player(level="easy", seed=42)
        self.assertEqual(len(q["options"]), 4)
        self.assertEqual(len(set(q["options"])), 4)
        self.assertIn(q["answer"], q["options"])
        labels = [c["label"] for c in q["clues"]]
        self.assertIn("Matches", labels)
        self.assertTrue(q["clues"][-1]["hint"])

    def test_seed_makes_questions_repeatable_and_varied(self):
        self.assertEqual(quiz_player(level="medium", seed=1), quiz_player(level="medium", seed=1))
        answers = {quiz_player(level="medium", seed=s)["answer"] for s in range(20)}
        self.assertGreater(len(answers), 10)

    def test_roles(self):
        roles = {c["player"]: c["role"] for c in _careers("ipl")}
        self.assertEqual(roles["Virat Kohli"], "Batter")
        self.assertEqual(roles["Jasprit Bumrah"], "Bowler")
        self.assertEqual(roles["Ravindra Jadeja"], "All-rounder")


if __name__ == "__main__":
    unittest.main()
