#!/usr/bin/env python3
"""Sync NFL data into Notion and emit a normalized, public-safe snapshot."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
CONFIG_PATH = ROOT / "config.json"
FILE_CONFIG = json.loads(CONFIG_PATH.read_text()) if CONFIG_PATH.exists() else {}


def config_value(env_name: str, file_name: str, default: str = "") -> str:
    """Prefer Actions/local environment settings while supporting the old config file."""
    return str(os.getenv(env_name) or FILE_CONFIG.get(file_name) or default).strip()


CONFIG = {
    "notion_api_version": config_value("NOTION_API_VERSION", "notion_api_version", "2025-09-03"),
    "teams_data_source_id": config_value("NOTION_TEAMS_DATA_SOURCE_ID", "teams_data_source_id"),
    "games_data_source_id": config_value("NOTION_GAMES_DATA_SOURCE_ID", "games_data_source_id"),
    "injuries_data_source_id": config_value("NOTION_INJURIES_DATA_SOURCE_ID", "injuries_data_source_id"),
    "teams_database_id": config_value("NOTION_TEAMS_DATABASE_ID", "teams_database_id"),
    "games_database_id": config_value("NOTION_GAMES_DATABASE_ID", "games_database_id"),
    "injuries_database_id": config_value("NOTION_INJURIES_DATABASE_ID", "injuries_database_id"),
    "teams_data_source_name": config_value("NOTION_TEAMS_DATA_SOURCE_NAME", "teams_data_source_name"),
    "games_data_source_name": config_value("NOTION_GAMES_DATA_SOURCE_NAME", "games_data_source_name"),
    "injuries_data_source_name": config_value("NOTION_INJURIES_DATA_SOURCE_NAME", "injuries_data_source_name"),
}

NOTION_BASE = "https://api.notion.com/v1"
SCHEDULE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
INJURIES_URL = "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv"
SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"
ROSTER_URL = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv"
PLAYER_DIRECTORY_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
# Week-level rows let the static export build both weekly cards and season totals.
PLAYER_STATS_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"
DEPTH_CHART_URL = "https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{season}.csv"
NOTION_TOKEN = os.getenv("NOTION_TOKEN", "").strip()
SEASON = int(os.getenv("NFL_SEASON", str(datetime.now().year)))
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"
SYNC_INJURIES = os.getenv("SYNC_INJURIES", "true").lower() == "true"
EXPORT_ONLY = os.getenv("SPORTS_EXPORT_ONLY", "false").lower() == "true"
SPORTS_SOURCE_OUTPUT = os.getenv("SPORTS_SOURCE_OUTPUT", "").strip()
FAVORITE_PROPERTY = (os.getenv("NOTION_FAVORITE_PROPERTY") or "Favorite").strip()
AWAY_JERSEY_PROPERTY = (os.getenv("NOTION_AWAY_JERSEY_PROPERTY") or "Away Jersey").strip()
HOME_JERSEY_PROPERTY = (os.getenv("NOTION_HOME_JERSEY_PROPERTY") or "Home Jersey").strip()
PUBLIC_NOTES_PROPERTY = (os.getenv("NOTION_PUBLIC_NOTES_PROPERTY") or "Public Notes").strip()
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

TEAM_ALIASES = {
    "ari": "Arizona Cardinals", "atl": "Atlanta Falcons", "bal": "Baltimore Ravens", "buf": "Buffalo Bills",
    "car": "Carolina Panthers", "chi": "Chicago Bears", "cin": "Cincinnati Bengals", "cle": "Cleveland Browns",
    "dal": "Dallas Cowboys", "den": "Denver Broncos", "det": "Detroit Lions", "gb": "Green Bay Packers",
    "hou": "Houston Texans", "ind": "Indianapolis Colts", "jax": "Jacksonville Jaguars", "kc": "Kansas City Chiefs",
    "lv": "Las Vegas Raiders", "lac": "Los Angeles Chargers", "lar": "Los Angeles Rams", "mia": "Miami Dolphins",
    "min": "Minnesota Vikings", "ne": "New England Patriots", "no": "New Orleans Saints", "nyg": "New York Giants",
    "nyj": "New York Jets", "phi": "Philadelphia Eagles", "pit": "Pittsburgh Steelers", "sf": "San Francisco 49ers",
    "sea": "Seattle Seahawks", "tb": "Tampa Bay Buccaneers", "ten": "Tennessee Titans", "was": "Washington Commanders",
    "arizona": "Arizona Cardinals", "atlanta": "Atlanta Falcons",
    "baltimore": "Baltimore Ravens", "buffalo": "Buffalo Bills",
    "carolina": "Carolina Panthers", "chicago": "Chicago Bears",
    "cincinnati": "Cincinnati Bengals", "cleveland": "Cleveland Browns",
    "dallas": "Dallas Cowboys", "denver": "Denver Broncos",
    "detroit": "Detroit Lions", "green bay": "Green Bay Packers",
    "houston": "Houston Texans", "indianapolis": "Indianapolis Colts",
    "jacksonville": "Jacksonville Jaguars", "kansas city": "Kansas City Chiefs",
    "las vegas": "Las Vegas Raiders", "la chargers": "Los Angeles Chargers",
    "los angeles chargers": "Los Angeles Chargers", "la": "Los Angeles Rams", "la rams": "Los Angeles Rams",
    "los angeles rams": "Los Angeles Rams", "miami": "Miami Dolphins",
    "minnesota": "Minnesota Vikings", "new england": "New England Patriots",
    "new orleans": "New Orleans Saints", "ny giants": "New York Giants",
    "new york giants": "New York Giants", "ny jets": "New York Jets",
    "new york jets": "New York Jets", "philadelphia": "Philadelphia Eagles",
    "pittsburgh": "Pittsburgh Steelers", "san francisco": "San Francisco 49ers",
    "seattle": "Seattle Seahawks", "tampa bay": "Tampa Bay Buccaneers",
    "tennessee": "Tennessee Titans", "washington": "Washington Commanders",
}


def require_secrets() -> None:
    missing = [name for name, value in (("NOTION_TOKEN", NOTION_TOKEN),) if not value]
    missing.extend(
        name
        for name, data_source_key, database_key in (
            ("NOTION_TEAMS_DATABASE_ID", "teams_data_source_id", "teams_database_id"),
            ("NOTION_GAMES_DATABASE_ID", "games_data_source_id", "games_database_id"),
            ("NOTION_INJURIES_DATABASE_ID", "injuries_data_source_id", "injuries_database_id"),
        )
        if not CONFIG[data_source_key] and not CONFIG[database_key]
    )
    if missing:
        raise SystemExit(f"Missing required secret(s): {', '.join(missing)}")


def retry_delay(response: requests.Response | None, attempt: int) -> float:
    retry_after = response.headers.get("Retry-After", "") if response is not None else ""
    try:
        return min(max(float(retry_after), 0), 30) if retry_after else min(2 ** attempt, 20)
    except ValueError:
        return min(2 ** attempt, 20)


def request(method: str, url: str, *, headers: dict[str, str], **kwargs: Any) -> dict[str, Any]:
    last_error: requests.RequestException | None = None
    for attempt in range(6):
        response: requests.Response | None = None
        try:
            response = requests.request(method, url, headers=headers, timeout=30, **kwargs)
            if response.status_code != 429 and response.status_code < 500:
                response.raise_for_status()
                return response.json()
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_error = exc
        if attempt < 5:
            time.sleep(retry_delay(response, attempt))
    if response is not None:
        response.raise_for_status()
    if last_error is not None:
        raise last_error
    raise RuntimeError("Request failed after retries")


def notion(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": CONFIG["notion_api_version"],
        "Content-Type": "application/json",
    }
    return request(method, f"{NOTION_BASE}{path}", headers=headers, json=payload) if payload else request(method, f"{NOTION_BASE}{path}", headers=headers)


def resolve_data_source(database_id: str, preferred_name: str, label: str) -> str:
    """Resolve a database URL ID to its queryable Notion data source ID."""
    database = notion("GET", f"/databases/{database_id}")
    sources = database.get("data_sources", [])
    if not isinstance(sources, list) or not sources:
        raise RuntimeError(f"The {label} database contains no queryable data sources")
    if preferred_name:
        matches = [source for source in sources if str(source.get("name", "")).strip().casefold() == preferred_name.casefold()]
        if len(matches) != 1:
            raise RuntimeError(f"The configured {label} data source name did not match exactly one source")
        selected = matches[0]
    elif len(sources) == 1:
        selected = sources[0]
    else:
        raise RuntimeError(f"The {label} database has multiple data sources; configure NOTION_{label.upper()}_DATA_SOURCE_NAME")
    source_id = selected.get("id")
    if not isinstance(source_id, str) or not source_id:
        raise RuntimeError(f"The selected {label} data source has no usable identifier")
    return source_id


def resolve_data_sources() -> None:
    for label in ("teams", "games", "injuries"):
        if CONFIG[f"{label}_data_source_id"]:
            continue
        CONFIG[f"{label}_data_source_id"] = resolve_data_source(
            CONFIG[f"{label}_database_id"], CONFIG[f"{label}_data_source_name"], label
        )


def fetch_csv(url: str) -> list[dict[str, str]]:
    last_error: requests.RequestException | None = None
    for attempt in range(6):
        response: requests.Response | None = None
        try:
            response = requests.get(url, timeout=45)
            if response.status_code != 429 and response.status_code < 500:
                response.raise_for_status()
                return list(csv.DictReader(io.StringIO(response.text)))
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_error = exc
        if attempt < 5:
            time.sleep(retry_delay(response, attempt))
    if response is not None:
        response.raise_for_status()
    if last_error is not None:
        raise last_error
    raise RuntimeError("CSV download failed after retries")


def query_all(data_source_id: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    cursor = None
    while True:
        payload: dict[str, Any] = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        data = notion("POST", f"/data_sources/{data_source_id}/query", payload)
        results.extend(data.get("results", []))
        if not data.get("has_more"):
            return results
        cursor = data["next_cursor"]


def rich(value: Any) -> dict[str, Any]:
    text = "" if value is None else str(value)
    return {"rich_text": [{"type": "text", "text": {"content": text[:2000]}}]} if text else {"rich_text": []}


def title(value: str) -> dict[str, Any]:
    return {"title": [{"type": "text", "text": {"content": value[:2000]}}]}


def date(value: str | None) -> dict[str, Any]:
    return {"date": {"start": value}} if value else {"date": None}


def number(value: Any) -> dict[str, Any]:
    return {"number": value if isinstance(value, (int, float)) else None}


def relation(page_id: str | None) -> dict[str, Any]:
    return {"relation": [{"id": page_id}]} if page_id else {"relation": []}


def text_prop(page: dict[str, Any], name: str) -> str:
    prop = page.get("properties", {}).get(name, {})
    parts = prop.get("rich_text", []) or prop.get("title", [])
    return "".join(item.get("plain_text", "") for item in parts)


def canonical_team(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name.lower().replace("football team", "")).strip()
    if cleaned in TEAM_ALIASES:
        return TEAM_ALIASES[cleaned]
    for official in TEAM_ALIASES.values():
        if cleaned == official.lower():
            return official
    return name


def team_map() -> dict[str, str]:
    output: dict[str, str] = {}
    for page in query_all(CONFIG["teams_data_source_id"]):
        name = text_prop(page, "Team")
        output[name] = page["id"]
    return output


def existing_by_id(data_source_id: str, property_name: str) -> dict[str, str]:
    return {text_prop(page, property_name): page["id"] for page in query_all(data_source_id) if text_prop(page, property_name)}


def nested(obj: dict[str, Any], *paths: str, default: Any = None) -> Any:
    for path in paths:
        value: Any = obj
        for key in path.split("."):
            value = value.get(key) if isinstance(value, dict) else None
        if value is not None:
            return value
    return default


def game_status(raw: str) -> str:
    raw = raw.lower()
    if any(word in raw for word in ("final", "finished", "after overtime")):
        return "Done"
    if any(word in raw for word in ("live", "quarter", "halftime", "in progress")):
        return "In progress"
    return "Not started"


def phase(stage: str) -> str:
    value = stage.lower()
    if "preseason" in value or value == "pre": return "Preseason"
    if "wild" in value or value == "wc": return "Wild Card"
    if "division" in value or value == "div": return "Divisional"
    if "conference" in value or value == "con": return "Conference Championship"
    if "super bowl" in value or value == "sb": return "Super Bowl"
    return "Regular Season"


def week_number(value: Any) -> int | None:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else None


def upsert(data_source_id: str, page_id: str | None, properties: dict[str, Any], label: str) -> None:
    action = "update" if page_id else "create"
    print(f"{action}: {label}")
    if DRY_RUN:
        return
    if page_id:
        notion("PATCH", f"/pages/{page_id}", {"properties": properties})
    else:
        notion("POST", "/pages", {"parent": {"type": "data_source_id", "data_source_id": data_source_id}, "properties": properties})


def sync_games(teams: dict[str, str]) -> None:
    known = existing_by_id(CONFIG["games_data_source_id"], "External Game ID")
    games = [row for row in fetch_csv(SCHEDULE_URL) if str(row.get("season")) == str(SEASON)]
    print(f"nflverse returned {len(games)} games")
    for item in games:
        external_id = str(item.get("game_id", ""))
        if not external_id:
            continue
        away_name = canonical_team(str(item.get("away_team", "Away")))
        home_name = canonical_team(str(item.get("home_team", "Home")))
        away_raw, home_raw = item.get("away_score", ""), item.get("home_score", "")
        away_score = int(float(away_raw)) if away_raw not in ("", None) else None
        home_score = int(float(home_raw)) if home_raw not in ("", None) else None
        raw_status = "Final" if away_score is not None and home_score is not None else "Scheduled"
        kickoff = item.get("gameday")
        if kickoff and item.get("gametime"):
            local = datetime.fromisoformat(f"{kickoff}T{item['gametime']}:00").replace(tzinfo=ZoneInfo("America/New_York"))
            kickoff = local.isoformat()
        stage = str(item.get("game_type", "REG"))
        winner_id = None
        if game_status(raw_status) == "Done" and isinstance(away_score, (int, float)) and isinstance(home_score, (int, float)):
            winner_id = teams.get(away_name if away_score > home_score else home_name if home_score > away_score else "")
        props = {
            "Matchup": title(f"{away_name} at {home_name}"),
            "External Game ID": rich(external_id),
            "Week": number(week_number(item.get("week"))),
            "Kickoff": date(str(kickoff) if kickoff else None),
            "Season Phase": {"select": {"name": phase(stage)}},
            "Away Team": relation(teams.get(away_name)),
            "Home Team": relation(teams.get(home_name)),
            "Venue": rich(item.get("stadium")),
            "Game Status": {"status": {"name": game_status(raw_status)}},
            "Away Score": number(away_score),
            "Home Score": number(home_score),
            "Winner": relation(winner_id),
            "Last Synced": date(NOW),
        }
        upsert(CONFIG["games_data_source_id"], known.get(external_id), props, f"{away_name} at {home_name}")


def designation(raw: str) -> str:
    value = raw.lower()
    if "question" in value: return "Questionable"
    if "doubt" in value: return "Doubtful"
    if any(word in value for word in ("ir", "reserve", "pup")): return "IR/PUP"
    if any(word in value for word in ("clear", "active", "probable")): return "Cleared"
    return "Out"


def body_area(raw: str) -> str:
    value = raw.lower()
    mapping = [("concussion", "Head/Concussion"), ("head", "Head/Concussion"), ("shoulder", "Shoulder"),
               ("elbow", "Arm/Elbow"), ("arm", "Arm/Elbow"), ("hand", "Hand/Wrist"), ("wrist", "Hand/Wrist"),
               ("back", "Back"), ("rib", "Core/Ribs"), ("core", "Core/Ribs"), ("hip", "Hip/Groin"),
               ("groin", "Hip/Groin"), ("knee", "Knee"), ("ankle", "Ankle"), ("foot", "Foot/Toe"),
               ("toe", "Foot/Toe"), ("illness", "Illness")]
    return next((label for key, label in mapping if key in value), "Other")


def sync_injuries(teams: dict[str, str]) -> None:
    known = existing_by_id(CONFIG["injuries_data_source_id"], "External Injury ID")
    try:
        injuries = fetch_csv(INJURIES_URL.format(season=SEASON))
        source_name = "nflverse"
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 404:
            raise
        players = request("GET", SLEEPER_PLAYERS_URL, headers={})
        current_teams = {
            "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
            "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
            "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG",
            "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS",
        }
        injuries = [
            dict(value, player_id=key)
            for key, value in players.items()
            if str(value.get("team") or "").upper() in current_teams
            and str(value.get("status") or "").lower() == "active"
            and value.get("injury_status")
        ]
        source_name = "Sleeper"
    print(f"{source_name} returned {len(injuries)} injuries")
    for item in injuries:
        player_name = str(item.get("full_name") or item.get("player_name") or item.get("name") or "Unknown player")
        player_id = str(item.get("gsis_id") or item.get("player_id") or player_name)
        team_name = canonical_team(str(item.get("team") or ""))
        injury_text = str(item.get("report_primary_injury") or item.get("injury_body_part") or item.get("injury_notes") or "Injury")
        raw_state = str(item.get("report_status") or item.get("injury_status") or item.get("practice_status") or "Out")
        report_date = str(item.get("report_date") or item.get("date_modified") or NOW)
        week = str(item.get("week") or "current")
        external_id = str(item.get("id") or "")
        if not external_id:
            external_id = hashlib.sha1(f"{SEASON}|{week}|{player_id}|{injury_text}".encode()).hexdigest()[:20]
        raw_positions = item.get("fantasy_positions") or [""]
        pos = str(item.get("position") or raw_positions[0] or "").upper()
        allowed_positions = {"QB", "RB", "FB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P", "LS"}
        props: dict[str, Any] = {
            "Player / Injury": title(f"{player_name} — {injury_text}"),
            "Player": rich(player_name),
            "External Injury ID": rich(external_id),
            "Team": relation(teams.get(team_name)),
            "Injury": rich(injury_text),
            "Body Area": {"multi_select": [{"name": body_area(injury_text)}]},
            "Designation": {"select": {"name": designation(raw_state)}},
            "Active Concern": {"checkbox": designation(raw_state) != "Cleared"},
            "Last Updated": date(report_date),
            "Last Synced": date(NOW),
            "Source": {"url": "https://github.com/nflverse/nflverse-data" if source_name == "nflverse" else "https://docs.sleeper.com/"},
        }
        if pos in allowed_positions:
            props["Position"] = {"select": {"name": pos}}
        upsert(CONFIG["injuries_data_source_id"], known.get(external_id), props, f"{player_name} ({team_name})")


TEAM_STYLE = {
    "Arizona Cardinals": ("ari", "ARI", "#97233F", "#000000"), "Atlanta Falcons": ("atl", "ATL", "#A71930", "#000000"),
    "Baltimore Ravens": ("bal", "BAL", "#241773", "#000000"), "Buffalo Bills": ("buf", "BUF", "#00338D", "#C60C30"),
    "Carolina Panthers": ("car", "CAR", "#0085CA", "#101820"), "Chicago Bears": ("chi", "CHI", "#0B162A", "#C83803"),
    "Cincinnati Bengals": ("cin", "CIN", "#FB4F14", "#000000"), "Cleveland Browns": ("cle", "CLE", "#311D00", "#FF3C00"),
    "Dallas Cowboys": ("dal", "DAL", "#003594", "#041E42"), "Denver Broncos": ("den", "DEN", "#FB4F14", "#002244"),
    "Detroit Lions": ("det", "DET", "#0076B6", "#123B55"), "Green Bay Packers": ("gb", "GB", "#203731", "#FFB612"),
    "Houston Texans": ("hou", "HOU", "#03202F", "#A71930"), "Indianapolis Colts": ("ind", "IND", "#002C5F", "#A2AAAD"),
    "Jacksonville Jaguars": ("jax", "JAX", "#006778", "#101820"), "Kansas City Chiefs": ("kc", "KC", "#E31837", "#6B0F1A"),
    "Las Vegas Raiders": ("lv", "LV", "#000000", "#4B4B4B"), "Los Angeles Chargers": ("lac", "LAC", "#0080C6", "#FFC20E"),
    "Los Angeles Rams": ("lar", "LAR", "#003594", "#FFA300"), "Miami Dolphins": ("mia", "MIA", "#008E97", "#FC4C02"),
    "Minnesota Vikings": ("min", "MIN", "#4F2683", "#2C1646"), "New England Patriots": ("ne", "NE", "#002244", "#C60C30"),
    "New Orleans Saints": ("no", "NO", "#101820", "#D3BC8D"), "New York Giants": ("nyg", "NYG", "#0B2265", "#A71930"),
    "New York Jets": ("nyj", "NYJ", "#125740", "#000000"), "Philadelphia Eagles": ("phi", "PHI", "#004C54", "#A5ACAF"),
    "Pittsburgh Steelers": ("pit", "PIT", "#101820", "#FFB612"), "San Francisco 49ers": ("sf", "SF", "#AA0000", "#B3995D"),
    "Seattle Seahawks": ("sea", "SEA", "#002244", "#69BE28"), "Tampa Bay Buccaneers": ("tb", "TB", "#D50A0A", "#34302B"),
    "Tennessee Titans": ("ten", "TEN", "#0C2340", "#4B92DB"), "Washington Commanders": ("was", "WAS", "#5A1414", "#FFB612"),
}


def prop_value(page: dict[str, Any], name: str, default: Any = "") -> Any:
    """Read supported Notion property types without exposing raw page metadata."""
    prop = page.get("properties", {}).get(name, {})
    prop_type = prop.get("type")
    if prop_type == "checkbox": return bool(prop.get("checkbox"))
    if prop_type in ("rich_text", "title"): return "".join(item.get("plain_text", "") for item in prop.get(prop_type, []))
    if prop_type in ("select", "status"): return (prop.get(prop_type) or {}).get("name", default)
    if prop_type == "number": return prop.get("number")
    if prop_type == "date": return (prop.get("date") or {}).get("start", default)
    if prop_type == "relation": return [item.get("id") for item in prop.get("relation", []) if item.get("id")]
    if prop_type == "url": return prop.get("url") or default
    return default


def team_payload(name: str, record: str = "") -> dict[str, Any]:
    team_id, abbreviation, primary, secondary = TEAM_STYLE[name]
    payload: dict[str, Any] = {
        "id": team_id, "name": name, "abbreviation": abbreviation,
        "logo_url": f"https://a.espncdn.com/i/teamlogos/nfl/500/{team_id}.png",
        "colors": {"primary": primary, "secondary": secondary},
    }
    if record: payload["record"] = record
    return payload


def export_sports_source(path: Path) -> None:
    """Create normalized source JSON; build_sports_data.py remains the final gate."""
    team_pages = query_all(CONFIG["teams_data_source_id"])
    teams_by_page: dict[str, str] = {}
    favorites: list[str] = []
    for page in team_pages:
        name = canonical_team(text_prop(page, "Team"))
        if name not in TEAM_STYLE: continue
        teams_by_page[page["id"]] = name
        if prop_value(page, FAVORITE_PROPERTY, False): favorites.append(TEAM_STYLE[name][0])

    notion_games = {
        text_prop(page, "External Game ID"): page
        for page in query_all(CONFIG["games_data_source_id"])
        if text_prop(page, "External Game ID")
    }
    injuries_by_team: dict[str, list[dict[str, str]]] = {}
    for page in query_all(CONFIG["injuries_data_source_id"]):
        if not prop_value(page, "Active Concern", False): continue
        relations = prop_value(page, "Team", [])
        team_name = teams_by_page.get(relations[0]) if relations else None
        if not team_name: continue
        injury = {
            "team": team_name,
            "player": str(prop_value(page, "Player", "Unknown player")),
            "status": str(prop_value(page, "Designation", "Out")),
        }
        detail = str(prop_value(page, "Injury", ""))
        if detail: injury["detail"] = detail
        injuries_by_team.setdefault(team_name, []).append(injury)

    output_games: list[dict[str, Any]] = []
    rows = [row for row in fetch_csv(SCHEDULE_URL) if str(row.get("season")) == str(SEASON)]
    for row in rows:
        game_id = str(row.get("game_id") or "")
        away_name = canonical_team(str(row.get("away_team") or ""))
        home_name = canonical_team(str(row.get("home_team") or ""))
        if not game_id: continue
        if away_name not in TEAM_STYLE or home_name not in TEAM_STYLE:
            raise RuntimeError("The nflverse schedule contains an unsupported team code")
        kickoff_day, kickoff_time = row.get("gameday"), row.get("gametime")
        if not kickoff_day: continue
        local = datetime.fromisoformat(f"{kickoff_day}T{kickoff_time or '00:00'}:00").replace(tzinfo=ZoneInfo("America/New_York"))
        away_raw, home_raw = row.get("away_score"), row.get("home_score")
        away_score = int(float(away_raw)) if away_raw not in ("", None) else None
        home_score = int(float(home_raw)) if home_raw not in ("", None) else None
        notion_game = notion_games.get(game_id, {})
        game: dict[str, Any] = {
            "id": game_id, "kickoff": local.isoformat(),
            "status": "final" if away_score is not None and home_score is not None else "scheduled",
            "week": week_number(row.get("week")), "season_phase": phase(str(row.get("game_type") or "REG")),
            "away_team": team_payload(away_name), "home_team": team_payload(home_name),
            "away_score": away_score, "home_score": home_score,
            "venue": str(row.get("stadium") or ""),
            "injuries": injuries_by_team.get(away_name, []) + injuries_by_team.get(home_name, []),
        }
        for output_name, property_name in (("away_jersey", AWAY_JERSEY_PROPERTY), ("home_jersey", HOME_JERSEY_PROPERTY), ("notes", PUBLIC_NOTES_PROPERTY)):
            value = str(prop_value(notion_game, property_name, "")).strip()
            if value: game[output_name] = value
        output_games.append(game)

    payload = {"schema_version": 1, "generated_at": NOW, "display_timezone": "America/Los_Angeles", "favorites": sorted(set(favorites)), "games": output_games}
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)
    print(f"Exported {len(output_games)} games for public sanitization")
    export_team_sources(path.parent / "sports-teams", payload, injuries_by_team)


STAT_FIELDS = (
    "games", "completions", "attempts", "passing_yards", "passing_tds", "interceptions",
    "carries", "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards",
    "receiving_tds", "tackles", "tackles_solo", "sacks", "def_interceptions", "forced_fumbles",
    "field_goals_made", "field_goals_attempted", "extra_points_made", "extra_points_attempted",
)


def first_value(row: dict[str, Any], *names: str) -> str:
    return next((str(row.get(name)).strip() for name in names if row.get(name) not in (None, "")), "")


def numeric_value(value: Any) -> int | float | None:
    if value in (None, ""): return None
    try:
        number_value = float(value)
        if not math.isfinite(number_value): return None
        return int(number_value) if number_value.is_integer() else round(number_value, 2)
    except (TypeError, ValueError):
        return None


def position_group(position: str) -> str:
    position = position.upper()
    if position in {"QB"}: return "Quarterbacks"
    if position in {"RB", "FB"}: return "Running Backs"
    if position in {"WR"}: return "Wide Receivers"
    if position in {"TE"}: return "Tight Ends"
    if position in {"C", "G", "OG", "OT", "T", "OL"}: return "Offensive Line"
    if position in {"DE", "DT", "NT", "DL"}: return "Defensive Line"
    if position in {"LB", "ILB", "OLB"}: return "Linebackers"
    if position in {"CB"}: return "Cornerbacks"
    if position in {"S", "FS", "SS", "DB"}: return "Safeties"
    if position in {"K", "P", "LS"}: return "Specialists"
    return "Other"


def reserve_roster_status(status: str) -> bool:
    """Return true for players who still belong in roster/injury views."""
    value = str(status or "").strip().upper()
    return value in {"RES", "IR", "PUP", "NFI", "SUS", "SUSP", "SUSPENDED"}


def normalized_player_name(value: str) -> str:
    words = re.findall(r"[a-z0-9]+", str(value or "").lower())
    while words and words[-1] in {"jr", "sr", "ii", "iii", "iv", "v"}:
        words.pop()
    return "".join(words)


def player_name_parts(value: str) -> tuple[str, str]:
    words = re.findall(r"[a-z0-9]+", str(value or "").lower())
    while words and words[-1] in {"jr", "sr", "ii", "iii", "iv", "v"}:
        words.pop()
    return (words[0], words[-1]) if len(words) >= 2 else ("", words[-1] if words else "")


def directory_player_match(rows: list[dict[str, str]], name: str, team_abbreviation: str) -> dict[str, str] | None:
    key = normalized_player_name(name)
    exact = next((row for row in rows if normalized_player_name(first_value(row, "display_name", "football_name")) == key), None)
    if exact: return exact
    first, last = player_name_parts(name)
    candidates = []
    for row in rows:
        candidate_name = first_value(row, "display_name", "football_name")
        candidate_first, candidate_last = player_name_parts(candidate_name)
        same_team = first_value(row, "latest_team").upper() == team_abbreviation.upper()
        related_first = first and candidate_first and (first in candidate_first or candidate_first in first)
        if same_team and last == candidate_last and related_first:
            candidates.append(row)
    return candidates[0] if len(candidates) == 1 else None


def export_team_sources(directory: Path, sports_payload: dict[str, Any], injuries_by_team: dict[str, list[dict[str, str]]]) -> None:
    rosters = fetch_csv(ROSTER_URL.format(season=SEASON))
    try:
        previous_rosters = fetch_csv(ROSTER_URL.format(season=SEASON - 1))
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 404: raise
        previous_rosters = []
    try:
        player_directory = fetch_csv(PLAYER_DIRECTORY_URL)
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 404: raise
        player_directory = []
    stats_rows_by_season: dict[int, list[dict[str, str]]] = {}
    for stats_season in (SEASON, SEASON - 1):
        try:
            stats_rows_by_season[stats_season] = fetch_csv(PLAYER_STATS_URL.format(season=stats_season))
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code != 404: raise
            stats_rows_by_season[stats_season] = []
    try:
        depth_rows = fetch_csv(DEPTH_CHART_URL.format(season=SEASON))
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 404: raise
        depth_rows = []
    latest_depth_date: dict[str, str] = {}
    for row in depth_rows:
        team_name = canonical_team(first_value(row, "team", "club_code"))
        chart_date = first_value(row, "dt", "week")
        if team_name in TEAM_STYLE and chart_date > latest_depth_date.get(team_name, ""):
            latest_depth_date[team_name] = chart_date
    depth_by_player: dict[tuple[str, str], dict[str, Any]] = {}
    for row in depth_rows:
        team_name = canonical_team(first_value(row, "team", "club_code"))
        if team_name not in TEAM_STYLE or first_value(row, "dt", "week") != latest_depth_date.get(team_name): continue
        player_id = first_value(row, "gsis_id")
        rank = numeric_value(first_value(row, "pos_rank", "depth_team"))
        if not player_id or rank is None: continue
        entry = {
            "depth_rank": int(rank),
            "depth_position": first_value(row, "pos_abb", "depth_position", "position"),
            "depth_slot": first_value(row, "pos_slot", "formation"),
            "depth_order": numeric_value(first_value(row, "pos_id")) or 999,
        }
        key = (team_name, player_id)
        if key not in depth_by_player or entry["depth_rank"] < depth_by_player[key]["depth_rank"]:
            depth_by_player[key] = entry
    stats_by_player: dict[str, list[dict[str, str]]] = defaultdict(list)
    for stats_season, stats_rows in stats_rows_by_season.items():
        for row in stats_rows:
            player_id = first_value(row, "player_id", "gsis_id")
            if player_id:
                row["_sports_season"] = str(stats_season)
                stats_by_player[player_id].append(row)
    games_by_team: dict[str, list[dict[str, Any]]] = {name: [] for name in TEAM_STYLE}
    for game in sports_payload["games"]:
        games_by_team[game["away_team"]["name"]].append(game)
        games_by_team[game["home_team"]["name"]].append(game)
    players_by_team: dict[str, list[dict[str, Any]]] = {name: [] for name in TEAM_STYLE}
    injury_players_by_team: dict[str, list[dict[str, Any]]] = {name: [] for name in TEAM_STYLE}
    reserve_players_by_team: dict[str, list[dict[str, str]]] = {name: [] for name in TEAM_STYLE}
    for row in rosters:
        team_name = canonical_team(first_value(row, "team"))
        if team_name not in TEAM_STYLE: continue
        status = first_value(row, "status").upper()
        player_id = first_value(row, "gsis_id", "player_id", "nfl_id")
        name = first_value(row, "full_name", "player_name", "football_name")
        position = first_value(row, "position", "depth_chart_position").upper()
        if not player_id or not name or not position: continue
        if status and status not in {"ACT", "ACTIVE"}:
            injury_player = {"id": player_id, "name": name, "position": position}
            if headshot_url := first_value(row, "headshot_url"):
                injury_player["headshot_url"] = headshot_url
            injury_players_by_team[team_name].append(injury_player)
            if reserve_roster_status(status):
                reserve_players_by_team[team_name].append({"name": name, "status": status})
            continue
        player_stat_rows = stats_by_player.get(player_id, [])
        seasons: list[dict[str, Any]] = []
        for stats_season in (SEASON, SEASON - 1):
            season_rows = [stats_row for stats_row in player_stat_rows if first_value(stats_row, "_sports_season") == str(stats_season)]
            stats: dict[str, int | float] = {}
            weekly_stats: list[dict[str, Any]] = []
            for stats_row in season_rows:
                week = numeric_value(stats_row.get("week"))
                if week is None: continue
                week_values = {field: value for field in STAT_FIELDS if (value := numeric_value(stats_row.get(field))) is not None and value != 0}
                for field, value in week_values.items(): stats[field] = round(stats.get(field, 0) + value, 2)
                weekly_stats.append({"week": int(week), "opponent": first_value(stats_row, "opponent_team", "opponent"), "stats": week_values})
            affiliation = next((canonical_team(first_value(stats_row, "recent_team", "team", "team_abbr")) for stats_row in reversed(season_rows) if canonical_team(first_value(stats_row, "recent_team", "team", "team_abbr")) in TEAM_STYLE), team_name if stats_season == SEASON else "")
            if season_rows or stats_season == SEASON:
                season_payload: dict[str, Any] = {"season": stats_season, "stats": stats, "weekly_stats": sorted(weekly_stats, key=lambda item: item["week"])}
                if affiliation: season_payload["team"] = team_payload(affiliation)
                seasons.append(season_payload)
        current = next((entry for entry in seasons if entry["season"] == SEASON), {"stats": {}, "weekly_stats": []})
        player: dict[str, Any] = {
            "id": player_id, "name": name, "position": position, "group": position_group(position),
            "stats": current["stats"], "weekly_stats": current["weekly_stats"], "seasons": seasons,
        }
        if depth := depth_by_player.get((team_name, player_id)):
            player.update(depth)
        for output_name, candidates in {
            "number": ("jersey_number", "number"), "headshot_url": ("headshot_url",), "height": ("height",),
            "weight": ("weight",), "experience": ("years_exp", "experience"), "college": ("college", "college_name"),
        }.items():
            value = first_value(row, *candidates) or next((first_value(stats_row, *candidates) for stats_row in player_stat_rows if first_value(stats_row, *candidates)), "")
            if value: player[output_name] = value
        players_by_team[team_name].append(player)
    previous_by_name: dict[str, dict[str, str]] = {}
    for row in previous_rosters:
        name = first_value(row, "full_name", "player_name", "football_name")
        player_id = first_value(row, "gsis_id", "player_id", "nfl_id")
        position = first_value(row, "position", "depth_chart_position").upper()
        if name and player_id and position:
            previous_by_name.setdefault(normalized_player_name(name), row)
    for team_name in TEAM_STYLE:
        known_players = {
            normalized_player_name(player["name"]): player
            for player in injury_players_by_team[team_name] + players_by_team[team_name]
        }
        for injury in injuries_by_team.get(team_name, []):
            key = normalized_player_name(injury.get("player", ""))
            if not key: continue
            previous_row = previous_by_name.get(key)
            directory_match = directory_player_match(player_directory, injury.get("player", ""), TEAM_STYLE[team_name][1])
            row = previous_row or directory_match
            existing = known_players.get(key)
            if existing and existing.get("headshot_url"): continue
            if not row: continue
            headshot_url = first_value(row, "headshot_url", "headshot")
            if not headshot_url and directory_match:
                headshot_url = first_value(directory_match, "headshot")
            if not headshot_url and directory_match and (espn_id := first_value(directory_match, "espn_id")):
                headshot_url = f"https://a.espncdn.com/i/headshots/nfl/players/full/{espn_id}.png"
            if existing:
                if headshot_url: existing["headshot_url"] = headshot_url
                continue
            matched_id = first_value(row, "gsis_id", "player_id", "nfl_id")
            same_id = next((player for player in known_players.values() if player.get("id") == matched_id), None)
            if same_id:
                if headshot_url: same_id["headshot_url"] = headshot_url
                continue
            injury_player = {
                "id": matched_id,
                "name": first_value(row, "display_name", "full_name", "player_name", "football_name"),
                "position": first_value(row, "position", "depth_chart_position").upper(),
            }
            if headshot_url: injury_player["headshot_url"] = headshot_url
            injury_players_by_team[team_name].append(injury_player)
            known_players[key] = injury_player
        listed_injuries = {normalized_player_name(injury.get("player", "")) for injury in injuries_by_team.get(team_name, [])}
        for reserve in reserve_players_by_team[team_name]:
            if normalized_player_name(reserve["name"]) in listed_injuries: continue
            injuries_by_team.setdefault(team_name, []).append({
                "team": team_name,
                "player": reserve["name"],
                "status": "IR/PUP",
                "detail": "Reserve list",
            })
    directory.mkdir(parents=True, exist_ok=True)
    for team_name, (team_id, _abbr, _primary, _secondary) in TEAM_STYLE.items():
        team_games = sorted(games_by_team[team_name], key=lambda item: item["kickoff"])
        wins = losses = ties = 0
        for game in team_games:
            if game["status"] != "final": continue
            own = game["home_score"] if game["home_team"]["id"] == team_id else game["away_score"]
            other = game["away_score"] if game["home_team"]["id"] == team_id else game["home_score"]
            if own > other: wins += 1
            elif own < other: losses += 1
            else: ties += 1
        record = f"{wins}-{losses}" + (f"-{ties}" if ties else "")
        payload = {
            "schema_version": 1, "generated_at": NOW, "season": SEASON,
            "team": team_payload(team_name, record), "games": team_games,
            "injuries": injuries_by_team.get(team_name, []),
            "injury_players": sorted(injury_players_by_team[team_name], key=lambda item: item["name"]),
            "players": sorted(players_by_team[team_name], key=lambda item: (
                item["group"], item.get("depth_order", 999), item.get("depth_position", item["position"]),
                item.get("depth_rank", 999), item["name"],
            )),
        }
        output = directory / f"{team_id}.json"
        temporary = output.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temporary, output)
    print("Exported 32 team roster sources for public sanitization")


def main() -> None:
    require_secrets()
    resolve_data_sources()
    print(f"NFL season {SEASON}; dry_run={DRY_RUN}; export_only={EXPORT_ONLY}")
    teams = team_map()
    if len(teams) < 32:
        raise RuntimeError(f"Expected 32 Notion teams, found {len(teams)}")
    if not EXPORT_ONLY:
        sync_games(teams)
        if SYNC_INJURIES:
            sync_injuries(teams)
    if SPORTS_SOURCE_OUTPUT:
        export_sports_source(Path(SPORTS_SOURCE_OUTPUT))
    print("Sync complete")


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        code = "unknown"
        if exc.response is not None:
            try:
                parsed = exc.response.json()
                candidate = parsed.get("code") if isinstance(parsed, dict) else None
                if isinstance(candidate, str) and re.fullmatch(r"[a-z_]+", candidate):
                    code = candidate
            except (ValueError, TypeError):
                pass
        print(f"Notion or data-source request failed (status={status}, code={code})", file=sys.stderr)
        raise SystemExit(1)
    except Exception as exc:
        print(f"Sync failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
