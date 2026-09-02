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
    gamesSection: app.querySelector("[data-games-section]"),
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
  const requestedFilter = new URLSearchParams(window.location.search).get("view");
  const state = { data: null, filter: ["yesterday", "today", "upcoming", "live", "final"].includes(requestedFilter) ? requestedFilter : "today", weekKey: null };
  const teamDataCache = new Map();
  const favoritesStorageKey = "sports-center:favorite-teams:v1";
  const labels = { yesterday: "Yesterday", today: "Today", upcoming: "Upcoming", live: "Live", final: "Final" };
  const jerseyHexVariants = {
    chi: { "rivalry series": ["#0B162A", "#C83803", false, 64, null, null, "#F5F5F5"] },
    det: { "rivalry series": ["#0076B6", "#111111", false, 58, null, null, "#B0B7BC"] },
    gb: { "rivalry series": ["#294936", "#E8DFC8", true, 66, null, null, "#FFB612", "#173224"] },
    hou: { "rivalry series": ["#F7F5EF", "#69C9E8", true, 58, null, null, "#D7193F"] },
    ind: { "rivalry series": ["#292C31", "#003A70", false, 62, null, null, "#BFC3C7"] },
    jax: { "rivalry series": ["#F7F5EF", "#007A8B", true, 48, "#101820", 72, "#D7A22A", "#101820"] },
    min: {
      "winter warrior white/purple": ["#FFFFFF", "#4F2683", true],
      "rivalry series": ["#1E1A34", "#AF925D", false, 55]
    },
    tb: {
      "classic": ["#F47B20", "#F2DFC7", true, 68, null, null, "#A71930"],
      "throwback": ["#F47B20", "#F2DFC7", true, 68, null, null, "#A71930"]
    },
    ten: { "rivalry series": ["#4B92DB", "#0C2340", false, 48, null, null, "#4B92DB"] }
  };
  const teamDefaultGradients = {
    gb: ["#203731", "#FFB612", false, 70],
    ind: ["#002C5F", "#A2AAAD", false, 78],
    lar: ["#003594", "#FFA300", false, 72],
    ten: ["#4B92DB", "#F8FAFC", true, 62]
  };
  const teamAccentBorders = { ten: "#C8102E" };
  const rivalryLogos = {
    hou: "/images/sports/logos/texans-rivalry.png",
    ind: "/images/sports/logos/colts-rivalry.png",
    ten: "/images/sports/logos/titans-rivalry.png"
  };

  function variantFor(team, jersey) {
    return jerseyHexVariants[team.id] && jerseyHexVariants[team.id][String(jersey || "").toLowerCase()];
  }

  function teamLogo(team, jersey) {
    return variantFor(team, jersey) && rivalryLogos[team.id] ? rivalryLogos[team.id] : team.logo_url;
  }

  function text(tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null ? "" : String(value);
    return node;
  }

  function browserFavorites(defaults, games) {
    try {
      const saved = window.localStorage.getItem(favoritesStorageKey);
      if (saved === null) return defaults;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return defaults;
      const teamIds = new Set();
      games.forEach((game) => { teamIds.add(game.away_team.id); teamIds.add(game.home_team.id); });
      return parsed.filter((id, index) => typeof id === "string" && teamIds.has(id) && parsed.indexOf(id) === index);
    } catch (_) { return defaults; }
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

  function logo(team, decorative, jersey) {
    const logoUrl = teamLogo(team, jersey);
    if (!logoUrl) return text("span", team.abbreviation, "team-logo team-logo-fallback");
    const img = document.createElement("img");
    img.className = "team-logo";
    img.src = logoUrl;
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

  function darken(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount))).toString(16).padStart(2, "0");
    return "#" + channel(16) + channel(8) + channel(0);
  }

  function brighterTeamColor(team) {
    const colors = [team.colors.primary, team.colors.secondary].filter((color) => /^#[0-9a-f]{6}$/i.test(color || ""));
    const brightness = (hex) => {
      const value = parseInt(hex.slice(1), 16);
      return .2126 * ((value >> 16) & 255) + .7152 * ((value >> 8) & 255) + .0722 * (value & 255);
    };
    return colors.sort((a, b) => brightness(b) - brightness(a))[0] || "#c4b5fd";
  }

  function jerseyGradient(team, jersey) {
    const primary = team.colors.primary;
    const secondary = team.colors.secondary;
    const label = String(jersey || "").toLowerCase();
    const exactVariant = variantFor(team, jersey);
    if (exactVariant) return exactVariant;
    const teamDefault = teamDefaultGradients[team.id];
    if (teamDefault) return teamDefault;
    if (!label) return [primary, secondary, false];
    const namedColors = [
      ["white", "#F8FAFC"], ["black", "#050505"], ["cream", "#FFF1CC"],
      ["orange", "#F97316"], ["yellow", "#FACC15"], ["gold", "#D4A72C"],
      ["red", "#C81D25"], ["blue", "#2563EB"], ["green", "#15803D"],
      ["purple", "#6D28D9"], ["silver", "#9CA3AF"], ["gray", "#6B7280"]
    ];
    const named = namedColors.find((entry) => label.includes(entry[0]));
    if (named) return [named[1], primary, /white|cream|yellow|gold|silver/.test(named[0])];
    if (/classic|throwback|retro|heritage/.test(label)) return [secondary, primary, false];
    if (/alternate|color rush|colour rush/.test(label)) return [primary, darken(primary, 0.48), false];
    return [primary, secondary, false];
  }

  function gradientBackground(gradient) {
    if (gradient[4]) {
      return "linear-gradient(145deg," + gradient[0] + " 0%," + gradient[0] + " " + gradient[3] + "%," + gradient[1] + " " + gradient[5] + "%," + gradient[4] + " 100%)";
    }
    if (gradient[3]) {
      return "linear-gradient(145deg," + gradient[0] + " 0%," + gradient[0] + " " + gradient[3] + "%," + gradient[1] + " 100%)";
    }
    return "linear-gradient(145deg," + gradient[0] + "," + gradient[1] + ")";
  }

  function teamRow(team, score, jersey) {
    const row = document.createElement("div");
    row.className = "team-row";
    row.append(logo(team, false, jersey));
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
    const gradientTeam = game.home_team;
    const gradientJersey = game.home_jersey;
    const gradient = jerseyGradient(gradientTeam, gradientJersey);
    button.style.setProperty("--team-gradient", gradientBackground(gradient));
    if (gradient[7]) {
      button.style.color = gradient[7];
      button.dataset.lightVariant = "true";
    }
    if (gradientTeam.id === "tb" && gradient[6]) button.dataset.creamsicle = "true";
    if (gradientTeam.id === "hou" && gradient[6]) button.dataset.houstonRivalry = "true";
    const accentBorder = gradient[6] || teamAccentBorders[gradientTeam.id];
    if (accentBorder) {
      button.style.setProperty("--team-accent-border", accentBorder);
      button.dataset.teamAccentBorder = "true";
    }
    if (game.home_jersey) button.dataset.jerseyGradient = game.home_jersey;
    if (gradient[2]) button.dataset.lightGradient = "true";
    button.setAttribute("aria-label", game.away_team.name + " at " + game.home_team.name + ", " + statusLabel(game) + ". Open matchup details.");
    const inner = document.createElement("div");
    inner.className = "matchup-card-inner";
    const top = document.createElement("div");
    top.className = "matchup-topline";
    const status = text("span", statusLabel(game));
    if (game.status === "live" || game.status === "halftime") status.className = "status-live";
    top.append(status, text("span", game.network || "NFL"));
    inner.append(top, teamRow(game.away_team, game.away_score, game.away_jersey), teamRow(game.home_team, game.home_score, game.home_jersey));
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
    els.gamesSection.hidden = games.length === 0;
    els.notice.replaceChildren();
    if (!games.length) {
      const empty = document.createElement("div");
      empty.className = "sports-empty-state";
      const copy = document.createElement("div");
      copy.append(text("strong", state.filter === "today" ? "No games today" : "No games in this view"), text("span", "The next kickoff is waiting in the upcoming schedule."));
      const button = text("button", "Show upcoming games");
      button.type = "button";
      button.addEventListener("click", function () { selectFilter("upcoming"); });
      const icon = text("span", "", "sports-empty-icon");
      icon.setAttribute("aria-hidden", "true");
      const clock = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      clock.setAttribute("viewBox", "0 0 24 24");
      clock.setAttribute("focusable", "false");
      const face = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      face.setAttribute("cx", "12"); face.setAttribute("cy", "12"); face.setAttribute("r", "8.5");
      const hands = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hands.setAttribute("d", "M12 7.5V12H16");
      clock.append(face, hands);
      icon.append(clock);
      empty.append(icon, copy, button);
      els.notice.append(empty);
    }
  }

  function selectFilter(filter) {
    state.filter = filter;
    els.filters.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.filter === filter)));
    render();
  }

  function detailTeam(team, jersey) {
    const wrap = document.createElement("a");
    wrap.className = "detail-team";
    wrap.href = app.dataset.teamBaseUrl + team.id + "/";
    wrap.setAttribute("aria-label", "View " + team.name + " team page");
    wrap.style.setProperty("--detail-team-accent", brighterTeamColor(team));
    wrap.append(logo(team, true, jersey), text("strong", team.name), text("span", team.record || ""));
    return wrap;
  }

  function detailItem(label, value) {
    const item = document.createElement("li");
    item.append(text("strong", label), text("span", value || "Not listed"));
    return item;
  }

  function injuryStatusClass(status) {
    const label = String(status || "").toLowerCase();
    if (label.includes("out") || label.includes("ir") || label.includes("pup") || label.includes("suspend")) return "is-out";
    if (label.includes("doubtful")) return "is-doubtful";
    if (label.includes("questionable")) return "is-questionable";
    return "is-other";
  }

  function normalizedPlayerName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function enrichInjuryPlayers(group, team, rows) {
    if (!team || !app.dataset.teamDataBaseUrl || !app.dataset.playerUrl) return;
    if (!teamDataCache.has(team.id)) {
      teamDataCache.set(team.id, fetch(app.dataset.teamDataBaseUrl + encodeURIComponent(team.id) + ".json", { headers: { Accept: "application/json" }, cache: "no-cache" })
        .then((response) => response.ok ? response.json() : null).catch(() => null));
    }
    teamDataCache.get(team.id).then((data) => {
      if (!data || !Array.isArray(data.players) || !group.isConnected) return;
      const availablePlayers = (data.injury_players || []).concat(data.players);
      const players = new Map(availablePlayers.map((player) => [normalizedPlayerName(player.name), player]));
      rows.forEach((entry) => {
        const matched = players.get(normalizedPlayerName(entry.injury.player));
        if (!matched) return;
        const link = document.createElement("a");
        link.className = "detail-injury-player-link";
        link.href = app.dataset.playerUrl + "?view=player-v2&team=" + encodeURIComponent(team.id) + "&id=" + encodeURIComponent(matched.id);
        if (matched.headshot_url) {
          const image = document.createElement("img");
          image.className = "detail-injury-player-image"; image.src = matched.headshot_url; image.alt = ""; image.loading = "lazy";
          image.addEventListener("error", function () { image.remove(); }, { once: true });
          link.append(image);
        }
        link.append(entry.copy);
        entry.identity.replaceWith(link);
      });
    });
  }

  function injuryReport(game) {
    const injuries = game.injuries || [];
    if (!injuries.length) return null;
    const report = document.createElement("details");
    report.className = "detail-injuries";
    const summary = document.createElement("summary");
    summary.append(text("span", "Injury report"), text("span", injuries.length + " player" + (injuries.length === 1 ? "" : "s"), "detail-injury-total"));
    report.append(summary);
    const groups = new Map();
    injuries.forEach((injury) => {
      const name = injury.team || "Team";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(injury);
    });
    groups.forEach((players, teamName) => {
      const injuryTeam = [game.away_team, game.home_team].find((team) => team.name === teamName);
      const group = document.createElement("section");
      group.className = "detail-injury-team";
      if (injuryTeam) {
        group.style.setProperty("--injury-team-gradient", "linear-gradient(135deg," + injuryTeam.colors.primary + "," + injuryTeam.colors.secondary + ")");
      }
      const heading = document.createElement("div");
      heading.className = "detail-injury-team-heading";
      const identity = document.createElement("div");
      identity.className = "detail-injury-team-identity";
      if (injuryTeam) {
        const teamMark = logo(injuryTeam, false);
        teamMark.classList.add("detail-injury-team-logo");
        identity.append(teamMark);
      }
      identity.append(text("strong", teamName));
      heading.append(identity, text("span", players.length + " listed"));
      group.append(heading);
      const injuryRows = [];
      players.forEach((injury) => {
        const row = document.createElement("div");
        row.className = "detail-injury-row";
        const player = document.createElement("div");
        player.className = "detail-injury-player";
        const playerCopy = document.createElement("div");
        playerCopy.append(text("strong", injury.player), text("span", injury.detail || "No injury detail", "detail-injury-detail"));
        player.append(playerCopy);
        const badge = text("span", injury.status || "Listed", "detail-injury-status " + injuryStatusClass(injury.status));
        row.append(player, badge);
        group.append(row);
        injuryRows.push({ injury: injury, identity: player, copy: playerCopy });
      });
      report.append(group);
      enrichInjuryPlayers(group, injuryTeam, injuryRows);
    });
    return report;
  }

  function openDetail(game) {
    const gradientTeam = game.home_team;
    const gradientJersey = game.home_jersey;
    const gradient = jerseyGradient(gradientTeam, gradientJersey);
    const isWinterWarrior = String(game.home_jersey || "").toLowerCase() === "winter warrior white/purple";
    const isCreamsicle = gradientTeam.id === "tb" && Boolean(gradient[6]);
    const isHoustonRivalry = gradientTeam.id === "hou" && Boolean(gradient[6]);
    const hasDarkVariantText = Boolean(gradient[7]);
    const overlay = hasDarkVariantText
      ? "linear-gradient(rgba(255,255,255,.02),rgba(255,255,255,.08))"
      : isHoustonRivalry
      ? "linear-gradient(rgba(3,32,47,.08),rgba(3,32,47,.14))"
      : isCreamsicle
      ? "linear-gradient(rgba(50,20,7,.04),rgba(50,20,7,.07))"
      : isWinterWarrior
      ? "linear-gradient(rgba(30,26,52,.3),rgba(30,26,52,.4))"
      : gradient[2]
      ? "linear-gradient(rgba(0,0,0,.48),rgba(0,0,0,.62))"
      : "linear-gradient(rgba(0,0,0,.34),rgba(0,0,0,.54))";
    els.dialog.style.background = overlay + "," + gradientBackground(gradient);
    els.dialog.style.backgroundAttachment = "local";
    els.dialog.style.color = gradient[7] || (isCreamsicle ? "#321407" : isHoustonRivalry ? "#03202F" : "#fff");
    const accentBorder = gradient[6] || teamAccentBorders[gradientTeam.id];
    if (accentBorder) {
      els.dialog.style.setProperty("--team-accent-border", accentBorder);
      els.dialog.dataset.teamAccentBorder = "true";
    } else {
      els.dialog.style.removeProperty("--team-accent-border");
      delete els.dialog.dataset.teamAccentBorder;
    }
    els.dialog.dataset.matchupGradient = "true";
    if (isCreamsicle) els.dialog.dataset.creamsicle = "true";
    else delete els.dialog.dataset.creamsicle;
    if (isHoustonRivalry) els.dialog.dataset.houstonRivalry = "true";
    else delete els.dialog.dataset.houstonRivalry;
    if (game.home_jersey) els.dialog.dataset.jerseyGradient = game.home_jersey;
    else delete els.dialog.dataset.jerseyGradient;
    if (gradient[2]) els.dialog.dataset.lightGradient = "true";
    else delete els.dialog.dataset.lightGradient;
    const wrap = document.createElement("article");
    wrap.className = "matchup-detail";
    const title = text("h2", game.away_team.name + " at " + game.home_team.name);
    title.id = "matchup-title";
    wrap.append(title, text("p", statusLabel(game), "detail-kicker"));
    const board = document.createElement("div");
    board.className = "detail-scoreboard";
    board.append(detailTeam(game.away_team, game.away_jersey), text("span", (game.away_score == null ? "—" : game.away_score) + "  ·  " + (game.home_score == null ? "—" : game.home_score), "detail-score"), detailTeam(game.home_team, game.home_jersey));
    wrap.append(board);
    const list = document.createElement("ul");
    list.className = "detail-list";
    list.append(detailItem("Kickoff", new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: state.data.display_timezone }).format(new Date(game.kickoff))), detailItem("Network", game.network), detailItem("Venue", game.venue), detailItem("Jerseys", [game.away_jersey, game.home_jersey].filter(Boolean).join(" / ")));
    wrap.append(list);
    const injuries = injuryReport(game);
    if (injuries) wrap.append(injuries);
    if (game.notes) wrap.append(text("p", game.notes, "detail-notes"));
    els.detail.replaceChildren(wrap);
    if (typeof els.dialog.showModal === "function") els.dialog.showModal();
    else els.dialog.setAttribute("open", "");
  }

  els.filters.forEach((button) => button.addEventListener("click", function () {
    selectFilter(button.dataset.filter);
  }));
  els.filters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter)));
  els.weekPrevious.addEventListener("click", function () { els.weekOptions.scrollBy({ left: -els.weekOptions.clientWidth, behavior: "smooth" }); });
  els.weekNext.addEventListener("click", function () { els.weekOptions.scrollBy({ left: els.weekOptions.clientWidth, behavior: "smooth" }); });
  document.querySelector("[data-close-dialog]").addEventListener("click", function () { els.dialog.close(); });
  els.dialog.addEventListener("click", function (event) { if (event.target === els.dialog) els.dialog.close(); });

  fetch(app.dataset.dataUrl, { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      data.favorites = browserFavorites(data.favorites || [], data.games || []);
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
