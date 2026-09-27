import os
import tempfile
import unittest
from unittest.mock import patch

from backend import auth_db
from backend.routers.auth import (
    ForgotPasswordRequest,
    delete_account,
    forgot_password,
)
from backend.tests.test_security import make_user


class TestAccountDeletion(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.old_path = auth_db.AUTH_DB_PATH
        auth_db.AUTH_DB_PATH = os.path.join(self.tmpdir.name, "users.db")
        if getattr(auth_db._local, "auth_conn", None) is not None:
            auth_db._local.auth_conn.close()
        auth_db._local.auth_conn = None
        auth_db.init_auth_db()

    def tearDown(self):
        if getattr(auth_db._local, "auth_conn", None) is not None:
            auth_db._local.auth_conn.close()
        auth_db._local.auth_conn = None
        auth_db.AUTH_DB_PATH = self.old_path
        self.tmpdir.cleanup()

    def test_delete_account_removes_profile_sessions_and_usage(self):
        auth = make_user("review@example.com")
        db = auth_db.get_auth_db()
        db.execute(
            "INSERT INTO usage (user_id, feature) VALUES (?, ?)",
            (auth["id"], "ai_query"),
        )
        db.commit()

        result = delete_account(f"Bearer {auth['token']}")

        self.assertTrue(result["detail"].startswith("Account and associated data deleted"))
        self.assertEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM usage").fetchone()[0], 0)

    def test_reset_token_is_not_exposed_without_development_flag(self):
        make_user("reset@example.com")

        with (
            patch("backend.routers.auth._send_reset_email", return_value=False),
            patch("backend.routers.auth.EXPOSE_RESET_TOKEN", False),
        ):
            result = forgot_password(ForgotPasswordRequest(email="reset@example.com"))

        self.assertNotIn("reset_token", result)
        db = auth_db.get_auth_db()
        count = db.execute(
            "SELECT COUNT(*) FROM sessions WHERE token LIKE 'reset:%'"
        ).fetchone()[0]
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
