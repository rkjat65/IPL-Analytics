import asyncio
import os
import unittest
from unittest import mock
from urllib.parse import quote

from backend.main import FRONTEND_DIST, app, canonical_redirect, legacy_app_path, spa_prefix


class Result:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = {k.decode().lower(): v.decode() for k, v in headers}
        self.text = body.decode("utf-8", "replace")


def get(url, host="testserver"):
    """Call the app in-process, like the other tests here (CI has no httpx)."""
    path, _, qs = url.partition("?")
    raw = quote(path, safe="/%")
    scope = {"type": "http", "method": "GET", "path": path, "raw_path": raw.encode(),
             "query_string": qs.encode(), "headers": [(b"host", host.encode())], "scheme": "http",
             "server": ("testserver", 80), "client": ("test", 1), "root_path": "",
             "http_version": "1.1", "asgi": {"version": "3.0"}}
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return Result(start["status"], start.get("headers", []), body)

ORIGIN = {"CANONICAL_ORIGIN": "https://crickrida.com"}


class LegacyPathTest(unittest.TestCase):
    def test_old_app_pages_move_under_their_tournament(self):
        self.assertEqual(legacy_app_path("/", ""), "/ipl/dashboard")
        self.assertEqual(legacy_app_path("/dashboard", ""), "/ipl/dashboard")
        self.assertEqual(legacy_app_path("/batting/Virat Kohli", ""), "/ipl/batting/Virat Kohli")
        self.assertEqual(legacy_app_path("/matches/1082591", "tournament=t20wc&x=1"), "/t20-world-cup/matches/1082591?x=1")
        self.assertEqual(legacy_app_path("/records", "tab=bowling&tournament=t20wc&data_release=v3"), "/t20-world-cup/records?tab=bowling")
        self.assertEqual(legacy_app_path("/players", "tournament=bogus"), "/ipl/players")

    def test_site_pages_are_not_app_pages(self):
        for path in ("/grounds/eden-gardens-c0d7f8/", "/compare/", "/search/", "/sitemap.xml", "/app/logo.png"):
            self.assertIsNone(legacy_app_path(path, ""), path)
        self.assertEqual(spa_prefix("/ipl/teams/India"), ("/ipl", "ipl"))
        self.assertEqual(spa_prefix("/t20-world-cup"), ("/t20-world-cup", "t20wc"))
        self.assertIsNone(spa_prefix("/iplx/teams"))


class CanonicalHostTest(unittest.TestCase):
    def test_inactive_without_a_canonical_origin(self):
        with mock.patch.dict(os.environ, {"CANONICAL_ORIGIN": ""}):
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/records", "", "GET"))

    def test_retired_host_goes_straight_to_the_new_address(self):
        with mock.patch.dict(os.environ, ORIGIN):
            self.assertEqual(canonical_redirect("crickrida.rkjat.in", "/records", "tab=bowling&tournament=t20wc", "GET"),
                             "https://crickrida.com/t20-world-cup/records?tab=bowling")
            self.assertEqual(canonical_redirect("Crickrida.RKJAT.in", "/", "", "HEAD"), "https://crickrida.com/ipl/dashboard")
            self.assertEqual(canonical_redirect("crickrida.rkjat.in", "/batting/Virat Kohli", "", "GET"),
                             "https://crickrida.com/ipl/batting/Virat Kohli")
            self.assertEqual(canonical_redirect("crickrida.rkjat.in", "/sitemap.xml", "", "GET"), "https://crickrida.com/sitemap.xml")
            self.assertEqual(canonical_redirect("crickrida.rkjat.in", "/ipl/phases", "", "GET"), "https://crickrida.com/ipl/phases")

    def test_api_writes_local_and_service_worker_are_served_in_place(self):
        with mock.patch.dict(os.environ, {"CANONICAL_ORIGIN": "https://crickrida.com/"}):
            self.assertIsNone(canonical_redirect("crickrida.com", "/ipl/records", "", "GET"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/api/records/summary", "", "GET"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/api/pulse/insight-card", "", "POST"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/sw.js", "", "GET"))
            self.assertIsNone(canonical_redirect("127.0.0.1:8000", "/dashboard", "", "GET"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/login", "", "POST"))


class RouteTest(unittest.TestCase):
    def test_old_root_pages_redirect_on_the_canonical_host(self):
        r = get("/matches/1082591?tournament=t20wc")
        self.assertEqual(r.status_code, 301)
        self.assertEqual(r.headers["location"], "/t20-world-cup/matches/1082591")
        r = get("/")
        self.assertEqual(r.headers["location"], "/ipl/dashboard")

    def test_retired_service_worker_unregisters_itself(self):
        r = get("/sw.js")
        self.assertEqual(r.status_code, 200)
        self.assertIn("unregister()", r.text)
        self.assertIn("no-cache", r.headers["cache-control"])

    def test_moved_tools_go_to_the_shared_pages(self):
        r = get("/ipl/matchups?batter=Virat%20Kohli&bowler=Jasprit%20Bumrah&season=2016,2024")
        self.assertEqual(r.status_code, 301)
        self.assertEqual(r.headers["location"], "/matchups/?comp=IPL&from=2016&to=2024&batter=ba607b88&bowler=462411b3")
        self.assertEqual(get("/t20-world-cup/phases").headers["location"], "/phases/?comp=T20WC")
        self.assertEqual(get("/ipl/phases?team=Mumbai%20Indians").headers["location"], "/phases/?team=Mumbai+Indians")
        self.assertEqual(get("/t20-world-cup/fantasy?team1=India&team2=Pakistan").headers["location"], "/fantasy/?comp=T20I-Men&team1=India&team2=Pakistan")
        self.assertEqual(get("/ipl/quiz?level=hard").headers["location"], "/quiz/?mode=ipl&level=hard")
        self.assertEqual(get("/ipl/content-studio").headers["location"], "/studio/?format=IPL")
        # Pre-merge root addresses reach the shared page in one hop too.
        self.assertEqual(legacy_app_path("/quiz", "tournament=t20wc"), "/quiz/?mode=t20wc")

    def test_unknown_paths_are_404(self):
        self.assertEqual(get("/app/nope.js").status_code, 404)
        self.assertEqual(get("/grounds/eden-gardens-c0d7f8/").status_code, 404)

    @unittest.skipUnless((FRONTEND_DIST / "index.html").is_file(), "frontend not built")
    def test_app_pages_render_under_their_prefix(self):
        r = get("/t20-world-cup/teams/India")
        self.assertEqual(r.status_code, 200)
        self.assertIn('rel="canonical" href="https://crickrida.com/t20-world-cup/teams/India"', r.text)
        self.assertIn('href="/t20-world-cup/teams/', r.text)
        self.assertIn('src="/app/assets/', r.text)
        r = get("/ipl/batting/Virat Kohli")
        self.assertIn('href="https://crickrida.com/ipl/batting/Virat%20Kohli"', r.text)
        self.assertEqual(get("/app/logo.png").status_code, 200)


if __name__ == "__main__":
    unittest.main()
