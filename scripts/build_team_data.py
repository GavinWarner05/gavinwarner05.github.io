#!/usr/bin/env python3
"""Validate per-team roster sources and publish allowlisted JSON files."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

try:
    from build_sports_data import find_forbidden_keys, injury_identity, iso_datetime, require, sanitize_game, sanitize_injury, sanitize_team
except ImportError:  # Imported as scripts.build_team_data during tests.
    from scripts.build_sports_data import find_forbidden_keys, injury_identity, iso_datetime, require, sanitize_game, sanitize_injury, sanitize_team

PLAYER_KEYS = ("id", "name", "position", "group", "number", "headshot_url", "height", "weight", "experience", "college", "depth_position", "depth_slot", "depth_rank", "depth_order", "stats", "weekly_stats", "seasons")
INJURY_PLAYER_KEYS = ("id", "name", "position", "headshot_url", "stats", "weekly_stats", "seasons")
STAT_KEYS = {
    "games", "completions", "attempts", "passing_yards", "passing_tds", "interceptions", "carries",
    "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds",
    "tackles", "tackles_solo", "sacks", "def_interceptions", "forced_fumbles", "def_tackles_solo",
    "def_tackle_assists", "def_tackles_for_loss", "def_sacks", "def_qb_hits", "def_pass_defended",
    "def_fumbles_forced", "def_tds", "def_safeties", "field_goals_made",
    "field_goals_attempted", "extra_points_made", "extra_points_attempted",
}
SIGNED_STAT_KEYS = {"passing_yards", "rushing_yards", "receiving_yards"}
GROUPS = {"Quarterbacks", "Running Backs", "Wide Receivers", "Tight Ends", "Offensive Line", "Defensive Line", "Linebackers", "Cornerbacks", "Safeties", "Specialists", "Other"}
LEADER_CATEGORIES = (
    ("passing_yards", "Passing yards", "YDS"),
    ("rushing_yards", "Rushing yards", "YDS"),
    ("receiving_yards", "Receiving yards", "YDS"),
    ("touchdowns", "Touchdowns", "TD"),
    ("tackles", "Tackles", "TKL"),
    ("sacks", "Sacks", "SACK"),
    ("def_interceptions", "Interceptions", "INT"),
    ("def_qb_hits", "QB hits", "HIT"),
)


def bounded(value: object, field: str, maximum: int, required: bool = False) -> str | None:
    if value is None and not required: return None
    require(isinstance(value, str), f"{field} must be a string")
    value = value.strip()
    require(not required or bool(value), f"{field} cannot be empty")
    require(len(value) <= maximum, f"{field} is too long")
    return value


def sanitize_stats(raw: object, path: str) -> dict:
    require(isinstance(raw, dict), f"{path} must be an object")
    clean = {}
    for key, value in raw.items():
        if key not in STAT_KEYS: continue
        require(type(value) in (int, float) and math.isfinite(value), f"{path}.{key} is invalid")
        require(key in SIGNED_STAT_KEYS or value >= 0, f"{path}.{key} is invalid")
        clean[key] = value
    return clean


def sanitize_weekly_stats(raw: object, path: str) -> list[dict]:
    require(isinstance(raw, list), f"{path} must be an array")
    clean = []
    seen_weeks: set[int] = set()
    for index, entry in enumerate(raw):
        weekly_path = f"{path}[{index}]"
        require(isinstance(entry, dict), f"{weekly_path} must be an object")
        week = entry.get("week")
        require(type(week) is int and 1 <= week <= 25, f"{weekly_path}.week is invalid")
        require(week not in seen_weeks, f"{path} weeks must be unique")
        seen_weeks.add(week)
        opponent = bounded(entry.get("opponent"), f"{weekly_path}.opponent", 10) or ""
        clean.append({"week": week, "opponent": opponent, "stats": sanitize_stats(entry.get("stats", {}), f"{weekly_path}.stats")})
    return sorted(clean, key=lambda entry: entry["week"])


def sanitize_player(raw: object, index: int) -> dict:
    path = f"players[{index}]"
    require(isinstance(raw, dict), f"{path} must be an object")
    out = {key: raw[key] for key in PLAYER_KEYS if key in raw}
    out["id"] = bounded(out.get("id"), f"{path}.id", 100, True)
    out["name"] = bounded(out.get("name"), f"{path}.name", 100, True)
    out["position"] = bounded(out.get("position"), f"{path}.position", 8, True)
    out["group"] = bounded(out.get("group"), f"{path}.group", 40, True)
    require(out["group"] in GROUPS, f"{path}.group is unsupported")
    for key, maximum in (("number", 8), ("height", 20), ("weight", 20), ("experience", 30), ("college", 100)):
        if key in out: out[key] = bounded(out[key], f"{path}.{key}", maximum)
    for key in ("depth_position", "depth_slot"):
        if key in out: out[key] = bounded(out[key], f"{path}.{key}", 30)
    for key in ("depth_rank", "depth_order"):
        if key in out:
            require(type(out[key]) is int and 0 <= out[key] <= 999, f"{path}.{key} is invalid")
    if "headshot_url" in out:
        out["headshot_url"] = bounded(out["headshot_url"], f"{path}.headshot_url", 500, True)
        require(urlparse(out["headshot_url"]).scheme == "https", f"{path}.headshot_url must use HTTPS")
    out["stats"] = sanitize_stats(out.get("stats", {}), f"{path}.stats")
    out["weekly_stats"] = sanitize_weekly_stats(out.get("weekly_stats", []), f"{path}.weekly_stats")
    seasons = out.get("seasons", [])
    require(isinstance(seasons, list) and len(seasons) <= 10, f"{path}.seasons must be an array of at most 10 seasons")
    out["seasons"] = []
    seen_seasons: set[int] = set()
    for season_index, entry in enumerate(seasons):
        season_path = f"{path}.seasons[{season_index}]"
        require(isinstance(entry, dict), f"{season_path} must be an object")
        season = entry.get("season")
        require(type(season) is int and 2000 <= season <= 2100 and season not in seen_seasons, f"{season_path}.season is invalid")
        seen_seasons.add(season)
        clean_season = {"season": season, "stats": sanitize_stats(entry.get("stats", {}), f"{season_path}.stats"), "weekly_stats": sanitize_weekly_stats(entry.get("weekly_stats", []), f"{season_path}.weekly_stats")}
        if "team" in entry: clean_season["team"] = sanitize_team(entry["team"], f"{season_path}.team")
        out["seasons"].append(clean_season)
    out["seasons"].sort(key=lambda entry: entry["season"], reverse=True)
    return out


def sanitize_injury_player(raw: object, index: int) -> dict:
    path = f"injury_players[{index}]"
    require(isinstance(raw, dict), f"{path} must be an object")
    out = {key: raw[key] for key in INJURY_PLAYER_KEYS if key in raw}
    out["id"] = bounded(out.get("id"), f"{path}.id", 100, True)
    out["name"] = bounded(out.get("name"), f"{path}.name", 100, True)
    out["position"] = bounded(out.get("position"), f"{path}.position", 8, True)
    if "headshot_url" in out:
        out["headshot_url"] = bounded(out["headshot_url"], f"{path}.headshot_url", 500, True)
        require(urlparse(out["headshot_url"]).scheme == "https", f"{path}.headshot_url must use HTTPS")
    out["stats"] = sanitize_stats(out.get("stats", {}), f"{path}.stats")
    out["weekly_stats"] = sanitize_weekly_stats(out.get("weekly_stats", []), f"{path}.weekly_stats")
    seasons = out.get("seasons", [])
    require(isinstance(seasons, list) and len(seasons) <= 10, f"{path}.seasons must be an array of at most 10 seasons")
    out["seasons"] = []
    seen_seasons: set[int] = set()
    for season_index, entry in enumerate(seasons):
        season_path = f"{path}.seasons[{season_index}]"
        require(isinstance(entry, dict), f"{season_path} must be an object")
        season = entry.get("season")
        require(type(season) is int and 2000 <= season <= 2100 and season not in seen_seasons, f"{season_path}.season is invalid")
        seen_seasons.add(season)
        clean_season = {"season": season, "stats": sanitize_stats(entry.get("stats", {}), f"{season_path}.stats"), "weekly_stats": sanitize_weekly_stats(entry.get("weekly_stats", []), f"{season_path}.weekly_stats")}
        if "team" in entry: clean_season["team"] = sanitize_team(entry["team"], f"{season_path}.team")
        out["seasons"].append(clean_season)
    out["seasons"].sort(key=lambda entry: entry["season"], reverse=True)
    return out


def sanitize_snapshot(raw: object) -> dict:
    require(isinstance(raw, dict), "team snapshot must be an object")
    forbidden = find_forbidden_keys(raw)
    require(not forbidden, "secret-like fields are forbidden")
    require(raw.get("schema_version") == 1, "schema_version must be 1")
    season = raw.get("season")
    require(type(season) is int and 2000 <= season <= 2100, "season is invalid")
    team = sanitize_team(raw.get("team"), "team")
    games = raw.get("games", [])
    players = raw.get("players", [])
    injury_players = raw.get("injury_players", [])
    injuries = raw.get("injuries", [])
    require(isinstance(games, list) and isinstance(players, list) and isinstance(injury_players, list) and isinstance(injuries, list), "team collections must be arrays")
    clean_games = [sanitize_game(game, index) for index, game in enumerate(games)]
    require(all(team["id"] in (game["home_team"]["id"], game["away_team"]["id"]) for game in clean_games), "team snapshot contains an unrelated game")
    seasons = raw.get("seasons", [{"season": season, "record": team.get("record", ""), "games": games}])
    require(isinstance(seasons, list) and 1 <= len(seasons) <= 10, "seasons must be an array of at most 10 seasons")
    clean_seasons = []
    seen_team_seasons: set[int] = set()
    for season_index, entry in enumerate(seasons):
        path = f"seasons[{season_index}]"
        require(isinstance(entry, dict), f"{path} must be an object")
        entry_season = entry.get("season")
        require(type(entry_season) is int and 2000 <= entry_season <= 2100 and entry_season not in seen_team_seasons, f"{path}.season is invalid")
        seen_team_seasons.add(entry_season)
        entry_games = entry.get("games", [])
        require(isinstance(entry_games, list), f"{path}.games must be an array")
        clean_entry_games = [sanitize_game(game, game_index) for game_index, game in enumerate(entry_games)]
        require(all(team["id"] in (game["home_team"]["id"], game["away_team"]["id"]) for game in clean_entry_games), f"{path} contains an unrelated game")
        game_ids = [game["id"] for game in clean_entry_games]
        require(len(game_ids) == len(set(game_ids)), f"{path} game ids must be unique")
        clean_seasons.append({
            "season": entry_season,
            "record": bounded(entry.get("record", ""), f"{path}.record", 20) or "",
            "games": clean_entry_games,
        })
    require(season in seen_team_seasons, "seasons must include the current season")
    clean_seasons.sort(key=lambda entry: entry["season"], reverse=True)
    current_season_games = next(entry["games"] for entry in clean_seasons if entry["season"] == season)
    require({game["id"] for game in current_season_games} == {game["id"] for game in clean_games}, "current season games do not match the compatibility schedule")
    clean_players = [sanitize_player(player, index) for index, player in enumerate(players)]
    ids = [player["id"] for player in clean_players]
    require(len(ids) == len(set(ids)), "player ids must be unique within a team")
    clean_injury_players = [sanitize_injury_player(player, index) for index, player in enumerate(injury_players)]
    injury_player_ids = [player["id"] for player in clean_injury_players]
    require(len(injury_player_ids) == len(set(injury_player_ids)), "injury player ids must be unique within a team")
    clean_injuries = [sanitize_injury(injury, f"injuries[{index}]") for index, injury in enumerate(injuries)]
    injury_ids = [injury_identity(injury) for injury in clean_injuries]
    require(len(injury_ids) == len(set(injury_ids)), "injuries contains duplicate players")
    return {
        "schema_version": 1, "generated_at": iso_datetime(raw.get("generated_at"), "generated_at"),
        "season": season, "team": team, "games": clean_games, "seasons": clean_seasons,
        "injuries": clean_injuries,
        "injury_players": clean_injury_players,
        "players": clean_players,
    }


def leader_value(stats: dict, key: str) -> int | float | None:
    if key in ("passing_yards", "rushing_yards", "receiving_yards"):
        return stats.get(key)
    if key == "touchdowns":
        values = (stats.get("rushing_tds"), stats.get("receiving_tds"))
        return None if all(value is None for value in values) else sum(value or 0 for value in values)
    if key == "tackles":
        values = (stats.get("def_tackles_solo"), stats.get("def_tackle_assists"))
        if any(value is not None for value in values): return sum(value or 0 for value in values)
        return stats.get("tackles", stats.get("tackles_solo"))
    if key == "sacks": return stats.get("def_sacks", stats.get("sacks"))
    if key in ("def_interceptions", "def_qb_hits"): return stats.get(key)
    return None


def build_player_index(snapshots: list[dict]) -> dict:
    require(bool(snapshots), "player index requires team snapshots")
    season = max(snapshot["season"] for snapshot in snapshots)
    teams = sorted((snapshot["team"] for snapshot in snapshots), key=lambda team: team["name"])
    chosen: dict[str, tuple[dict, dict]] = {}
    for snapshot in snapshots:
        seen: set[str] = set()
        for player in snapshot["players"] + snapshot["injury_players"]:
            if player["id"] in seen: continue
            seen.add(player["id"])
            current = next((entry for entry in player.get("seasons", []) if entry["season"] == season), None)
            if current is None and snapshot["season"] == season:
                current = {"stats": player.get("stats", {}), "weekly_stats": player.get("weekly_stats", [])}
            candidate = (snapshot, player)
            existing = chosen.get(player["id"])
            candidate_score = (max((week["week"] for week in (current or {}).get("weekly_stats", [])), default=0), len((current or {}).get("stats", {})))
            if existing:
                old_snapshot, old_player = existing
                old_current = next((entry for entry in old_player.get("seasons", []) if entry["season"] == season), None)
                if old_current is None and old_snapshot["season"] == season:
                    old_current = {"stats": old_player.get("stats", {}), "weekly_stats": old_player.get("weekly_stats", [])}
                old_score = (max((week["week"] for week in (old_current or {}).get("weekly_stats", [])), default=0), len((old_current or {}).get("stats", {})))
                if old_score >= candidate_score: continue
            chosen[player["id"]] = candidate

    players = []
    weekly: dict[int, list[tuple[dict, dict, dict]]] = {}
    for snapshot, player in chosen.values():
        entry = {"id": player["id"], "name": player["name"], "position": player.get("position", ""), "team_id": snapshot["team"]["id"]}
        for key in ("number", "headshot_url"):
            if player.get(key): entry[key] = player[key]
        players.append(entry)
        current = next((item for item in player.get("seasons", []) if item["season"] == season), None)
        weeks = current.get("weekly_stats", []) if current else player.get("weekly_stats", []) if snapshot["season"] == season else []
        for week in weeks: weekly.setdefault(week["week"], []).append((snapshot, player, week["stats"]))

    week_rows = []
    for week_number, performances in sorted(weekly.items()):
        categories = []
        for key, label, suffix in LEADER_CATEGORIES:
            leaders = []
            for snapshot, player, stats in performances:
                value = leader_value(stats, key)
                if value is None or value <= 0: continue
                leaders.append({"id": player["id"], "team_id": snapshot["team"]["id"], "name": player["name"], "position": player.get("position", ""), "value": value})
            leaders.sort(key=lambda entry: (-entry["value"], entry["name"], entry["team_id"]))
            if leaders: categories.append({"key": key, "label": label, "suffix": suffix, "leaders": leaders[:5]})
        if categories: week_rows.append({"week": week_number, "categories": categories})
    return {
        "schema_version": 1,
        "generated_at": max(snapshot["generated_at"] for snapshot in snapshots),
        "season": season,
        "teams": teams,
        "players": sorted(players, key=lambda entry: (entry["name"], entry["team_id"], entry["id"])),
        "weeks": week_rows,
    }


def write_json_atomic(path: Path, value: dict, prefix: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=prefix, suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle: json.dump(value, handle, indent=2, ensure_ascii=False); handle.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    inputs = sorted(args.input_dir.glob("*.json"))
    require(len(inputs) == 32, "expected 32 team source files")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    snapshots = []
    for source in inputs:
        clean = sanitize_snapshot(json.loads(source.read_text(encoding="utf-8")))
        require(source.stem == clean["team"]["id"], "team filename does not match team id")
        snapshots.append(clean)
        write_json_atomic(args.output_dir / source.name, clean, source.stem + "-")
    write_json_atomic(args.output_dir.parent / "players.json", build_player_index(snapshots), "players-")
    print("Published 32 sanitized team snapshots and player discovery index")
    return 0


if __name__ == "__main__": raise SystemExit(main())
