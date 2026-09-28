import unittest
import xml.etree.ElementTree as ET

from backend import seo
from backend.tournaments import reset_tournament, set_tournament

INDEX = """<!DOCTYPE html><html><head>
    <title>Crickrida | Cricket via Stats</title>
  </head><body><div id="root"></div></body></html>"""


class InTournament:
    def __init__(self, slug):
        self.slug = slug

    def __enter__(self):
        self.token = set_tournament(self.slug)

    def __exit__(self, *exc):
        reset_tournament(self.token)


class PageMetaTest(unittest.TestCase):
    def test_player_page_uses_real_stats(self):
        meta = seo.page_meta("/batting/V Kohli")
        self.assertEqual(meta.status, 200)
        self.assertEqual(meta.path, "/batting/Virat%20Kohli")
        self.assertIn("Virat Kohli", meta.title)
        self.assertIn("runs", meta.description)
        self.assertEqual(meta.stats[0][0], "Runs")

    def test_bowling_route_canonicalises_to_bowling(self):
        meta = seo.page_meta("/bowling/JJ Bumrah")
        self.assertEqual(meta.path, "/bowling/Jasprit%20Bumrah")
        self.assertEqual(meta.stats[0][0], "Wickets")

    def test_team_names_are_normalised(self):
        teams = [t["team"] for t in seo._teams("ipl")]
        self.assertIn("Royal Challengers Bengaluru", teams)
        self.assertNotIn("Royal Challengers Bangalore", teams)
        self.assertNotIn("Delhi Daredevils", teams)

    def test_match_and_season_pages(self):
        match = seo.page_meta("/matches/1082591")
        self.assertIn("Sunrisers Hyderabad vs Royal Challengers Bengaluru", match.title)
        # Starlette decodes %2F, so a season with a slash arrives split.
        season = seo.page_meta("/seasons/2007/08")
        self.assertEqual(season.status, 200)
        self.assertEqual(season.path, "/seasons/2007%2F08")

    def test_unknown_pages_are_404(self):
        for path in ["/batting/Nobody Here", "/teams/Nope", "/matches/0", "/not-a-page"]:
            self.assertEqual(seo.page_meta(path).status, 404, path)

    def test_t20_world_cup_pages(self):
        with InTournament("t20wc"):
            meta = seo.page_meta("/dashboard")
            self.assertIn("T20 World Cup", meta.title)
            self.assertEqual(seo.canonical_url(meta.path), f"{seo.SITE_URL}/dashboard?tournament=t20wc")
            self.assertEqual(seo.page_meta("/teams/India").status, 200)


class RenderIndexTest(unittest.TestCase):
    def test_injects_head_and_body(self):
        page, status = seo.render_index(INDEX, "teams/Mumbai Indians")
        self.assertEqual(status, 200)
        self.assertEqual(page.count("<title>"), 1)
        self.assertIn("<title>Mumbai Indians — IPL Team Profile", page)
        self.assertIn('rel="canonical" href="https://crickrida.rkjat.in/teams/Mumbai%20Indians" data-rh="true"', page)
        self.assertIn("/api/og?path=", page)
        self.assertIn('application/ld+json', page)
        self.assertIn('<div id="root"><main', page)

    def test_hostile_path_is_escaped(self):
        page, status = seo.render_index(INDEX, 'batting/<script>alert(1)</script>')
        self.assertEqual(status, 404)
        self.assertNotIn("<script>alert(1)</script>", page)
        self.assertIn('content="noindex"', page)


class SitemapTest(unittest.TestCase):
    def test_sitemap_is_valid_and_covers_both_tournaments(self):
        xml = seo.build_sitemap()
        root = ET.fromstring(xml)
        locs = [el.text for el in root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        self.assertGreater(len(locs), 1000)
        self.assertEqual(len(locs), len(set(locs)))
        self.assertIn(f"{seo.SITE_URL}/batting/Virat%20Kohli", locs)
        self.assertIn(f"{seo.SITE_URL}/dashboard?tournament=t20wc", locs)
        self.assertIn(f"{seo.SITE_URL}/seasons/2007%2F08", locs)
        self.assertFalse(any("/ask" in loc or "/login" in loc or "/admin" in loc for loc in locs))


class SeasonRouteTest(unittest.TestCase):
    def test_season_routes_accept_slashes(self):
        # Seasons like "2007/08" arrive as /api/seasons/2007/08/summary once
        # %2F is decoded; the routes must still match.
        from starlette.routing import Match

        from backend.routers.seasons import router

        for endpoint in ("summary", "cap-race", "points-table", "groups"):
            scope = {"type": "http", "method": "GET", "path": f"/api/seasons/2007/08/{endpoint}",
                     "root_path": "", "query_string": b"", "headers": []}
            hits = [child for r in router.routes
                    for m, child in [r.matches(scope)] if m == Match.FULL]
            self.assertEqual(len(hits), 1, endpoint)
            self.assertEqual(hits[0]["path_params"]["season"], "2007/08")


if __name__ == "__main__":
    unittest.main()
