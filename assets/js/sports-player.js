(function () {
  "use strict";
  const app = document.querySelector("[data-player-app]");
  if (!app) return;

  const favoritesKey = "sports-center:favorite-players:v1";
  const statLabels = { games: "Games", completions: "Completions", attempts: "Attempts", passing_yards: "Passing yards", passing_tds: "Passing TD", interceptions: "Interceptions", carries: "Carries", rushing_yards: "Rushing yards", rushing_tds: "Rushing TD", targets: "Targets", receptions: "Receptions", receiving_yards: "Receiving yards", receiving_tds: "Receiving TD", tackles: "Tackles", tackles_solo: "Solo tackles", sacks: "Sacks", def_interceptions: "Defensive INT", forced_fumbles: "Forced fumbles", field_goals_made: "Field goals", field_goals_attempted: "FG attempts", extra_points_made: "Extra points", extra_points_attempted: "XP attempts" };
  const statOrder = {
    QB: ["completions", "attempts", "passing_yards", "passing_tds", "interceptions", "carries", "rushing_yards", "rushing_tds"],
    RB: ["carries", "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds"],
    FB: ["carries", "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds"],
    WR: ["targets", "receptions", "receiving_yards", "receiving_tds", "carries", "rushing_yards", "rushing_tds"],
    TE: ["targets", "receptions", "receiving_yards", "receiving_tds"],
    K: ["field_goals_made", "field_goals_attempted", "extra_points_made", "extra_points_attempted"],
    P: ["games"]
  };
  const defenseOrder = ["tackles", "tackles_solo", "sacks", "def_interceptions", "forced_fumbles"];
  const el = (selector) => app.querySelector(selector);

  function orderedStats(player, stats) {
    const defensivePositions = ["DE", "DT", "NT", "DL", "LB", "ILB", "OLB", "CB", "S", "FS", "SS", "DB"];
    const preferred = statOrder[player.position] || (defensivePositions.includes(player.position) ? defenseOrder : []);
    const keys = preferred.concat(Object.keys(stats || {}).filter((key) => !preferred.includes(key)));
    return keys.filter((key, index) => keys.indexOf(key) === index && statLabels[key] && stats[key] != null && stats[key] !== 0);
  }

  function favorites() {
    try {
      const value = JSON.parse(window.localStorage.getItem(favoritesKey) || "[]");
      return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === "string" && typeof entry.teamId === "string") : [];
    } catch (_) { return []; }
  }

  function saveFavorite(player, team) {
    const saved = favorites();
    const index = saved.findIndex((entry) => entry.id === player.id);
    if (index === -1) saved.push({ id: player.id, teamId: team.id });
    else saved.splice(index, 1);
    try { window.localStorage.setItem(favoritesKey, JSON.stringify(saved)); } catch (_) { /* The page remains usable without storage. */ }
    updateFavorite(player);
  }

  function updateFavorite(player) {
    const selected = favorites().some((entry) => entry.id === player.id);
    const button = el("[data-player-favorite]");
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector("[aria-hidden]").textContent = selected ? "★" : "☆";
    el("[data-player-favorite-label]").textContent = selected ? "Favorited" : "Add favorite";
  }

  function setupBackLink() {
    const link = el("[data-player-back]");
    if (!document.referrer) return;
    try {
      const previous = new URL(document.referrer);
      if (previous.origin !== location.origin || previous.href === location.href) return;
      let name = "previous page";
      if (/\/sports\/teams\/[^/]+\/?$/.test(previous.pathname)) name = "team roster";
      else if (/\/sports\/?$/.test(previous.pathname)) name = "Sports Center home";
      link.textContent = "← Back to " + name;
      link.addEventListener("click", function (event) { event.preventDefault(); history.back(); });
    } catch (_) { /* Keep the home fallback. */ }
  }

  function appendStats(container, player, stats) {
    const keys = orderedStats(player, stats);
    if (!keys.length) {
      const empty = document.createElement("div"); empty.className = "player-stats-empty"; empty.textContent = "No statistics are available yet."; container.replaceChildren(empty); return;
    }
    container.replaceChildren(...keys.map((key) => {
      const group = document.createElement("div");
      const term = document.createElement("dt"); term.textContent = statLabels[key];
      const value = document.createElement("dd"); value.textContent = stats[key];
      group.append(term, value); return group;
    }));
  }

  function renderWeeks(player, weeks) {
    el("[data-player-week-count]").textContent = weeks.length + " week" + (weeks.length === 1 ? "" : "s");
    if (!weeks.length) {
      const empty = document.createElement("p"); empty.className = "player-stats-empty"; empty.textContent = "Weekly statistics will appear here once the player records a regular-season appearance.";
      el("[data-player-weeks]").replaceChildren(empty); return;
    }
    el("[data-player-weeks]").replaceChildren(...weeks.slice().reverse().map((week) => {
      const card = document.createElement("article"); card.className = "player-week-card";
      const heading = document.createElement("div"); heading.className = "player-week-heading";
      const title = document.createElement("span"); title.className = "player-week-label"; title.textContent = "Week " + week.week;
      const opponent = document.createElement("h3"); opponent.className = "player-week-opponent"; opponent.textContent = week.opponent ? "vs. " + week.opponent : "Regular season";
      heading.append(title, opponent);
      const stats = document.createElement("dl"); stats.className = "player-page-stats player-week-stats";
      appendStats(stats, player, week.stats || {}); card.append(heading, stats); return card;
    }));
  }

  function render(data, player) {
    const team = data.team;
    document.title = player.name + " · NFL Sports Center";
    const gradient = "linear-gradient(135deg," + team.colors.primary + "," + team.colors.secondary + ")";
    app.style.setProperty("--player-gradient", gradient);
    document.body.classList.add("team-themed-page");
    document.body.style.setProperty("--team-background-gradient", "linear-gradient(rgba(7,10,18,.78),rgba(7,10,18,.92))," + gradient);
    el("[data-player-hero]").style.setProperty("--player-gradient", gradient);
    const headshot = el("[data-player-headshot]");
    if (player.headshot_url) { headshot.src = player.headshot_url; headshot.alt = player.name + " headshot"; headshot.addEventListener("error", function () { headshot.hidden = true; }, { once: true }); }
    else headshot.hidden = true;
    el("[data-player-name]").textContent = player.name;
    el("[data-player-meta]").textContent = [player.number ? "#" + player.number : "", player.position, player.depth_rank ? (player.depth_position || player.position) + player.depth_rank : ""].filter(Boolean).join(" · ");
    const seasons = player.seasons && player.seasons.length ? player.seasons.slice().sort((a, b) => b.season - a.season) : [{ season: data.season, team: team, stats: player.stats || {}, weekly_stats: player.weekly_stats || [] }];
    const selector = el("[data-player-season-select]");
    selector.replaceChildren(...seasons.map((season) => { const option = document.createElement("option"); option.value = String(season.season); option.textContent = season.season; return option; }));
    el("[data-player-season-control]").hidden = seasons.length < 2;
    function showSeason(season) {
      const seasonTeam = season.team || team;
      const seasonGradient = "linear-gradient(135deg," + seasonTeam.colors.primary + "," + seasonTeam.colors.secondary + ")";
      app.style.setProperty("--player-gradient", seasonGradient);
      el("[data-player-hero]").style.setProperty("--player-gradient", seasonGradient);
      document.body.style.setProperty("--team-background-gradient", "linear-gradient(rgba(7,10,18,.78),rgba(7,10,18,.92))," + seasonGradient);
      el("[data-player-team]").textContent = season.season + " · " + seasonTeam.name;
      const teamLink = el("[data-player-team-link]"); teamLink.href = app.dataset.teamBaseUrl + seasonTeam.id + "/"; teamLink.textContent = "View " + seasonTeam.name + " roster";
      appendStats(el("[data-player-totals]"), player, season.stats || {});
      renderWeeks(player, season.weekly_stats || []);
    }
    showSeason(seasons[0]);
    selector.addEventListener("change", function () { const selected = seasons.find((season) => String(season.season) === selector.value); if (selected) showSeason(selected); });
    const injury = (data.injuries || []).find((entry) => entry.player === player.name);
    if (injury) { el("[data-player-injury-section]").hidden = false; el("[data-player-injury]").textContent = injury.status + (injury.detail ? " · " + injury.detail : ""); }
    updateFavorite(player);
    el("[data-player-favorite]").addEventListener("click", function () { saveFavorite(player, team); });
    app.querySelectorAll("[data-player-content]:not([data-player-injury-section])").forEach((section) => { section.hidden = false; });
    el("[data-player-notice]").hidden = true;
    el("[data-player-hero]").hidden = false;
  }

  setupBackLink();
  const params = new URLSearchParams(location.search);
  const teamId = params.get("team") || "";
  const playerId = params.get("id") || "";
  if (!/^[a-z0-9-]{2,24}$/.test(teamId) || !/^[a-zA-Z0-9.-]{2,100}$/.test(playerId)) {
    el("[data-player-notice]").textContent = "This player link is invalid."; return;
  }
  fetch(app.dataset.teamDataBaseUrl + encodeURIComponent(teamId) + ".json", { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      const player = data.players.find((entry) => entry.id === playerId);
      if (!player) throw new Error("Player not found");
      render(data, player);
    })
    .catch(() => { el("[data-player-notice]").textContent = "This player could not be loaded from the latest roster snapshot."; });
}());
