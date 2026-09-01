import importlib
import os
import sys
import types
import unittest


class SyncMappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.modules.setdefault("requests", types.SimpleNamespace(HTTPError=Exception))
        sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda *_args, **_kwargs: None))
        cls.sync = importlib.import_module("scripts.sync")

    def test_team_payload_uses_stable_public_id(self):
        team = self.sync.team_payload("Minnesota Vikings")
        self.assertEqual(team["id"], "min")
        self.assertEqual(team["abbreviation"], "MIN")
        self.assertTrue(team["logo_url"].startswith("https://"))

    def test_nflverse_la_alias_maps_to_rams_not_falcons(self):
        self.assertEqual(self.sync.canonical_team("LA"), "Los Angeles Rams")
        self.assertNotEqual(self.sync.canonical_team("LA"), "Atlanta Falcons")

    def test_unknown_short_code_does_not_substring_match(self):
        self.assertEqual(self.sync.canonical_team("ZZ"), "ZZ")

    def test_supported_notion_property_values(self):
        page = {"properties": {
            "Favorite": {"type": "checkbox", "checkbox": True},
            "Jersey": {"type": "select", "select": {"name": "Purple"}},
            "Notes": {"type": "rich_text", "rich_text": [{"plain_text": "Public only"}]},
            "Team": {"type": "relation", "relation": [{"id": "page-id"}]},
        }}
        self.assertTrue(self.sync.prop_value(page, "Favorite"))
        self.assertEqual(self.sync.prop_value(page, "Jersey"), "Purple")
        self.assertEqual(self.sync.prop_value(page, "Notes"), "Public only")
        self.assertEqual(self.sync.prop_value(page, "Team"), ["page-id"])

    def test_missing_manual_property_is_safe(self):
        self.assertEqual(self.sync.prop_value({"properties": {}}, "Public Notes", ""), "")

    def test_database_with_one_source_resolves_automatically(self):
        original = self.sync.notion
        self.sync.notion = lambda *_args, **_kwargs: {"data_sources": [{"id": "resolved-source", "name": "Games"}]}
        try:
            self.assertEqual(self.sync.resolve_data_source("database-value", "", "games"), "resolved-source")
        finally:
            self.sync.notion = original

    def test_preferred_source_name_is_case_insensitive(self):
        original = self.sync.notion
        self.sync.notion = lambda *_args, **_kwargs: {"data_sources": [
            {"id": "wrong-source", "name": "Archive"},
            {"id": "right-source", "name": "Current Games"},
        ]}
        try:
            self.assertEqual(self.sync.resolve_data_source("database-value", "current games", "games"), "right-source")
        finally:
            self.sync.notion = original

    def test_multiple_sources_require_a_name(self):
        original = self.sync.notion
        self.sync.notion = lambda *_args, **_kwargs: {"data_sources": [
            {"id": "first-source", "name": "One"}, {"id": "second-source", "name": "Two"},
        ]}
        try:
            with self.assertRaises(RuntimeError):
                self.sync.resolve_data_source("database-value", "", "games")
        finally:
            self.sync.notion = original


if __name__ == "__main__":
    unittest.main()
