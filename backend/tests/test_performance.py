import tempfile
import unittest
from pathlib import Path

from PIL import Image
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response
from starlette.routing import Route
from starlette.testclient import TestClient

from backend.http_cache import HttpCacheMiddleware, cacheable_api_path
from backend.routers.players import player_thumbnail

calls = {"n": 0}


def data(request):
    calls["n"] += 1
    return JSONResponse({"n": calls["n"], "q": request.query_params.get("tournament")})


def me(request):
    calls["n"] += 1
    return JSONResponse({"n": calls["n"]})


def asset(request):
    return Response(b"js", media_type="application/javascript")


def build_client():
    app = Starlette(routes=[
        Route("/api/analytics/kpis", data),
        Route("/api/auth/me", me),
        Route("/assets/app.js", asset),
    ])
    app.add_middleware(HttpCacheMiddleware)
    return TestClient(app)


class HttpCacheTest(unittest.TestCase):
    def setUp(self):
        calls["n"] = 0
        self.client = build_client()

    def test_repeat_get_is_served_from_memory(self):
        first = self.client.get("/api/analytics/kpis?tournament=ipl")
        second = self.client.get("/api/analytics/kpis?tournament=ipl")
        self.assertEqual(first.headers["x-cache"], "MISS")
        self.assertEqual(second.headers["x-cache"], "HIT")
        self.assertEqual(second.json(), first.json())
        self.assertEqual(calls["n"], 1)
        self.assertIn("max-age=300", second.headers["cache-control"])

    def test_query_string_is_part_of_the_key(self):
        ipl = self.client.get("/api/analytics/kpis?tournament=ipl").json()
        t20 = self.client.get("/api/analytics/kpis?tournament=t20wc").json()
        self.assertEqual((ipl["q"], t20["q"]), ("ipl", "t20wc"))
        self.assertEqual(calls["n"], 2)

    def test_auth_is_never_cached(self):
        self.client.get("/api/auth/me")
        response = self.client.get("/api/auth/me")
        self.assertNotIn("x-cache", response.headers)
        self.assertEqual(calls["n"], 2)
        self.assertFalse(cacheable_api_path("/api/social/drafts"))

    def test_hashed_assets_are_immutable(self):
        response = self.client.get("/assets/app.js")
        self.assertIn("immutable", response.headers["cache-control"])


class ThumbnailTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_makes_small_square_webp(self):
        src = self.dir / "Big Player.png"
        Image.new("RGB", (1200, 1800), (200, 30, 30)).save(src)
        thumb = player_thumbnail(src, 90)
        with Image.open(thumb) as im:
            self.assertEqual(im.format, "WEBP")
            self.assertEqual(im.size, (96, 96))
        self.assertLess(thumb.stat().st_size, src.stat().st_size)
        self.assertEqual(player_thumbnail(src, 90), thumb)  # cached

    def test_non_image_file_returns_none(self):
        bad = self.dir / "Broken.png"
        bad.write_text("<html>not an image</html>")
        self.assertIsNone(player_thumbnail(bad, 96))


if __name__ == "__main__":
    unittest.main()
