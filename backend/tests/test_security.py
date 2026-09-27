import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException

from backend import auth_db
from backend.database import query
from backend.routers.auth import (
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    ResetPasswordRequest,
    _create_session,
    _is_admin,
    forgot_password,
    get_current_user,
    google_login,
    hash_password,
    login,
    me,
    require_admin,
    reset_password,
)

ADMIN = "admin@example.com"


def _google_response(email, verified="true", sub="google-123"):
    payload = {"sub": sub, "email": email, "email_verified": verified, "name": "Admin"}

    class _Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    return _Resp(json.dumps(payload).encode())


def make_user(email, password="test-password", verified=False):
    """Insert a password account directly (public registration is gone)."""
    db = auth_db.get_auth_db()
    user_id = str(uuid4())
    db.execute(
        """
        INSERT INTO users (id, email, name, password_hash, auth_provider, is_verified)
        VALUES (?, ?, ?, ?, 'email', ?)
        """,
        (user_id, email, "Test", hash_password(password), int(verified)),
    )
    db.commit()
    return {"id": user_id, "token": _create_session(user_id)}


class AuthTestCase(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.old_path = auth_db.AUTH_DB_PATH
        auth_db.AUTH_DB_PATH = os.path.join(self.tmpdir.name, "users.db")
        if getattr(auth_db._local, "auth_conn", None) is not None:
            auth_db._local.auth_conn.close()
        auth_db._local.auth_conn = None
        auth_db.init_auth_db()
        self.patches = [
            patch("backend.routers.auth.ADMIN_EMAIL", ADMIN),
            patch("backend.routers.auth.GOOGLE_CLIENT_ID", ""),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        if getattr(auth_db._local, "auth_conn", None) is not None:
            auth_db._local.auth_conn.close()
        auth_db._local.auth_conn = None
        auth_db.AUTH_DB_PATH = self.old_path
        self.tmpdir.cleanup()


class AdminOnlySignInTest(AuthTestCase):
    def test_non_admin_cannot_sign_in_with_password(self):
        make_user("fan@example.com", "fan-password", verified=True)
        with self.assertRaises(HTTPException) as ctx:
            login(LoginRequest(email="fan@example.com", password="fan-password"))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_non_admin_google_sign_in_creates_no_account(self):
        with patch("urllib.request.urlopen", return_value=_google_response("fan@example.com")):
            with self.assertRaises(HTTPException) as ctx:
                google_login(GoogleLoginRequest(credential="x"))
        self.assertEqual(ctx.exception.status_code, 403)
        count = auth_db.get_auth_db().execute("SELECT COUNT(*) FROM users").fetchone()[0]
        self.assertEqual(count, 0)

    def test_admin_google_sign_in_is_admin(self):
        with patch("urllib.request.urlopen", return_value=_google_response(ADMIN)):
            auth = google_login(GoogleLoginRequest(credential="x"))
        self.assertTrue(auth["user"]["is_admin"])
        self.assertTrue(me(f"Bearer {auth['token']}")["is_admin"])
        self.assertEqual(require_admin(f"Bearer {auth['token']}")["email"], ADMIN)

    def test_require_admin_rejects_anonymous_and_non_admin(self):
        fan = make_user("fan@example.com", verified=True)
        for header, status in [(None, 401), (f"Bearer {fan['token']}", 403)]:
            with self.assertRaises(HTTPException) as ctx:
                require_admin(header)
            self.assertEqual(ctx.exception.status_code, status)

    def test_forgot_password_ignores_non_admin(self):
        make_user("fan@example.com")
        with (
            patch("backend.routers.auth._send_reset_email") as send,
            patch("backend.routers.auth.EXPOSE_RESET_TOKEN", True),
        ):
            result = forgot_password(ForgotPasswordRequest(email="fan@example.com"))
        send.assert_not_called()
        self.assertNotIn("reset_token", result)


class AdminVerificationTest(AuthTestCase):
    def test_unverified_admin_email_is_not_admin(self):
        squat = make_user(ADMIN, "squatter-pass")
        user = get_current_user(f"Bearer {squat['token']}")
        self.assertFalse(_is_admin(user))
        self.assertFalse(user["is_admin"])

    def test_google_login_takes_over_squatted_account(self):
        squat = make_user(ADMIN, "squatter-pass")
        with patch("urllib.request.urlopen", return_value=_google_response(ADMIN)):
            auth = google_login(GoogleLoginRequest(credential="x"))

        self.assertTrue(_is_admin(get_current_user(f"Bearer {auth['token']}")))
        self.assertIsNone(get_current_user(f"Bearer {squat['token']}"))
        with self.assertRaises(HTTPException):
            login(LoginRequest(email=ADMIN, password="squatter-pass"))

    def test_google_login_rejects_unverified_email(self):
        with patch(
            "urllib.request.urlopen",
            return_value=_google_response(ADMIN, verified="false"),
        ):
            with self.assertRaises(HTTPException):
                google_login(GoogleLoginRequest(credential="x"))

    def test_password_reset_verifies_email_and_revokes_sessions(self):
        old = make_user(ADMIN, "squatter-pass")
        with (
            patch("backend.routers.auth._send_reset_email", return_value=False),
            patch("backend.routers.auth.EXPOSE_RESET_TOKEN", True),
        ):
            token = forgot_password(ForgotPasswordRequest(email=ADMIN))["reset_token"]
        reset_password(ResetPasswordRequest(token=token, password="new-password"))

        self.assertIsNone(get_current_user(f"Bearer {old['token']}"))
        auth = login(LoginRequest(email=ADMIN, password="new-password"))
        self.assertTrue(_is_admin(get_current_user(f"Bearer {auth['token']}")))


class SqlLockdownTest(unittest.TestCase):
    def test_database_connection_blocks_file_access(self):
        self.assertGreater(query("SELECT COUNT(*) AS c FROM matches")[0]["c"], 0)
        with self.assertRaises(Exception):
            query("SELECT * FROM read_csv_auto('/etc/hostname')")
        with self.assertRaises(Exception):
            query("SET enable_external_access = true")


if __name__ == "__main__":
    unittest.main()
