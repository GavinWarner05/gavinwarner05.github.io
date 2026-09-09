import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def injury_key(injury: dict) -> tuple[str, str]:
    normalize = lambda value: re.sub(r"[^a-z0-9]", "", value.casefold())
    return normalize(injury["team"]), normalize(injury["player"])


class InjuryConsistencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.league = json.loads((ROOT / "static/sports/data/nfl.json").read_text(encoding="utf-8"))
        cls.teams = {}
        for path in sorted((ROOT / "static/sports/data/teams").glob("*.json")):
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            cls.teams[snapshot["team"]["name"]] = snapshot

    def test_all_32_team_injury_lists_are_unique(self):
        self.assertEqual(len(self.teams), 32)
        for team_name, snapshot in self.teams.items():
            with self.subTest(team=team_name):
                keys = [injury_key(injury) for injury in snapshot["injuries"]]
                self.assertEqual(len(keys), len(set(keys)))

    def test_every_matchup_uses_the_clean_team_injury_lists(self):
        for game in self.league["games"]:
            expected = []
            for side in ("away_team", "home_team"):
                expected.extend(self.teams[game[side]["name"]]["injuries"])
            with self.subTest(game=game["id"]):
                self.assertEqual(
                    {injury_key(injury) for injury in game["injuries"]},
                    {injury_key(injury) for injury in expected},
                )
                self.assertEqual(len(game["injuries"]), len(expected))


if __name__ == "__main__":
    unittest.main()
