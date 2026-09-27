import tempfile
import unittest
from pathlib import Path

from backend.main import resolve_static_file


class ResolveStaticFileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.dist = base / "frontend" / "dist"
        (self.dist / "assets").mkdir(parents=True)
        (self.dist / "favicon.ico").write_text("icon")
        (self.dist / "assets" / "app.js").write_text("js")
        (base / "secret.db").write_text("secret")

    def tearDown(self):
        self.tmp.cleanup()

    def test_serves_files_inside_build(self):
        self.assertEqual(resolve_static_file(self.dist, "favicon.ico").read_text(), "icon")
        self.assertEqual(resolve_static_file(self.dist, "assets/app.js").read_text(), "js")

    def test_rejects_path_traversal(self):
        for path in ["../secret.db", "../../secret.db", "assets/../../secret.db", "/etc/hostname"]:
            self.assertIsNone(resolve_static_file(self.dist, path), path)

    def test_missing_or_directory_falls_back(self):
        self.assertIsNone(resolve_static_file(self.dist, "dashboard"))
        self.assertIsNone(resolve_static_file(self.dist, "assets"))
        self.assertIsNone(resolve_static_file(self.dist, ""))


if __name__ == "__main__":
    unittest.main()
