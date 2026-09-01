#!/usr/bin/env python3
"""Validate and publish an allowlisted NFL snapshot.

The upstream synchronizer should write normalized JSON matching data/sports/schema.json.
This final boundary strips unknown fields, checks values, and writes atomically.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

STATUSES = {"scheduled", "pregame", "live", "halftime", "final", "postponed", "cancelled"}
TEAM_KEYS = ("id", "name", "abbreviation", "record", "logo_url", "colors")
GAME_KEYS = ("id", "kickoff", "status", "status_detail", "week", "season_phase", "away_team", "home_team", "away_score", "home_score", "network", "venue", "away_jersey", "home_jersey", "injuries", "notes")
INJURY_KEYS = ("team", "player", "status", "detail")
FORBIDDEN_NAMES = re.compile(r"token|secret|password|authorization|cookie|notion_page|notion_url", re.I)


class ValidationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def clean_string(value: object, field: str, maximum: int, required: bool = False) -> str | None:
    if value is None and not required:
        return None
    require(isinstance(value, str), f"{field} must be a string")
    value = value.strip()
    require(not required or bool(value), f"{field} cannot be empty")
    require(len(value) <= maximum, f"{field} exceeds {maximum} characters")
    return value


def iso_datetime(value: object, field: str) -> str:
    value = clean_string(value, field, 40, True)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"{field} must be ISO-8601") from exc
    require(parsed.tzinfo is not None, f"{field} must include a timezone")
    return value


def sanitize_team(raw: object, path: str) -> dict:
    require(isinstance(raw, dict), f"{path} must be an object")
    out = {key: raw[key] for key in TEAM_KEYS if key in raw}
    out["id"] = clean_string(out.get("id"), f"{path}.id", 24, True)
    require(bool(re.fullmatch(r"[a-z0-9-]{2,24}", out["id"])), f"{path}.id is invalid")
    out["name"] = clean_string(out.get("name"), f"{path}.name", 60, True)
    out["abbreviation"] = clean_string(out.get("abbreviation"), f"{path}.abbreviation", 4, True)
    require(bool(re.fullmatch(r"[A-Z]{2,4}", out["abbreviation"])), f"{path}.abbreviation is invalid")
    if "record" in out: out["record"] = clean_string(out["record"], f"{path}.record", 20)
    if "logo_url" in out:
        out["logo_url"] = clean_string(out["logo_url"], f"{path}.logo_url", 500, True)
        require(urlparse(out["logo_url"]).scheme == "https", f"{path}.logo_url must use HTTPS")
    colors = out.get("colors")
    require(isinstance(colors, dict), f"{path}.colors must be an object")
    out["colors"] = {"primary": colors.get("primary"), "secondary": colors.get("secondary")}
    for key, color in out["colors"].items(): require(isinstance(color, str) and bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", color)), f"{path}.colors.{key} is invalid")
    return out


def sanitize_injury(raw: object, path: str) -> dict:
    require(isinstance(raw, dict), f"{path} must be an object")
    out = {key: raw[key] for key in INJURY_KEYS if key in raw}
    out["team"] = clean_string(out.get("team"), f"{path}.team", 60, True)
    out["player"] = clean_string(out.get("player"), f"{path}.player", 100, True)
    out["status"] = clean_string(out.get("status"), f"{path}.status", 40, True)
    if "detail" in out: out["detail"] = clean_string(out["detail"], f"{path}.detail", 160)
    return out


def sanitize_game(raw: object, index: int) -> dict:
    path = f"games[{index}]"
    require(isinstance(raw, dict), f"{path} must be an object")
    out = {key: raw[key] for key in GAME_KEYS if key in raw}
    out["id"] = clean_string(out.get("id"), f"{path}.id", 80, True)
    require(bool(re.fullmatch(r"[A-Za-z0-9_-]{4,80}", out["id"])), f"{path}.id is invalid")
    out["kickoff"] = iso_datetime(out.get("kickoff"), f"{path}.kickoff")
    out["status"] = clean_string(out.get("status"), f"{path}.status", 20, True)
    require(out["status"] in STATUSES, f"{path}.status is unsupported")
    if "week" in out:
        require(out["week"] is None or type(out["week"]) is int and 1 <= out["week"] <= 30, f"{path}.week is invalid")
    if "season_phase" in out: out["season_phase"] = clean_string(out["season_phase"], f"{path}.season_phase", 40)
    out["away_team"] = sanitize_team(out.get("away_team"), f"{path}.away_team")
    out["home_team"] = sanitize_team(out.get("home_team"), f"{path}.home_team")
    for score in ("away_score", "home_score"):
        value = out.get(score)
        require(value is None or type(value) is int and 0 <= value <= 200, f"{path}.{score} is invalid")
        out[score] = value
    for key, maximum in (("status_detail", 40), ("network", 80), ("venue", 120), ("away_jersey", 80), ("home_jersey", 80), ("notes", 1000)):
        if key in out: out[key] = clean_string(out[key], f"{path}.{key}", maximum)
    injuries = out.get("injuries", [])
    require(isinstance(injuries, list) and len(injuries) <= 100, f"{path}.injuries is invalid")
    out["injuries"] = [sanitize_injury(item, f"{path}.injuries[{i}]") for i, item in enumerate(injuries)]
    return out


def find_forbidden_keys(value: object, path: str = "root") -> list[str]:
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            if FORBIDDEN_NAMES.search(str(key)): found.append(f"{path}.{key}")
            found.extend(find_forbidden_keys(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value): found.extend(find_forbidden_keys(child, f"{path}[{index}]"))
    return found


def sanitize(raw: object) -> dict:
    require(isinstance(raw, dict), "snapshot must be an object")
    forbidden = find_forbidden_keys(raw)
    require(not forbidden, "forbidden secret-like fields found: " + ", ".join(forbidden))
    zone = raw.get("display_timezone", "America/Los_Angeles")
    try: ZoneInfo(zone)
    except (KeyError, TypeError) as exc: raise ValidationError("display_timezone is invalid") from exc
    require(zone == "America/Los_Angeles", "display_timezone must be America/Los_Angeles")
    favorites = raw.get("favorites", [])
    require(isinstance(favorites, list), "favorites must be an array")
    clean_favorites = []
    for value in favorites:
        team_id = clean_string(value, "favorites[]", 24, True)
        require(bool(re.fullmatch(r"[a-z0-9-]{2,24}", team_id)), "favorite team id is invalid")
        if team_id not in clean_favorites: clean_favorites.append(team_id)
    games = raw.get("games")
    require(isinstance(games, list), "games must be an array")
    output = {"schema_version": 1, "generated_at": iso_datetime(raw.get("generated_at"), "generated_at"), "display_timezone": zone, "favorites": clean_favorites, "games": [sanitize_game(game, i) for i, game in enumerate(games)]}
    ids = [game["id"] for game in output["games"]]
    require(len(ids) == len(set(ids)), "game ids must be unique")
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = json.loads(args.input.read_text(encoding="utf-8"))
    output = sanitize(raw)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="nfl-", suffix=".json", dir=args.output.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle: json.dump(output, handle, indent=2, ensure_ascii=False); handle.write("\n")
        os.replace(temp_name, args.output)
    finally:
        if os.path.exists(temp_name): os.unlink(temp_name)
    print(f"Published {len(output['games'])} sanitized games to {args.output}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
