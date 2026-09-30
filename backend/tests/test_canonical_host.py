import os
import unittest
from unittest import mock

from backend.main import canonical_redirect


class CanonicalHostTest(unittest.TestCase):
    def test_inactive_without_a_canonical_origin(self):
        with mock.patch.dict(os.environ, {"CANONICAL_ORIGIN": ""}):
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/records", "", "GET"))

    def test_old_host_pages_move_with_path_and_query(self):
        with mock.patch.dict(os.environ, {"CANONICAL_ORIGIN": "https://crickrida.com"}):
            self.assertEqual(canonical_redirect("crickrida.rkjat.in", "/records", "tab=bowling&tournament=t20wc", "GET"),
                             "https://crickrida.com/records?tab=bowling&tournament=t20wc")
            self.assertEqual(canonical_redirect("Crickrida.RKJAT.in", "/", "", "HEAD"), "https://crickrida.com/")
            self.assertEqual(canonical_redirect("crickrida.rkjat.in", "/sitemap.xml", "", "GET"), "https://crickrida.com/sitemap.xml")

    def test_canonical_local_api_and_writes_are_served_in_place(self):
        with mock.patch.dict(os.environ, {"CANONICAL_ORIGIN": "https://crickrida.com/"}):
            self.assertIsNone(canonical_redirect("crickrida.com", "/records", "", "GET"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/api/records/summary", "", "GET"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/api/pulse/insight-card", "", "POST"))
            self.assertIsNone(canonical_redirect("127.0.0.1:8000", "/dashboard", "", "GET"))
            self.assertIsNone(canonical_redirect("localhost:5173", "/dashboard", "", "GET"))
            self.assertIsNone(canonical_redirect("crickrida.rkjat.in", "/login", "", "POST"))


if __name__ == "__main__":
    unittest.main()
