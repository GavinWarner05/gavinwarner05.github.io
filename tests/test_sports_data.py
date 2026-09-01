import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_sports_data import ValidationError, sanitize

ROOT = Path(__file__).resolve().parents[1]


class SportsDataTests(unittest.TestCase):
    def setUp(self):
        self.sample = json.loads((ROOT / "data/sports/sample.json").read_text(encoding="utf-8"))

    def test_sample_is_valid_and_favorite_is_data_driven(self):
        result = sanitize(self.sample)
        self.assertEqual(result["schema_version"], 1)
        self.assertEqual(result["favorites"], ["min"])
        self.assertEqual(len(result["games"]), 2)

    def test_unknown_fields_are_removed(self):
        raw = copy.deepcopy(self.sample)
        raw["internal_metadata"] = "private"
        raw["games"][0]["notion_record_id"] = "not-public"
        raw["games"][0]["home_team"]["internal_code"] = "private"
        result = sanitize(raw)
        self.assertNotIn("internal_metadata", result)
        self.assertNotIn("notion_record_id", result["games"][0])
        self.assertNotIn("internal_code", result["games"][0]["home_team"])

    def test_secret_like_fields_fail_closed(self):
        for key in ("notion_token", "apiSecret", "password", "authorization"):
            with self.subTest(key=key):
                raw = copy.deepcopy(self.sample)
                raw[key] = "do-not-publish"
                with self.assertRaises(ValidationError):
                    sanitize(raw)

    def test_notes_are_bounded_plain_text(self):
        raw = copy.deepcopy(self.sample)
        raw["games"][0]["notes"] = "x" * 1001
        with self.assertRaises(ValidationError):
            sanitize(raw)

    def test_duplicate_game_ids_fail(self):
        raw = copy.deepcopy(self.sample)
        raw["games"][1]["id"] = raw["games"][0]["id"]
        with self.assertRaises(ValidationError):
            sanitize(raw)

    def test_week_metadata_is_preserved(self):
        result = sanitize(self.sample)
        self.assertEqual(result["games"][0]["week"], 1)
        self.assertEqual(result["games"][0]["season_phase"], "Regular Season")

    def test_invalid_week_fails(self):
        raw = copy.deepcopy(self.sample)
        raw["games"][0]["week"] = 99
        with self.assertRaises(ValidationError):
            sanitize(raw)

    def test_output_contains_no_source_extras(self):
        result = sanitize(self.sample)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nfl.json"
            output.write_text(json.dumps(result), encoding="utf-8")
            reparsed = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(reparsed, result)


if __name__ == "__main__":
    unittest.main()
