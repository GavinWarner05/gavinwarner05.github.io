(function () {
  "use strict";

  const app = document.querySelector("[data-sports-home]");
  if (!app) return;

  const els = {
    updated: app.querySelector("[data-home-updated]"),
    hero: app.querySelector("[data-home-hero]"),
    notice: app.querySelector("[data-home-notice]"),
    weekSection: app.querySelector("[data-week-section]"),
    weekHeading: app.querySelector("[data-week-heading]"),
    weekGames: app.querySelector("[data-week-games]"),
    favoritesSection: app.querySelector("[data-home-favorites-section]"),
    favorites: app.querySelector("[data-home-favorites]"),
    favoritesCount: app.querySelector("[data-home-favorites-count]"),
    aroundSection: app.querySelector("[data-around-section]"),
    aroundHeading: app.querySelector("[data-around-heading]"),
    around: app.querySelector("[data-around-league]"),
    playerFavoritesSection: app.querySelector("[data-player-favorites-section]"),
    playerFavorites: app.querySelector("[data-player-favorites]"),
    playerFavoritesCount: app.querySelector("[data-player-favorites-count]"),
    teamsSection: app.querySelector("[data-teams-section]"),
    teams: app.querySelector("[data-team-grid]"),
    favoritesDialog: document.querySelector("[data-favorites-dialog]"),
    favoritesForm: document.querySelector("[data-favorites-form]"),
    favoritesOptions: document.querySelector("[data-favorites-options]")
  };
  const favoritesStorageKey = "sports-center:favorite-teams:v1";
  const playerFavoritesStorageKey = "sports-center:favorite-players:v1";
  const state = { data: null, teams: null };

  function optimizedHeadshot(url, width) {
    const source = String(url || "");
    if (source.includes("static.www.nfl.com/image/upload/")) {
      return source.replace(/\/image\/upload\/(?:f_auto,q_auto\/)?/, "/image/upload/f_auto,q_auto,c_limit,w_" + width + "/");
    }
    if (source.includes("a.espncdn.com/i/headshots/")) return source + (source.includes("?") ? "&" : "?") + "w=" + width;
    return source;
  }
  const rivalryLogos = {
    hou: "/images/sports/logos/texans-rivalry.png",
    ind: "/images/sports/logos/colts-rivalry.png",
    ten: "/images/sports/logos/titans-rivalry.png"
  };
  const jerseyVariants = {
    chi: { "rivalry series": ["#0B162A", "#C83803", false] },
    det: { "rivalry series": ["#0076B6", "#111111", false] },
    gb: { "rivalry series": ["#294936", "#E8DFC8", true] },
    hou: { "rivalry series": ["#F7F5EF", "#69C9E8", true] },
    ind: { "rivalry series": ["#292C31", "#003A70", false] },
    jax: { "rivalry series": ["#F7F5EF", "#007A8B", true] },
    min: {
      "winter warrior white/purple": ["#FFFFFF", "#4F2683", true],
      "rivalry series": ["#1E1A34", "#AF925D", false]
    },
    tb: {
      "classic": ["#F47B20", "#F2DFC7", true],
      "throwback": ["#F47B20", "#F2DFC7", true]
    },
    ten: { "rivalry series": ["#4B92DB", "#0C2340", false] }
  };
  const teamDefaultGradients = {
    gb: ["#203731", "#FFB612", false, 70],
    ind: ["#002C5F", "#A2AAAD", false, 78],
    lar: ["#003594", "#FFA300", false, 72]
  };

  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }

  function variant(team, jersey) {
    return jerseyVariants[team.id] && jerseyVariants[team.id][String(jersey || "").toLowerCase()];
  }

  function logoUrl(team, jersey) {
    return variant(team, jersey) && rivalryLogos[team.id] ? rivalryLogos[team.id] : team.logo_url;
  }

  function logo(team, jersey, className) {
    const image = document.createElement("img");
    image.className = className || "sports-home-team-logo";
    if (team.id === "hou" && variant(team, jersey)) image.classList.add("texans-rivalry-logo");
    image.src = logoUrl(team, jersey);
    image.alt = team.name + " logo";
    image.width = 96;
    image.height = 96;
    image.loading = "lazy";
    image.addEventListener("error", function () {
      image.replaceWith(node("span", team.abbreviation, (className || "sports-home-team-logo") + " image-fallback"));
    }, { once: true });
    return image;
  }

  function jerseyFor(game, team) {
    return team.id === game.home_team.id ? game.home_jersey : game.away_jersey;
  }

  function teamGradient(team, jersey) {
    const exact = variant(team, jersey);
    return exact || teamDefaultGradients[team.id] || [team.colors.primary, team.colors.secondary, false];
  }

  function status(game, zone, longForm) {
    if (game.status === "live" || game.status === "halftime") return game.status_detail || (game.status === "halftime" ? "Halftime" : "Live now");
    if (game.status === "final") return "Final";
    return new Intl.DateTimeFormat("en-US", longForm
      ? { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone }
      : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone }
    ).format(new Date(game.kickoff));
  }

  function opponent(game, teamId) {
    return game.home_team.id === teamId ? game.away_team : game.home_team;
  }

  function favoriteFocus(games, favoriteIds) {
    const favoriteGames = games.filter((game) => favoriteIds.has(game.home_team.id) || favoriteIds.has(game.away_team.id));
    const live = favoriteGames.find((game) => game.status === "live" || game.status === "halftime");
    if (live) return live;
    const upcoming = favoriteGames.filter((game) => game.status === "scheduled" && new Date(game.kickoff) >= new Date()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    if (upcoming.length) return upcoming[0];
    return favoriteGames.filter((game) => game.status === "final").sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))[0] || favoriteGames[0];
  }

  function leagueFocus(games) {
    const live = games.find((game) => game.status === "live" || game.status === "halftime");
    if (live) return live;
    const upcoming = games.filter((game) => game.status === "scheduled" && new Date(game.kickoff) >= new Date()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    if (upcoming.length) return upcoming.find((game) => game.network) || upcoming[0];
    return games.filter((game) => game.status === "final").sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))[0] || games[0];
  }

  function countdown(game) {
    const milliseconds = new Date(game.kickoff) - new Date();
    if (milliseconds <= 0 || game.status !== "scheduled") return null;
    const hours = Math.floor(milliseconds / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return days + " day" + (days === 1 ? "" : "s") + " away";
    if (hours > 0) return hours + " hour" + (hours === 1 ? "" : "s") + " away";
    return Math.max(1, Math.floor(milliseconds / 60000)) + " minutes away";
  }

  function renderHero(data) {
    const favoriteIds = new Set(data.favorites || []);
    const personalized = favoriteIds.size > 0;
    const game = personalized ? favoriteFocus(data.games, favoriteIds) : leagueFocus(data.games);
    if (!game) {
      const empty = document.createElement("div");
      empty.className = "sports-home-empty-hero";
      empty.append(node("p", "Your NFL, your way", "sports-home-hero-eyebrow"), node("h2", "Choose a team to build your game-day home."), node("p", "Favorites stay on this browser and can be changed anytime.", "sports-home-hero-time"));
      const button = node("button", "Choose favorite teams", "sports-home-primary-link");
      button.type = "button";
      button.addEventListener("click", openFavorites);
      empty.append(button);
      els.hero.style.setProperty("--home-hero-gradient", "linear-gradient(125deg,#24304a,#111827)");
      delete els.hero.dataset.lightGradient;
      els.hero.replaceChildren(empty);
      return;
    }
    const featuredTeam = personalized ? (favoriteIds.has(game.home_team.id) ? game.home_team : game.away_team) : game.home_team;
    const otherTeam = opponent(game, featuredTeam.id);
    const featuredJersey = jerseyFor(game, featuredTeam);
    const gradient = teamGradient(featuredTeam, featuredJersey);
    els.hero.style.setProperty("--home-hero-gradient", gradient[3]
      ? "linear-gradient(125deg," + gradient[0] + " 0%," + gradient[0] + " " + gradient[3] + "%," + gradient[1] + " 100%)"
      : "linear-gradient(125deg," + gradient[0] + "," + gradient[1] + ")");
    if (gradient[2]) els.hero.dataset.lightGradient = "true";
    else delete els.hero.dataset.lightGradient;

    const copy = document.createElement("div");
    copy.className = "sports-home-hero-copy";
    const live = game.status === "live" || game.status === "halftime";
    const eyebrowLabel = personalized
      ? (live ? "● Live · Favorite team" : game.status === "final" ? "Latest favorite result" : "Up next · Favorite team")
      : (live ? "● Live · Around the league" : game.status === "final" ? "Latest NFL final" : "This week in the NFL");
    const eyebrow = node("p", eyebrowLabel, "sports-home-hero-eyebrow");
    if (live) eyebrow.dataset.live = "true";
    const title = node("h2", personalized
      ? featuredTeam.name + " " + (game.home_team.id === featuredTeam.id ? "host" : "visit") + " " + otherTeam.name
      : game.away_team.name + " at " + game.home_team.name);
    const time = node("p", status(game, data.display_timezone, true), "sports-home-hero-time");
    const timer = countdown(game);
    if (timer) time.append(node("span", " · " + timer));
    const score = node("p", game.away_score == null ? "—  ·  —" : game.away_score + "  ·  " + game.home_score, "sports-home-hero-score");
    const details = document.createElement("div");
    details.className = "sports-home-hero-details";
    if (!personalized) details.append(node("span", (game.season_phase || "Season") + (game.week == null ? "" : " · Week " + game.week)));
    if (featuredJersey) details.append(node("span", featuredJersey));
    if (game.network) details.append(node("span", game.network));
    if ((game.injuries || []).length) details.append(node("span", (game.injuries || []).length + " injury notes"));
    const actions = document.createElement("div");
    actions.className = "sports-home-hero-actions";
    const primaryLink = node("a", personalized ? "Open " + featuredTeam.name : "View scoreboard", "sports-home-primary-link");
    primaryLink.href = personalized ? app.dataset.teamBaseUrl + featuredTeam.id + "/" : app.dataset.scoresUrl;
    if (personalized) {
      const scoresLink = node("a", "View scoreboard", "sports-home-secondary-link");
      scoresLink.href = app.dataset.scoresUrl;
      actions.append(primaryLink, scoresLink);
    } else {
      const favoriteButton = node("button", "Choose a favorite", "sports-home-secondary-link");
      favoriteButton.type = "button";
      favoriteButton.addEventListener("click", openFavorites);
      actions.append(primaryLink, favoriteButton);
    }
    copy.append(eyebrow, title, time);
    if (live || game.status === "final") copy.append(score);
    copy.append(details, actions);

    const marks = document.createElement("div");
    marks.className = "sports-home-hero-logos";
    const away = document.createElement("div");
    away.append(logo(game.away_team, game.away_jersey), node("strong", game.away_team.abbreviation));
    const versus = node("span", game.away_score == null ? "VS" : game.away_score + "–" + game.home_score, "sports-home-versus");
    const home = document.createElement("div");
    home.append(logo(game.home_team, game.home_jersey), node("strong", game.home_team.abbreviation));
    marks.append(away, versus, home);
    els.hero.replaceChildren(copy, marks);
  }

  function compactGame(game, data) {
    const link = document.createElement("a");
    link.className = "sports-home-game";
    link.href = app.dataset.scoresUrl;
    link.setAttribute("aria-label", game.away_team.name + " at " + game.home_team.name + ", " + status(game, data.display_timezone, false));
    const top = document.createElement("div");
    top.className = "sports-home-game-top";
    top.append(node("span", status(game, data.display_timezone, false)), node("span", game.network || "NFL"));
    const teams = document.createElement("div");
    teams.className = "sports-home-game-teams";
    [[game.away_team, game.away_jersey, game.away_score], [game.home_team, game.home_jersey, game.home_score]].forEach((entry) => {
      const row = document.createElement("div");
      row.append(logo(entry[0], entry[1], "sports-home-mini-logo"), node("strong", entry[0].name), node("b", entry[2] == null ? "—" : entry[2]));
      teams.append(row);
    });
    link.append(top, teams);
    return link;
  }

  function weekKey(game) {
    return (game.season_phase || "Season") + "|" + (game.week == null ? "" : game.week);
  }

  function renderWeek(data) {
    const ordered = data.games.slice().sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const anchor = ordered.find((game) => (game.status === "live" || game.status === "halftime")) || ordered.find((game) => game.status === "scheduled" && new Date(game.kickoff) >= new Date()) || ordered[ordered.length - 1];
    if (!anchor) return;
    const favoriteIds = new Set(data.favorites || []);
    const games = ordered.filter((game) => weekKey(game) === weekKey(anchor)).sort((a, b) => {
      const aFavorite = favoriteIds.has(a.home_team.id) || favoriteIds.has(a.away_team.id);
      const bFavorite = favoriteIds.has(b.home_team.id) || favoriteIds.has(b.away_team.id);
      return Number(bFavorite) - Number(aFavorite) || new Date(a.kickoff) - new Date(b.kickoff);
    }).slice(0, 3);
    els.weekHeading.textContent = (anchor.season_phase || "Season") + (anchor.week == null ? "" : " · Week " + anchor.week);
    els.weekGames.replaceChildren(...games.map((game) => compactGame(game, data)));
    els.weekSection.hidden = games.length === 0;
  }

  function recordFor(teamId, games) {
    let wins = 0; let losses = 0; let ties = 0;
    games.filter((game) => game.status === "final" && (game.home_team.id === teamId || game.away_team.id === teamId)).forEach((game) => {
      const own = game.home_team.id === teamId ? game.home_score : game.away_score;
      const other = game.home_team.id === teamId ? game.away_score : game.home_score;
      if (own > other) wins += 1;
      else if (own < other) losses += 1;
      else ties += 1;
    });
    return wins + "–" + losses + (ties ? "–" + ties : "");
  }

  function renderFavorites(data, teams) {
    const cards = (data.favorites || []).map((teamId) => {
      const team = teams.get(teamId);
      if (!team) return null;
      const games = data.games.filter((game) => game.home_team.id === teamId || game.away_team.id === teamId).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      const next = games.find((game) => game.status === "scheduled" && new Date(game.kickoff) >= new Date());
      const last = games.filter((game) => game.status === "final").slice(-1)[0];
      const card = document.createElement("a");
      card.className = "sports-favorite-card";
      card.href = app.dataset.teamBaseUrl + teamId + "/";
      card.style.setProperty("--favorite-color", team.colors.primary);
      card.append(logo(team, null, "sports-favorite-logo"));
      const copy = document.createElement("div");
      copy.append(node("p", recordFor(teamId, games), "sports-favorite-record"), node("h3", team.name));
      if (next) copy.append(node("p", "Next: " + opponent(next, teamId).abbreviation + " · " + status(next, data.display_timezone, false)));
      else if (last) copy.append(node("p", "Latest: " + (last.home_team.id === teamId ? last.home_score : last.away_score) + "–" + (last.home_team.id === teamId ? last.away_score : last.home_score) + " vs " + opponent(last, teamId).abbreviation));
      card.append(copy, node("span", "→", "sports-favorite-arrow"));
      return card;
    }).filter(Boolean);
    els.favorites.replaceChildren(...cards);
    els.favoritesCount.textContent = cards.length + " team" + (cards.length === 1 ? "" : "s");
    els.favoritesSection.hidden = cards.length === 0;
  }

  function renderAround(data) {
    const live = data.games.filter((game) => game.status === "live" || game.status === "halftime");
    const finals = data.games.filter((game) => game.status === "final").sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
    const upcoming = data.games.filter((game) => game.status === "scheduled" && new Date(game.kickoff) >= new Date()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const games = (live.length ? live : finals.length ? finals : upcoming).slice(0, 3);
    els.aroundHeading.textContent = live.length ? "Live now" : finals.length ? "Latest finals" : "Coming up";
    els.around.replaceChildren(...games.map((game) => compactGame(game, data)));
    els.aroundSection.hidden = games.length === 0;
  }

  function storedPlayerFavorites() {
    try {
      const value = JSON.parse(window.localStorage.getItem(playerFavoritesStorageKey) || "[]");
      return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === "string" && typeof entry.teamId === "string").slice(0, 8) : [];
    } catch (_) { return []; }
  }

  function playerStatSummary(player) {
    const latest = (player.weekly_stats || []).slice().sort((a, b) => b.week - a.week)[0];
    const values = latest ? latest.stats || {} : player.stats || {};
    const order = player.position === "QB" ? ["passing_yards", "passing_tds", "interceptions"]
      : ["rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds", "receptions", "targets", "tackles", "sacks", "def_interceptions", "field_goals_made"];
    const labels = { passing_yards: "pass yds", passing_tds: "pass TD", interceptions: "INT", rushing_yards: "rush yds", rushing_tds: "rush TD", receiving_yards: "rec yds", receiving_tds: "rec TD", receptions: "REC", targets: "TGT", tackles: "TKL", sacks: "SACK", def_interceptions: "INT", field_goals_made: "FG" };
    const summary = order.filter((key) => values[key] != null && values[key] !== 0).slice(0, 3).map((key) => values[key] + " " + labels[key]);
    return { label: latest ? "Week " + latest.week + (latest.opponent ? " vs. " + latest.opponent : "") : "Season snapshot", summary: summary.join(" · ") || "Stats available after the first appearance" };
  }

  function renderPlayerFavorites() {
    const saved = storedPlayerFavorites();
    if (!saved.length) { els.playerFavoritesSection.hidden = true; return Promise.resolve(); }
    return Promise.all(saved.map((favorite) => fetch(app.dataset.teamDataBaseUrl + encodeURIComponent(favorite.teamId) + ".json", { headers: { Accept: "application/json" }, cache: "no-cache" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data ? { data: data, player: data.players.find((player) => player.id === favorite.id) } : null)
      .catch(() => null))).then((results) => {
      const cards = results.filter((entry) => entry && entry.player).map((entry) => {
        const player = entry.player; const team = entry.data.team; const latest = playerStatSummary(player);
        const link = document.createElement("a"); link.className = "sports-player-favorite-card";
        link.href = app.dataset.playerUrl + "?view=player-v2&team=" + encodeURIComponent(team.id) + "&id=" + encodeURIComponent(player.id);
        const teamColors = teamGradient(team, null);
        const cardGradient = teamColors[3]
          ? "linear-gradient(135deg," + teamColors[0] + " 0%," + teamColors[0] + " " + teamColors[3] + "%," + teamColors[1] + " 100%)"
          : "linear-gradient(135deg," + teamColors[0] + "," + teamColors[1] + ")";
        link.style.setProperty("--player-card-gradient", cardGradient);
        const portrait = document.createElement("div"); portrait.className = "sports-player-favorite-photo";
        if (player.headshot_url) {
          const headshot = document.createElement("img"); headshot.className = "sports-player-favorite-image"; headshot.src = optimizedHeadshot(player.headshot_url, 400); headshot.alt = player.name + " headshot"; headshot.loading = "lazy"; headshot.decoding = "async";
          headshot.addEventListener("error", function () { headshot.replaceWith(node("span", player.position)); }, { once: true }); portrait.append(headshot);
        } else portrait.append(node("span", player.position));
        const copy = document.createElement("div");
        const kicker = document.createElement("div"); kicker.className = "sports-player-favorite-kicker";
        kicker.append(node("span", team.abbreviation + " · " + player.position, "sports-player-favorite-meta"), logo(team, null, "sports-player-favorite-team-logo"));
        const stats = document.createElement("div"); stats.className = "sports-player-favorite-stats";
        latest.summary.split(" · ").forEach((value) => stats.append(node("span", value)));
        copy.append(kicker, node("h3", player.name), node("p", latest.label, "sports-player-favorite-week"), stats);
        link.append(portrait, copy, node("span", "→", "sports-player-favorite-arrow")); return link;
      });
      els.playerFavorites.replaceChildren(...cards);
      els.playerFavoritesCount.textContent = cards.length + " player" + (cards.length === 1 ? "" : "s");
      els.playerFavoritesSection.hidden = cards.length === 0;
    });
  }

  function renderTeams(teams) {
    const links = Array.from(teams.values()).sort((a, b) => a.name.localeCompare(b.name)).map((team) => {
      const link = document.createElement("a");
      link.href = app.dataset.teamBaseUrl + team.id + "/";
      link.title = team.name;
      link.setAttribute("aria-label", "View " + team.name);
      const gradient = teamGradient(team, null);
      const background = gradient[3]
        ? "linear-gradient(135deg," + gradient[0] + " 0%," + gradient[0] + " " + gradient[3] + "%," + gradient[1] + " 100%)"
        : "linear-gradient(135deg," + gradient[0] + "," + gradient[1] + ")";
      link.style.setProperty("--explore-team-gradient", background);
      link.append(logo(team, null, "sports-team-grid-logo"), node("span", team.abbreviation));
      return link;
    });
    els.teams.replaceChildren(...links);
    els.teamsSection.hidden = links.length === 0;
  }

  function storedFavorites(defaults, teams) {
    try {
      const saved = window.localStorage.getItem(favoritesStorageKey);
      if (saved === null) return defaults;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return defaults;
      return parsed.filter((id, index) => typeof id === "string" && teams.has(id) && parsed.indexOf(id) === index);
    } catch (_) {
      return defaults;
    }
  }

  function saveFavorites(ids) {
    try { window.localStorage.setItem(favoritesStorageKey, JSON.stringify(ids)); }
    catch (_) { /* The dashboard still works when browser storage is unavailable. */ }
    state.data.favorites = ids;
    renderHero(state.data);
    renderWeek(state.data);
    renderFavorites(state.data, state.teams);
  }

  function renderFavoriteOptions() {
    const selected = new Set(state.data.favorites || []);
    const options = Array.from(state.teams.values()).sort((a, b) => a.name.localeCompare(b.name)).map((team) => {
      const label = document.createElement("label");
      label.className = "sports-favorite-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "favorite-team";
      input.value = team.id;
      input.checked = selected.has(team.id);
      label.append(input, logo(team, null, "sports-favorite-option-logo"), node("span", team.name));
      return label;
    });
    els.favoritesOptions.replaceChildren(...options);
  }

  function openFavorites() {
    if (!state.data || !state.teams) return;
    renderFavoriteOptions();
    if (typeof els.favoritesDialog.showModal === "function") els.favoritesDialog.showModal();
    else els.favoritesDialog.setAttribute("open", "");
  }

  document.querySelectorAll("[data-open-favorites]").forEach((button) => button.addEventListener("click", openFavorites));
  const closeFavorites = document.querySelector("[data-close-favorites]");
  const clearFavorites = document.querySelector("[data-clear-favorites]");
  if (closeFavorites && els.favoritesDialog) closeFavorites.addEventListener("click", function () { els.favoritesDialog.close(); });
  if (clearFavorites && els.favoritesDialog) clearFavorites.addEventListener("click", function () {
    saveFavorites([]);
    els.favoritesDialog.close();
  });
  if (els.favoritesForm && els.favoritesOptions && els.favoritesDialog) els.favoritesForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const ids = Array.from(els.favoritesOptions.querySelectorAll('input[name="favorite-team"]:checked')).map((input) => input.value);
    saveFavorites(ids);
    els.favoritesDialog.close();
  });
  if (els.favoritesDialog) els.favoritesDialog.addEventListener("click", function (event) { if (event.target === els.favoritesDialog) els.favoritesDialog.close(); });

  fetch(app.dataset.dataUrl, { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      const teams = new Map();
      data.games.forEach((game) => { teams.set(game.away_team.id, game.away_team); teams.set(game.home_team.id, game.home_team); });
      data.favorites = storedFavorites(data.favorites || [], teams);
      state.data = data;
      state.teams = teams;
      els.updated.textContent = "Updated " + new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.display_timezone }).format(new Date(data.generated_at));
      renderHero(data);
      renderWeek(data);
      renderFavorites(data, teams);
      renderAround(data);
      renderPlayerFavorites();
      renderTeams(teams);
      if (new URLSearchParams(window.location.search).get("favorites") === "open") openFavorites();
    })
    .catch(() => {
      els.updated.textContent = "Data unavailable";
      els.notice.hidden = false;
      els.notice.textContent = "The latest sports snapshot could not be loaded. Please try again later.";
      els.hero.hidden = true;
    });
  window.addEventListener("pageshow", function () { if (state.data) renderPlayerFavorites(); });
}());
