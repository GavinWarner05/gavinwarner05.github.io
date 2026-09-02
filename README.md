# gavinwarner.github.io

Personal Hugo site and an unlisted NFL Sports Center at `/sports/`.

## Local development

Requirements:

- Git with submodules
- Hugo Extended 0.160.1
- Python 3.12 or newer

Initialize the theme and build a sanitized local sports snapshot:

```sh
git submodule update --init --recursive
python3 -m unittest discover -s tests -v
python3 scripts/build_sports_data.py \
  --input data/sports/sample.json \
  --output static/sports/data/nfl.json
hugo server --buildDrafts --disableFastRender --noHTTPCache
```

Open `http://localhost:1313/sports/` for the personalized Sports Center home. The complete week-by-week scoreboard is at `http://localhost:1313/sports/scores/`, and team schedules and rosters are under `/sports/teams/`. The sports section is deliberately absent from the main navigation, sitemap, and feeds. It also emits `noindex, nofollow`, and `robots.txt` discourages crawling. This is not authentication: anyone who knows or discovers the URL can open it.

Visitors can customize favorite teams from the Sports Center home. The selection is stored as team IDs in that browser's `localStorage`; it does not update Notion, leave the device, or synchronize across browsers. When no browser preference has been saved, the sanitized JSON favorites are used as defaults. Clearing favorites saves an intentionally empty preference.

Active-roster cards link to `/sports/player/?team={team-id}&id={player-id}`. Players can be favorited from that page; those selections are also stored only in the current browser and appear in the Sports Center's Favorite players section. Player pages show sanitized season totals and week-by-week nflverse statistics when available. The exporter includes the current and previous regular seasons for active players, and the season selector also updates historical team affiliation. Before a player records a regular-season appearance, the page displays a useful empty state instead of sample statistics.

Run a production check without rewriting the tracked `docs/` directory:

```sh
hugo --environment production --minify --destination /tmp/gavinwarner-site
```

## Sports data boundary

The browser reads only `static/sports/data/nfl.json`. It never calls Notion, nflverse, or Sleeper directly.

Team pages live at `/sports/teams/{team-id}/` and read a separate sanitized file from `static/sports/data/teams/{team-id}.json`. Player pages reuse the appropriate sanitized team snapshot rather than publishing a duplicate player dataset. The synchronization export writes temporary team sources beside `sports-source.json`; publish them locally with:

```sh
python scripts/build_team_data.py \
  --input-dir /tmp/sports-teams \
  --output-dir static/sports/data/teams
```

`scripts/build_sports_data.py` is the final publication boundary. It accepts normalized synchronization output, retains only the documented public fields, validates types and limits, rejects secret-like keys, and atomically creates the public JSON. The contract is documented by `data/sports/schema.json`; `data/sports/sample.json` is non-production fixture data.

`scripts/sync.py` updates the Notion tracker and then produces these normalized top-level fields:

- `generated_at`: timezone-aware ISO-8601 timestamp
- `display_timezone`: `America/Los_Angeles`
- `favorites`: team ID array, such as `["min"]`
- `games`: normalized schedule, score, team, jersey, injury, network, and public-note records

The exporter reads these manual Notion properties by default: `Favorite` on teams and `Away Jersey`, `Home Jersey`, and `Public Notes` on games. Their names can be changed through repository variables. Missing properties remain empty and do not break the export. Raw Notion responses are never copied to the public file.

Schedules and completed scores come from nflverse. Injuries prefer nflverse and fall back to Sleeper. The current nflverse schedule file does not provide a dependable live clock or quarter, so a five-minute deployment improves data freshness but does not yet provide true play-by-play state.

## GitHub Actions and secrets

`validate.yml` tests the mappings and sanitizer, generates fixture JSON, and builds Hugo for pushes and pull requests. `deploy-pages.yml` reads Notion, fetches nflverse data, sanitizes, builds, and deploys hourly by default and every five minutes during broad NFL game windows without rewriting the tracker. The windows are intentionally expressed in UTC to cover Thursday night, weekend, Sunday night, and Monday night games across daylight-saving changes. `sync-notion.yml` updates the Notion games and injuries hourly. Both production workflows can also be run manually.

Configure the repository before enabling production deployment:

1. Add `NOTION_TOKEN` under repository **Settings → Secrets and variables → Actions → Secrets**.
2. Add `NOTION_TEAMS_DATABASE_ID`, `NOTION_GAMES_DATABASE_ID`, and `NOTION_INJURIES_DATABASE_ID` under **Actions → Variables**. These are the IDs from the database URLs; the script resolves each database's queryable data source through Notion.
3. If a database contains more than one data source, add its exact name using `NOTION_TEAMS_DATA_SOURCE_NAME`, `NOTION_GAMES_DATA_SOURCE_NAME`, or `NOTION_INJURIES_DATA_SOURCE_NAME`.
4. Optionally add `NOTION_API_VERSION`; otherwise the script uses `2025-09-03`.
5. If the Notion property names differ, add `NOTION_FAVORITE_PROPERTY`, `NOTION_AWAY_JERSEY_PROPERTY`, `NOTION_HOME_JERSEY_PROPERTY`, and `NOTION_PUBLIC_NOTES_PROPERTY` as variables.
6. Confirm the Notion integration can read all three databases and update the games and injuries databases.
7. Configure GitHub Pages to use **GitHub Actions** as its source.
8. Manually run **Deploy GitHub Pages** once and review `/sports/` before relying on the schedule.
9. Never echo environment variables or enable shell tracing in the synchronization step.

If the required Notion secret or database ID variables are missing, the production workflows now emit a notice and skip their Notion-dependent steps instead of failing immediately.

Do not commit tokens, `.env` files, raw Notion exports, or generated source payloads. Local secrets should remain in an ignored environment file or shell environment; never paste their contents into issues, logs, or chat.
