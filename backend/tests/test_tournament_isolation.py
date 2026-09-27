import unittest

from backend.database import query
from backend.tournaments import reset_tournament, set_tournament


class TestTournamentIsolation(unittest.TestCase):
    def _in_tournament(self, slug, sql):
        token = set_tournament(slug)
        try:
            return query(sql)
        finally:
            reset_tournament(token)

    def test_match_counts_are_isolated(self):
        ipl = self._in_tournament("ipl", "SELECT COUNT(*) AS count FROM matches")
        world_cup = self._in_tournament("t20wc", "SELECT COUNT(*) AS count FROM matches")
        self.assertEqual(ipl[0]["count"], 1243)
        self.assertEqual(world_cup[0]["count"], 378)

    def test_team_sets_do_not_mix(self):
        ipl = self._in_tournament(
            "ipl", "SELECT COUNT(*) AS count FROM matches WHERE team1 = 'India' OR team2 = 'India'"
        )
        world_cup = self._in_tournament(
            "t20wc", "SELECT COUNT(*) AS count FROM matches WHERE team1 = 'India' OR team2 = 'India'"
        )
        self.assertEqual(ipl[0]["count"], 0)
        self.assertGreater(world_cup[0]["count"], 0)

    def test_world_cup_editions_are_normalized(self):
        editions = self._in_tournament(
            "t20wc", "SELECT DISTINCT season FROM matches ORDER BY season"
        )
        self.assertEqual(
            [row["season"] for row in editions],
            ["2007", "2009", "2010", "2012", "2014", "2016", "2021", "2022", "2024", "2026"],
        )


if __name__ == "__main__":
    unittest.main()
