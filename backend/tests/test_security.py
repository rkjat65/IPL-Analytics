import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import auth_db
from backend.database import query
from backend.routers.ai import validate_sql
from backend.routers.auth import (
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    _is_admin,
    forgot_password,
    get_current_user,
    google_login,
    login,
    register,
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


class AuthSecurityTest(unittest.TestCase):
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

    def _squat_admin(self):
        return register(RegisterRequest(name="Squatter", email=ADMIN, password="squatter-pass"))

    def test_unverified_password_signup_with_admin_email_is_not_admin(self):
        auth = self._squat_admin()
        user = get_current_user(f"Bearer {auth['token']}")
        self.assertFalse(_is_admin(user))

    def test_google_login_takes_over_squatted_account(self):
        squat = self._squat_admin()
        with patch("urllib.request.urlopen", return_value=_google_response(ADMIN)):
            auth = google_login(GoogleLoginRequest(credential="x"))

        self.assertTrue(_is_admin(get_current_user(f"Bearer {auth['token']}")))
        # Squatter's session and password no longer work.
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
        old = self._squat_admin()
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
    def test_validator_rejects_file_and_url_access(self):
        for sql in [
            "SELECT * FROM read_csv_auto('/etc/hostname')",
            "SELECT read_text('/etc/hostname')",
            "SELECT * FROM '/etc/hostname'",
            "SELECT * FROM glob('*')",
            "SET enable_external_access = true",
        ]:
            self.assertFalse(validate_sql(sql), sql)

    def test_validator_allows_normal_queries(self):
        self.assertTrue(
            validate_sql("SELECT season, COUNT(*) FROM matches WHERE venue = 'Wankhede' GROUP BY 1")
        )

    def test_database_connection_blocks_file_access(self):
        self.assertGreater(query("SELECT COUNT(*) AS c FROM matches")[0]["c"], 0)
        with self.assertRaises(Exception):
            query("SELECT * FROM read_csv_auto('/etc/hostname')")
        with self.assertRaises(Exception):
            query("SET enable_external_access = true")


if __name__ == "__main__":
    unittest.main()
