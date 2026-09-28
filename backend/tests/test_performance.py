import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from backend.http_cache import HttpCacheMiddleware, cacheable_api_path
from backend.routers.players import available_images, player_thumbnail

calls = {"n": 0}


def data(request):
    calls["n"] += 1
    return JSONResponse({"n": calls["n"], "q": request.query_params.get("tournament")})


def me(request):
    calls["n"] += 1
    return JSONResponse({"n": calls["n"]})


def asset(request):
    return Response(b"js", media_type="application/javascript")


class _Result:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = {k.decode(): v.decode() for k, v in headers}
        self.body = body

    def json(self):
        return json.loads(self.body)


class AsgiClient:
    """Minimal in-process ASGI caller (no httpx dependency)."""

    def __init__(self, app):
        self.app = app

    def get(self, url):
        path, _, qs = url.partition("?")
        scope = {"type": "http", "method": "GET", "path": path, "raw_path": path.encode(),
                 "query_string": qs.encode(), "headers": [], "scheme": "http",
                 "server": ("test", 80), "client": ("test", 1), "root_path": "",
                 "http_version": "1.1", "asgi": {"version": "3.0"}}
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            sent.append(message)

        asyncio.run(self.app(scope, receive, send))
        start = next(m for m in sent if m["type"] == "http.response.start")
        body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
        return _Result(start["status"], start.get("headers", []), body)


def build_client():
    app = Starlette(routes=[
        Route("/api/analytics/kpis", data),
        Route("/api/auth/me", me),
        Route("/assets/app.js", asset),
    ])
    return AsgiClient(HttpCacheMiddleware(app))


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
        self.assertFalse(cacheable_api_path("/api/quiz/player"))

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

    def test_available_images_include_canonical_player_name(self):
        (self.dir / "V Kohli.png").write_bytes(b"image placeholder")
        with patch("backend.routers.players.PLAYER_IMAGES_DIR", self.dir):
            names = available_images()
        self.assertIn("V Kohli", names)
        self.assertIn("Virat Kohli", names)


if __name__ == "__main__":
    unittest.main()
