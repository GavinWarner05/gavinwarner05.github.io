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
    from build_sports_data import find_forbidden_keys, iso_datetime, require, sanitize_game, sanitize_injury, sanitize_team
except ImportError:  # Imported as scripts.build_team_data during tests.
    from scripts.build_sports_data import find_forbidden_keys, iso_datetime, require, sanitize_game, sanitize_injury, sanitize_team

PLAYER_KEYS = ("id", "name", "position", "group", "number", "headshot_url", "height", "weight", "experience", "college", "depth_position", "depth_slot", "depth_rank", "depth_order", "stats", "weekly_stats", "seasons")
STAT_KEYS = {
    "games", "completions", "attempts", "passing_yards", "passing_tds", "interceptions", "carries",
    "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds",
    "tackles", "tackles_solo", "sacks", "def_interceptions", "forced_fumbles", "field_goals_made",
    "field_goals_attempted", "extra_points_made", "extra_points_attempted",
}
SIGNED_STAT_KEYS = {"passing_yards", "rushing_yards", "receiving_yards"}
GROUPS = {"Quarterbacks", "Running Backs", "Wide Receivers", "Tight Ends", "Offensive Line", "Defensive Line", "Linebackers", "Cornerbacks", "Safeties", "Specialists", "Other"}


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
    injuries = raw.get("injuries", [])
    require(isinstance(games, list) and isinstance(players, list) and isinstance(injuries, list), "team collections must be arrays")
    clean_games = [sanitize_game(game, index) for index, game in enumerate(games)]
    require(all(team["id"] in (game["home_team"]["id"], game["away_team"]["id"]) for game in clean_games), "team snapshot contains an unrelated game")
    clean_players = [sanitize_player(player, index) for index, player in enumerate(players)]
    ids = [player["id"] for player in clean_players]
    require(len(ids) == len(set(ids)), "player ids must be unique within a team")
    return {
        "schema_version": 1, "generated_at": iso_datetime(raw.get("generated_at"), "generated_at"),
        "season": season, "team": team, "games": clean_games,
        "injuries": [sanitize_injury(injury, f"injuries[{index}]") for index, injury in enumerate(injuries)],
        "players": clean_players,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    inputs = sorted(args.input_dir.glob("*.json"))
    require(len(inputs) == 32, "expected 32 team source files")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for source in inputs:
        clean = sanitize_snapshot(json.loads(source.read_text(encoding="utf-8")))
        require(source.stem == clean["team"]["id"], "team filename does not match team id")
        fd, temporary = tempfile.mkstemp(prefix=source.stem + "-", suffix=".json", dir=args.output_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle: json.dump(clean, handle, indent=2, ensure_ascii=False); handle.write("\n")
            os.replace(temporary, args.output_dir / source.name)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    print("Published 32 sanitized team snapshots")
    return 0


if __name__ == "__main__": raise SystemExit(main())
