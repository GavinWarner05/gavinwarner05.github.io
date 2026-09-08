CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  management_token_hash TEXT NOT NULL,
  team_ids TEXT NOT NULL DEFAULT '[]',
  player_ids TEXT NOT NULL DEFAULT '[]',
  events TEXT NOT NULL DEFAULT '["kickoff","live","final","injury"]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_test_at TEXT
);

CREATE TABLE IF NOT EXISTS game_states (
  game_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  away_score INTEGER,
  home_score INTEGER,
  kickoff TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS injury_states (
  team_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  injuries TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sent_events (
  event_key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_updated_at ON subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS sent_events_sent_at ON sent_events(sent_at);
