import copy
import json
import unittest
from pathlib import Path

from scripts.build_team_data import sanitize_injury_player, sanitize_player, sanitize_snapshot

ROOT = Path(__file__).resolve().parents[1]


class TeamDataTests(unittest.TestCase):
    def setUp(self):
        sports = json.loads((ROOT / "data/sports/sample.json").read_text(encoding="utf-8"))
        self.snapshot = {
            "schema_version": 1, "generated_at": sports["generated_at"], "season": 2026,
            "team": sports["games"][0]["home_team"], "games": [sports["games"][0]],
            "injuries": sports["games"][0]["injuries"],
            "injury_players": [{"id": "reserve-1", "name": "Reserve Player", "position": "LB", "headshot_url": "https://example.com/reserve.png", "private_note": "hidden"}],
            "players": [{"id": "player-1", "name": "Sample Quarterback", "position": "QB", "group": "Quarterbacks", "number": "8", "headshot_url": "https://example.com/player.png", "depth_position": "QB", "depth_slot": "QB", "depth_rank": 1, "depth_order": 1, "stats": {"games": 1, "passing_yards": 250, "private_metric": 99}, "weekly_stats": [{"week": 1, "opponent": "GB", "stats": {"passing_yards": 250, "private_metric": 99}}], "seasons": [{"season": 2026, "team": sports["games"][0]["home_team"], "stats": {"passing_yards": 250}, "weekly_stats": [{"week": 1, "opponent": "GB", "stats": {"passing_yards": 250}}]}, {"season": 2025, "team": sports["games"][0]["away_team"], "stats": {"passing_yards": 3000}, "weekly_stats": [{"week": 1, "opponent": "MIN", "stats": {"passing_yards": 300}}]}]}],
        }

    def test_team_snapshot_is_sanitized(self):
        clean = sanitize_snapshot(self.snapshot)
        self.assertEqual(clean["team"]["id"], "min")
        self.assertEqual(clean["players"][0]["stats"]["passing_yards"], 250)
        self.assertEqual(clean["players"][0]["depth_rank"], 1)
        self.assertEqual(clean["players"][0]["weekly_stats"][0]["stats"]["passing_yards"], 250)
        self.assertNotIn("private_metric", clean["players"][0]["weekly_stats"][0]["stats"])
        self.assertEqual([entry["season"] for entry in clean["players"][0]["seasons"]], [2026, 2025])
        self.assertEqual(clean["players"][0]["seasons"][1]["team"]["id"], "gb")
        self.assertNotIn("private_metric", clean["players"][0]["stats"])
        self.assertEqual(clean["injury_players"][0]["name"], "Reserve Player")
        self.assertNotIn("private_note", clean["injury_players"][0])

    def test_non_https_injury_player_headshot_is_rejected(self):
        player = copy.deepcopy(self.snapshot["injury_players"][0])
        player["headshot_url"] = "http://example.com/player.png"
        with self.assertRaises(ValueError): sanitize_injury_player(player, 0)

    def test_unrelated_game_is_rejected(self):
        raw = copy.deepcopy(self.snapshot)
        raw["team"] = copy.deepcopy(raw["team"])
        raw["team"]["id"] = "det"
        with self.assertRaises(ValueError): sanitize_snapshot(raw)

    def test_non_https_headshot_is_rejected(self):
        player = copy.deepcopy(self.snapshot["players"][0])
        player["headshot_url"] = "http://example.com/player.png"
        with self.assertRaises(ValueError): sanitize_player(player, 0)

    def test_duplicate_weekly_stats_are_rejected(self):
        player = copy.deepcopy(self.snapshot["players"][0])
        player["weekly_stats"].append(copy.deepcopy(player["weekly_stats"][0]))
        with self.assertRaises(ValueError): sanitize_player(player, 0)

    def test_negative_weekly_yardage_is_allowed(self):
        player = copy.deepcopy(self.snapshot["players"][0])
        player["weekly_stats"][0]["stats"]["rushing_yards"] = -3
        clean = sanitize_player(player, 0)
        self.assertEqual(clean["weekly_stats"][0]["stats"]["rushing_yards"], -3)

    def test_duplicate_seasons_are_rejected(self):
        player = copy.deepcopy(self.snapshot["players"][0])
        player["seasons"].append(copy.deepcopy(player["seasons"][0]))
        with self.assertRaises(ValueError): sanitize_player(player, 0)


if __name__ == "__main__": unittest.main()
