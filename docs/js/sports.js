(function () {
  "use strict";

  const app = document.querySelector("[data-sports-app]");
  if (!app) return;

  const els = {
    updated: app.querySelector("[data-updated]"),
    notice: app.querySelector("[data-notice]"),
    favoritesSection: app.querySelector("[data-favorites-section]"),
    favorites: app.querySelector("[data-favorites]"),
    favoritesCount: app.querySelector("[data-favorites-count]"),
    games: app.querySelector("[data-games]"),
    gamesCount: app.querySelector("[data-games-count]"),
    heading: app.querySelector("[data-games-heading]"),
    filters: Array.from(app.querySelectorAll("[data-filter]")),
    weekPicker: app.querySelector("[data-week-picker]"),
    weekOptions: app.querySelector("[data-week-options]"),
    weekPrevious: app.querySelector("[data-week-previous]"),
    weekNext: app.querySelector("[data-week-next]"),
    dialog: document.querySelector("[data-matchup-dialog]"),
    detail: document.querySelector("[data-matchup-detail]")
  };
  const state = { data: null, filter: "today", weekKey: null };
  const labels = { yesterday: "Yesterday", today: "Today", upcoming: "Upcoming", live: "Live", final: "Final" };

  function text(tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null ? "" : String(value);
    return node;
  }

  function localDay(iso, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }

  function relativeDay(offset, timeZone) {
    const now = new Date(Date.now() + offset * 86400000);
    return localDay(now.toISOString(), timeZone);
  }

  function filteredGames() {
    const games = state.data.games;
    const zone = state.data.display_timezone || "America/Los_Angeles";
    if (state.filter === "live") return games.filter((game) => game.status === "live" || game.status === "halftime");
    if (state.filter === "final") return games.filter((game) => game.status === "final");
    if (state.filter === "upcoming") {
      const today = relativeDay(0, zone);
      return games.filter((game) => game.status === "scheduled" && localDay(game.kickoff, zone) > today);
    }
    const day = relativeDay(state.filter === "yesterday" ? -1 : 0, zone);
    return games.filter((game) => localDay(game.kickoff, zone) === day);
  }

  function logo(team, decorative) {
    if (!team.logo_url) return text("span", team.abbreviation, "team-logo team-logo-fallback");
    const img = document.createElement("img");
    img.className = "team-logo";
    img.src = team.logo_url;
    img.alt = decorative ? "" : team.name + " logo";
    img.width = 64;
    img.height = 64;
    img.loading = "lazy";
    img.addEventListener("error", function () {
      img.replaceWith(text("span", team.abbreviation, "team-logo team-logo-fallback"));
    }, { once: true });
    return img;
  }

  function statusLabel(game) {
    if (game.status === "live" || game.status === "halftime") return game.status_detail || (game.status === "halftime" ? "Halftime" : "Live");
    if (game.status === "final") return "Final";
    return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: state.data.display_timezone }).format(new Date(game.kickoff));
  }

  function teamRow(team, score) {
    const row = document.createElement("div");
    row.className = "team-row";
    row.append(logo(team, false));
    const identity = document.createElement("div");
    identity.append(text("span", team.name, "team-name"));
    if (team.record) identity.append(text("span", team.record, "team-record"));
    row.append(identity);
    row.append(text("span", score == null ? "—" : score, "team-score"));
    return row;
  }

  function card(game) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "matchup-card";
    button.style.setProperty("--team-gradient", "linear-gradient(145deg," + game.home_team.colors.primary + "," + game.home_team.colors.secondary + ")");
    button.setAttribute("aria-label", game.away_team.name + " at " + game.home_team.name + ", " + statusLabel(game) + ". Open matchup details.");
    const inner = document.createElement("div");
    inner.className = "matchup-card-inner";
    const top = document.createElement("div");
    top.className = "matchup-topline";
    const status = text("span", statusLabel(game));
    if (game.status === "live" || game.status === "halftime") status.className = "status-live";
    top.append(status, text("span", game.network || "NFL"));
    inner.append(top, teamRow(game.away_team, game.away_score), teamRow(game.home_team, game.home_score));
    const meta = document.createElement("div");
    meta.className = "matchup-meta";
    if (game.away_jersey || game.home_jersey) meta.append(text("span", "Jerseys: " + [game.away_jersey, game.home_jersey].filter(Boolean).join(" / ")));
    const injuryCount = (game.injuries || []).length;
    if (injuryCount) meta.append(text("span", "▲ " + injuryCount + " injury " + (injuryCount === 1 ? "note" : "notes")));
    inner.append(meta);
    button.append(inner);
    button.addEventListener("click", function () { openDetail(game); });
    return button;
  }

  function renderGroup(container, games) {
    container.classList.add("sports-grid");
    container.replaceChildren();
    games.forEach((game) => container.append(card(game)));
  }

  function weekLabel(game) {
    const phase = game.season_phase || "Regular Season";
    return game.week == null ? phase : phase + " · Week " + game.week;
  }

  function weekKey(game) {
    return (game.season_phase || "Regular Season") + "|" + (game.week == null ? "none" : game.week);
  }

  function availableWeeks(games) {
    const weeks = new Map();
    games.slice().sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)).forEach((game) => {
      const key = weekKey(game);
      if (!weeks.has(key)) weeks.set(key, { key: key, label: weekLabel(game), phase: game.season_phase || "Regular Season", week: game.week });
    });
    return Array.from(weeks.values());
  }

  function renderWeekPicker(games) {
    const weeks = availableWeeks(games);
    if (!weeks.some((week) => week.key === state.weekKey)) state.weekKey = weeks.length ? weeks[0].key : null;
    els.weekPicker.hidden = weeks.length === 0;
    els.weekOptions.replaceChildren();
    weeks.forEach((week) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sports-week-option";
      button.dataset.weekKey = week.key;
      button.setAttribute("aria-pressed", String(week.key === state.weekKey));
      button.setAttribute("aria-label", week.label);
      button.append(text("strong", week.week == null ? week.phase : "Week " + week.week));
      if (week.week != null) button.append(text("span", week.phase));
      button.addEventListener("click", function () {
        state.weekKey = week.key;
        render();
        const active = els.weekOptions.querySelector('[aria-pressed="true"]');
        if (active) active.focus();
      });
      els.weekOptions.append(button);
    });
    const selected = els.weekOptions.querySelector('[aria-pressed="true"]');
    if (selected) els.weekOptions.scrollLeft = Math.max(0, selected.offsetLeft - els.weekOptions.clientWidth / 3);
    return weeks.find((week) => week.key === state.weekKey);
  }

  function render() {
    let games = filteredGames();
    let selectedWeek = null;
    if (state.filter === "upcoming") {
      selectedWeek = renderWeekPicker(games);
      games = games.filter((game) => weekKey(game) === state.weekKey);
    } else {
      els.weekPicker.hidden = true;
    }
    const favoriteIds = new Set(state.data.favorites || []);
    const favoriteGames = games.filter((game) => favoriteIds.has(game.home_team.id) || favoriteIds.has(game.away_team.id));
    const otherGames = games.filter((game) => !favoriteGames.includes(game));
    renderGroup(els.favorites, favoriteGames);
    renderGroup(els.games, otherGames);
    els.favoritesSection.hidden = favoriteGames.length === 0;
    els.favoritesCount.textContent = favoriteGames.length + " game" + (favoriteGames.length === 1 ? "" : "s");
    els.gamesCount.textContent = games.length + " game" + (games.length === 1 ? "" : "s");
    els.heading.textContent = selectedWeek ? selectedWeek.label : labels[state.filter];
    els.notice.hidden = games.length !== 0;
    els.notice.textContent = games.length ? "" : "No games match this view.";
  }

  function detailTeam(team) {
    const wrap = document.createElement("div");
    wrap.className = "detail-team";
    wrap.append(logo(team, true), text("strong", team.name), text("span", team.record || ""));
    return wrap;
  }

  function detailItem(label, value) {
    const item = document.createElement("li");
    item.append(text("strong", label), text("span", value || "Not listed"));
    return item;
  }

  function openDetail(game) {
    const wrap = document.createElement("article");
    wrap.className = "matchup-detail";
    const title = text("h2", game.away_team.name + " at " + game.home_team.name);
    title.id = "matchup-title";
    wrap.append(title, text("p", statusLabel(game), "detail-kicker"));
    const board = document.createElement("div");
    board.className = "detail-scoreboard";
    board.append(detailTeam(game.away_team), text("span", (game.away_score == null ? "—" : game.away_score) + "  ·  " + (game.home_score == null ? "—" : game.home_score), "detail-score"), detailTeam(game.home_team));
    wrap.append(board);
    const list = document.createElement("ul");
    list.className = "detail-list";
    list.append(detailItem("Kickoff", new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: state.data.display_timezone }).format(new Date(game.kickoff))), detailItem("Network", game.network), detailItem("Venue", game.venue), detailItem("Jerseys", [game.away_jersey, game.home_jersey].filter(Boolean).join(" / ")));
    (game.injuries || []).forEach((injury) => list.append(detailItem(injury.team + " injury", injury.player + " — " + injury.status + (injury.detail ? " (" + injury.detail + ")" : ""))));
    wrap.append(list);
    if (game.notes) wrap.append(text("p", game.notes, "detail-notes"));
    els.detail.replaceChildren(wrap);
    if (typeof els.dialog.showModal === "function") els.dialog.showModal();
    else els.dialog.setAttribute("open", "");
  }

  els.filters.forEach((button) => button.addEventListener("click", function () {
    state.filter = button.dataset.filter;
    els.filters.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    render();
  }));
  els.weekPrevious.addEventListener("click", function () { els.weekOptions.scrollBy({ left: -els.weekOptions.clientWidth, behavior: "smooth" }); });
  els.weekNext.addEventListener("click", function () { els.weekOptions.scrollBy({ left: els.weekOptions.clientWidth, behavior: "smooth" }); });
  document.querySelector("[data-close-dialog]").addEventListener("click", function () { els.dialog.close(); });
  els.dialog.addEventListener("click", function (event) { if (event.target === els.dialog) els.dialog.close(); });

  fetch(app.dataset.dataUrl, { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      state.data = data;
      els.updated.textContent = "Updated " + new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.display_timezone }).format(new Date(data.generated_at));
      render();
    })
    .catch(() => {
      els.updated.textContent = "Data unavailable";
      els.notice.hidden = false;
      els.notice.textContent = "The latest sports snapshot could not be loaded. Please try again later.";
    });
}());
