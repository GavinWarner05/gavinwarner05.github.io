import { buildPushPayload } from "@block65/webcrypto-web-push";

const EVENT_NAMES = new Set(["kickoff", "live", "final", "injury"]);
const TEAM_ID = /^[a-z0-9-]{2,24}$/;
const PLAYER_ID = /^[A-Za-z0-9_-]{2,80}$/;
const APP_HOME = "https://gavinwarner.digital/sports/";
const APP_ICON = `${APP_HOME}icons/icon-512.png`;
const APP_BADGE = `${APP_HOME}icons/icon-192.png`;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function cors(env, request) {
  const origin = request.headers.get("origin") || "";
  return origin === env.ALLOWED_ORIGIN ? {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  } : {};
}

function cleanList(value, pattern, maximum) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && pattern.test(item)))].slice(0, maximum);
}

function cleanEvents(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => EVENT_NAMES.has(item)))] : [];
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function body(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("JSON_REQUIRED");
  const value = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_BODY");
  return value;
}

function validSubscription(subscription) {
  try {
    const endpoint = new URL(subscription.endpoint);
    return endpoint.protocol === "https:" && endpoint.href.length <= 2048 &&
      typeof subscription.keys?.p256dh === "string" && subscription.keys.p256dh.length <= 256 &&
      typeof subscription.keys?.auth === "string" && subscription.keys.auth.length <= 128;
  } catch (_) { return false; }
}

async function saveSubscription(request, env) {
  const input = await body(request);
  if (!validSubscription(input.subscription) || typeof input.managementToken !== "string" || input.managementToken.length < 32 || input.managementToken.length > 256) {
    return json({ error: "Invalid subscription" }, 400, cors(env, request));
  }
  const id = await digest(input.subscription.endpoint);
  const tokenHash = await digest(input.managementToken);
  const existing = await env.DB.prepare("SELECT management_token_hash FROM subscriptions WHERE id = ?").bind(id).first();
  if (existing && existing.management_token_hash !== tokenHash) return json({ error: "Subscription ownership could not be verified" }, 403, cors(env, request));
  const now = new Date().toISOString();
  const teams = cleanList(input.preferences?.teams, TEAM_ID, 32);
  const players = cleanList(input.preferences?.players, PLAYER_ID, 64);
  const events = cleanEvents(input.preferences?.events);
  await env.DB.prepare(`INSERT INTO subscriptions
    (id,endpoint,p256dh,auth,management_token_hash,team_ids,player_ids,events,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,
      team_ids=excluded.team_ids,player_ids=excluded.player_ids,events=excluded.events,updated_at=excluded.updated_at`)
    .bind(id, input.subscription.endpoint, input.subscription.keys.p256dh, input.subscription.keys.auth, tokenHash,
      JSON.stringify(teams), JSON.stringify(players), JSON.stringify(events), now, now).run();
  return json({ subscribed: true, preferences: { teams, players, events } }, 200, cors(env, request));
}

async function deleteSubscription(request, env) {
  const input = await body(request);
  if (typeof input.endpoint !== "string" || typeof input.managementToken !== "string") return json({ error: "Invalid subscription" }, 400, cors(env, request));
  const id = await digest(input.endpoint);
  const tokenHash = await digest(input.managementToken);
  await env.DB.prepare("DELETE FROM subscriptions WHERE id = ? AND management_token_hash = ?").bind(id, tokenHash).run();
  return json({ subscribed: false }, 200, cors(env, request));
}

function parseJson(value, fallback = []) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; } catch (_) { return fallback; }
}

function vapid(env) {
  return { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
}

async function sendPush(row, notification, env) {
  const subscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
  const message = {
    web_push: 8030,
    notification: {
      title: notification.title,
      body: notification.body,
      navigate: notification.url,
      icon: APP_ICON,
      badge: APP_BADGE,
      tag: notification.tag,
      data: { url: notification.url },
      app_badge: notification.badge || 1,
      timestamp: Date.now(),
      renotify: true,
      actions: [{ action: "open", title: notification.action || "Open Sports Center" }]
    }
  };
  try {
    const payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: notification.ttl || 3600 } }, subscription, vapid(env));
    const response = await fetch(subscription.endpoint, payload);
    if (response.status === 404 || response.status === 410) await env.DB.prepare("DELETE FROM subscriptions WHERE id = ?").bind(row.id).run();
    return response.ok;
  } catch (_) { return false; }
}

function wants(row, eventName, teamIds, playerIds = []) {
  const events = parseJson(row.events);
  const teams = parseJson(row.team_ids);
  const players = parseJson(row.player_ids);
  return events.includes(eventName) && (teamIds.some((id) => teams.includes(id)) || playerIds.some((id) => players.includes(id)));
}

async function recipients(env, eventName, teamIds, playerIds = []) {
  const result = await env.DB.prepare("SELECT * FROM subscriptions").all();
  return (result.results || []).filter((row) => wants(row, eventName, teamIds, playerIds));
}

async function once(env, key, callback) {
  const existing = await env.DB.prepare("SELECT event_key FROM sent_events WHERE event_key = ?").bind(key).first();
  if (existing) return false;
  await callback();
  await env.DB.prepare("INSERT OR IGNORE INTO sent_events(event_key,sent_at) VALUES(?,?)").bind(key, new Date().toISOString()).run();
  return true;
}

function gameUrl(game) {
  return `https://gavinwarner.digital/sports/scores/?game=${encodeURIComponent(game.id)}`;
}

function gameTeams(game) { return [game.away_team.id, game.home_team.id]; }

function scoreLine(game) {
  const away = game.away_score ?? "–";
  const home = game.home_score ?? "–";
  return `${game.away_team.abbreviation} ${away} · ${game.home_team.abbreviation} ${home}`;
}

function details(...values) { return values.filter(Boolean).join(" • "); }

async function notify(env, eventName, teamIds, message, playerIds = []) {
  const rows = await recipients(env, eventName, teamIds, playerIds);
  await Promise.all(rows.map((row) => sendPush(row, message, env)));
  return rows.length;
}

function injuryMap(games) {
  const names = new Map();
  games.forEach((game) => {
    names.set(game.away_team.name, game.away_team.id);
    names.set(game.home_team.name, game.home_team.id);
  });
  const teams = new Map();
  games.forEach((game) => (game.injuries || []).forEach((injury) => {
    const id = names.get(injury.team);
    if (!id) return;
    const key = [injury.player, injury.status, injury.detail || ""].join("|");
    if (!teams.has(id)) teams.set(id, new Map());
    teams.get(id).set(key, { player: injury.player, status: injury.status, detail: injury.detail || "" });
  }));
  return teams;
}

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function injuryPlayerIds(env, teamId, injuries) {
  try {
    const response = await fetch(`${env.SPORTS_TEAM_DATA_BASE_URL}${encodeURIComponent(teamId)}.json`, { headers: { accept: "application/json" } });
    if (!response.ok) return [];
    const snapshot = await response.json();
    const wanted = new Set(injuries.map((item) => normalizedName(item.player)));
    const players = [...(snapshot.players || []), ...(snapshot.injury_players || [])];
    return [...new Set(players.filter((player) => wanted.has(normalizedName(player.name))).map((player) => player.id).filter(Boolean))];
  } catch (_) { return []; }
}

async function refresh(env) {
  const response = await fetch(env.SPORTS_DATA_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Sports snapshot returned ${response.status}`);
  const snapshot = await response.json();
  if (!Array.isArray(snapshot.games)) throw new Error("Sports snapshot has no games");
  const now = Date.now();
  for (const game of snapshot.games) {
    const previous = await env.DB.prepare("SELECT * FROM game_states WHERE game_id = ?").bind(game.id).first();
    const teams = gameTeams(game);
    const kickoff = new Date(game.kickoff).getTime();
    if (game.status === "scheduled" && kickoff >= now && kickoff - now <= 60 * 60 * 1000) {
      await once(env, `game:${game.id}:kickoff`, () => notify(env, "kickoff", teams, {
        title: `🏈 ${game.away_team.abbreviation} at ${game.home_team.abbreviation} starts soon`,
        body: details("Kickoff is less than an hour away", game.network, "Tap for matchup details"),
        action: "View matchup", url: gameUrl(game), tag: `kickoff-${game.id}`, ttl: 3600
      }));
    }
    if (previous && !["live", "halftime"].includes(previous.status) && ["live", "halftime"].includes(game.status)) {
      await once(env, `game:${game.id}:live`, () => notify(env, "live", teams, {
        title: `🔴 LIVE · ${game.away_team.abbreviation} at ${game.home_team.abbreviation}`,
        body: details(scoreLine(game), game.status_detail || "The game has started"),
        action: "Follow game", url: gameUrl(game), tag: `live-${game.id}`, ttl: 1800
      }));
    }
    if (previous && previous.status !== "final" && game.status === "final") {
      await once(env, `game:${game.id}:final`, () => notify(env, "final", teams, {
        title: `FINAL · ${scoreLine(game)}`,
        body: `${game.away_team.name} at ${game.home_team.name} • Tap for game details`,
        action: "View final", url: gameUrl(game), tag: `final-${game.id}`, ttl: 86400
      }));
    }
    await env.DB.prepare(`INSERT INTO game_states(game_id,status,away_score,home_score,kickoff,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(game_id) DO UPDATE SET status=excluded.status,away_score=excluded.away_score,home_score=excluded.home_score,kickoff=excluded.kickoff,updated_at=excluded.updated_at`)
      .bind(game.id, game.status, game.away_score, game.home_score, game.kickoff, new Date().toISOString()).run();
  }
  for (const [teamId, injuriesByKey] of injuryMap(snapshot.games)) {
    const injuries = [...injuriesByKey.values()].sort((a, b) => a.player.localeCompare(b.player));
    const fingerprint = await digest(JSON.stringify(injuries));
    const previous = await env.DB.prepare("SELECT fingerprint,injuries FROM injury_states WHERE team_id = ?").bind(teamId).first();
    if (previous && previous.fingerprint !== fingerprint) {
      const oldKeys = new Set(parseJson(previous.injuries).map((item) => [item.player, item.status, item.detail || ""].join("|")));
      const changed = injuries.filter((item) => !oldKeys.has([item.player, item.status, item.detail].join("|")));
      const first = changed[0];
      const playerIds = await injuryPlayerIds(env, teamId, changed);
      await notify(env, "injury", [teamId], {
        title: changed.length === 1 ? `Injury update · ${first.player}` : `${changed.length || "New"} injury updates`,
        body: first ? `${first.status}${first.detail ? ` • ${first.detail}` : ""}${changed.length > 1 ? ` • plus ${changed.length - 1} more` : ""}` : "The active injury report changed.",
        action: "View injury report",
        url: `https://gavinwarner.digital/sports/teams/${teamId}/#injuries`, tag: `injury-${teamId}-${fingerprint.slice(0, 12)}`, ttl: 21600
      }, playerIds);
    }
    await env.DB.prepare(`INSERT INTO injury_states(team_id,fingerprint,injuries,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(team_id) DO UPDATE SET fingerprint=excluded.fingerprint,injuries=excluded.injuries,updated_at=excluded.updated_at`)
      .bind(teamId, fingerprint, JSON.stringify(injuries), new Date().toISOString()).run();
  }
  await env.DB.prepare("DELETE FROM sent_events WHERE sent_at < datetime('now','-45 days')").run();
}

async function testNotification(request, env) {
  const input = await body(request);
  if (typeof input.endpoint !== "string" || typeof input.managementToken !== "string") return json({ error: "Invalid subscription" }, 400, cors(env, request));
  const id = await digest(input.endpoint);
  const tokenHash = await digest(input.managementToken);
  const row = await env.DB.prepare("SELECT * FROM subscriptions WHERE id = ? AND management_token_hash = ?").bind(id, tokenHash).first();
  if (!row) return json({ error: "Subscription not found" }, 404, cors(env, request));
  if (row.last_test_at && Date.now() - new Date(row.last_test_at).getTime() < 60000) return json({ error: "Please wait before sending another test" }, 429, cors(env, request));
  const ok = await sendPush(row, {
    title: "🏈 Sports Center alerts are ready",
    body: "Kickoff, live, final, and injury updates will appear here.",
    action: "Open Sports Center", url: APP_HOME, tag: "sports-test", ttl: 300
  }, env);
  await env.DB.prepare("UPDATE subscriptions SET last_test_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  return json({ sent: ok }, ok ? 200 : 502, cors(env, request));
}

async function handle(request, env) {
  const url = new URL(request.url);
  const headers = cors(env, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (url.pathname === "/v1/config" && request.method === "GET") return json({ enabled: true, publicKey: env.VAPID_PUBLIC_KEY, events: [...EVENT_NAMES] }, 200, headers);
  if (url.pathname === "/v1/subscriptions" && request.method === "PUT") return saveSubscription(request, env);
  if (url.pathname === "/v1/subscriptions" && request.method === "DELETE") return deleteSubscription(request, env);
  if (url.pathname === "/v1/test" && request.method === "POST") return testNotification(request, env);
  return json({ error: "Not found" }, 404, headers);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      const status = error?.message === "JSON_REQUIRED" || error?.message === "INVALID_BODY" ? 400 : 500;
      return json({ error: status === 400 ? "Invalid request" : "Request failed" }, status, cors(env, request));
    }
  },
  async scheduled(_controller, env, ctx) { ctx.waitUntil(refresh(env)); }
};
