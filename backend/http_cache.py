"""HTTP caching for a read-only analytics API.

The cricket databases only change on deploy (or via ``refresh_db``), so public
GET responses can be kept in memory and served instantly, and browsers/CDNs
can be told to reuse them. Anything user-specific (auth, admin, social) is
never cached.
"""

from __future__ import annotations

import threading
from collections import OrderedDict

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import database

# Paths whose responses depend on who is asking, are random (quiz), or that
# manage their own cache.
_NEVER_CACHE = ("/api/auth", "/api/social", "/api/og", "/api/health", "/api/quiz")

API_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400"
ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"
IMAGE_CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400"
FONT_CACHE_CONTROL = "public, max-age=2592000"


def cacheable_api_path(path: str) -> bool:
    return path.startswith("/api/") and not path.startswith(_NEVER_CACHE)


def is_image_path(path: str) -> bool:
    return path.startswith("/api/team-images/") or path.endswith("/image")


class _LRU:
    def __init__(self, max_entries: int, max_bytes: int):
        self.max_entries = max_entries
        self.max_bytes = max_bytes
        self.bytes = 0
        self.data: OrderedDict[str, tuple[int, list, bytes]] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            hit = self.data.get(key)
            if hit is not None:
                self.data.move_to_end(key)
            return hit

    def put(self, key: str, value: tuple[int, list, bytes]) -> None:
        size = len(value[2])
        if size > self.max_bytes // 20:  # don't let one huge body evict everything
            return
        with self.lock:
            old = self.data.pop(key, None)
            if old is not None:
                self.bytes -= len(old[2])
            self.data[key] = value
            self.bytes += size
            while self.data and (len(self.data) > self.max_entries or self.bytes > self.max_bytes):
                _, evicted = self.data.popitem(last=False)
                self.bytes -= len(evicted[2])

    def clear(self) -> None:
        with self.lock:
            self.data.clear()
            self.bytes = 0


class HttpCacheMiddleware:
    """Serve repeated public API GETs from memory and set Cache-Control."""

    def __init__(self, app: ASGIApp, max_entries: int = 4000, max_bytes: int = 64 * 1024 * 1024):
        self.app = app
        self.cache = _LRU(max_entries, max_bytes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in ("GET", "HEAD"):
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]
        if path.startswith("/assets/"):
            await self.app(scope, receive, self._with_header(send, ASSET_CACHE_CONTROL))
            return
        if path == "/sw.js":
            # Browsers must always check for a new service worker
            await self.app(scope, receive, self._with_header(send, "no-cache"))
            return
        if path.startswith("/fonts/") or path.startswith("/icons/"):
            await self.app(scope, receive, self._with_header(send, FONT_CACHE_CONTROL))
            return
        if is_image_path(path):
            await self.app(scope, receive, self._with_header(send, IMAGE_CACHE_CONTROL))
            return
        if not cacheable_api_path(path):
            await self.app(scope, receive, send)
            return

        versions = ",".join(str(v) for v in database._db_versions.values())
        key = f"{versions}|{path}?{scope.get('query_string', b'').decode('latin-1')}"
        hit = self.cache.get(key)
        if hit is not None:
            status, headers, body = hit
            await send({"type": "http.response.start", "status": status,
                        "headers": headers + [(b"x-cache", b"HIT")]})
            await send({"type": "http.response.body", "body": body})
            return

        start: dict = {}
        chunks: list[bytes] = []

        async def capture(message: Message) -> None:
            if message["type"] == "http.response.start":
                start.update(message)
                return
            if message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
                if message.get("more_body"):
                    return
                status = start["status"]
                headers = [(k, v) for k, v in start.get("headers", [])
                           if k.lower() not in (b"cache-control", b"x-cache")]
                if status == 200:
                    headers.append((b"cache-control", API_CACHE_CONTROL.encode()))
                body = b"".join(chunks)
                if status == 200 and scope["method"] == "GET":
                    self.cache.put(key, (status, headers, body))
                await send({"type": "http.response.start", "status": status,
                            "headers": headers + [(b"x-cache", b"MISS")]})
                await send({"type": "http.response.body", "body": body})

        await self.app(scope, receive, capture)

    @staticmethod
    def _with_header(send: Send, value: str) -> Send:
        async def wrapped(message: Message) -> None:
            if message["type"] == "http.response.start" and message.get("status") == 200:
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                headers.append((b"cache-control", value.encode()))
                message = {**message, "headers": headers}
            await send(message)
        return wrapped
