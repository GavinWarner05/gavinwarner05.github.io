import json
import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPORTS = ROOT / "static" / "sports"


class SportsPwaTests(unittest.TestCase):
    def test_manifest_is_scoped_to_sports(self):
        manifest = json.loads((SPORTS / "manifest.webmanifest").read_text())
        self.assertEqual(manifest["id"], "/sports/")
        self.assertEqual(manifest["start_url"], "/sports/")
        self.assertEqual(manifest["scope"], "/sports/")
        self.assertEqual(manifest["display"], "standalone")

    def test_required_png_icons_have_declared_dimensions(self):
        expected = {
            "icons/apple-touch-icon.png": (180, 180),
            "icons/icon-192.png": (192, 192),
            "icons/icon-512.png": (512, 512),
            "icons/icon-1024.png": (1024, 1024),
        }
        for relative_path, dimensions in expected.items():
            data = (SPORTS / relative_path).read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", data[16:24]), dimensions)

    def test_service_worker_is_limited_to_sports_requests(self):
        worker = (SPORTS / "service-worker.js").read_text()
        self.assertIn('url.pathname.startsWith("/sports/")', worker)
        self.assertIn('url.pathname.endsWith(".json")', worker)

    def test_service_worker_handles_push_and_notification_clicks(self):
        worker = (SPORTS / "service-worker.js").read_text()
        self.assertIn('addEventListener("push"', worker)
        self.assertIn('addEventListener("notificationclick"', worker)
        self.assertIn("showNotification", worker)

    def test_notification_config_is_public(self):
        config = json.loads((SPORTS / "data/notifications.json").read_text())
        self.assertEqual(set(config), {"enabled", "api_url"})
        self.assertIsInstance(config["enabled"], bool)
        self.assertTrue(config["api_url"].startswith("https://"))

    def test_notification_backend_has_required_storage_and_no_notion_access(self):
        worker_root = ROOT / "workers" / "sports-notifications"
        source = (worker_root / "src/index.js").read_text()
        migration = (worker_root / "migrations/0001_initial.sql").read_text()
        for table in ("subscriptions", "game_states", "injury_states", "sent_events"):
            self.assertIn("CREATE TABLE IF NOT EXISTS " + table, migration)
        self.assertIn('origin === env.ALLOWED_ORIGIN', source)
        self.assertNotIn("NOTION_TOKEN", source)
        self.assertNotIn("NOTION_", source)


if __name__ == "__main__":
    unittest.main()
