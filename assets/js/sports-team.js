(function () {
  "use strict";
  const app = document.querySelector("[data-team-app]");
  if (!app) return;
  const groupsOrder = ["Quarterbacks", "Running Backs", "Wide Receivers", "Tight Ends", "Offensive Line", "Defensive Line", "Linebackers", "Cornerbacks", "Safeties", "Specialists", "Other"];
  const statLabels = { games: "GP", completions: "CMP", attempts: "ATT", passing_yards: "PASS YDS", passing_tds: "PASS TD", interceptions: "INT", carries: "CAR", rushing_yards: "RUSH YDS", rushing_tds: "RUSH TD", targets: "TGT", receptions: "REC", receiving_yards: "REC YDS", receiving_tds: "REC TD", tackles: "TKL", tackles_solo: "SOLO", sacks: "SACK", def_interceptions: "DEF INT", forced_fumbles: "FF", field_goals_made: "FGM", field_goals_attempted: "FGA", extra_points_made: "XPM", extra_points_attempted: "XPA" };
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
  const favoritesStorageKey = "sports-center:favorite-teams:v1";
  const el = (selector) => app.querySelector(selector);

  function previousPageName(pathname) {
    const path = pathname.replace(/\/+$/, "/");
    if (/\/sports\/scores\/$/.test(path)) return "Scores & Schedule";
    if (/\/sports\/teams\/$/.test(path)) return "Teams";
    if (/\/sports\/$/.test(path)) return "Sports Center home";
    if (/\/sports\/teams\/[^/]+\/$/.test(path)) return "previous team";
    return "previous page";
  }

  function setupBackLink() {
    const link = el("[data-team-back]");
    if (!link || !document.referrer) return;
    try {
      const previous = new URL(document.referrer);
      if (previous.origin !== window.location.origin || previous.href === window.location.href) return;
      const pageName = previousPageName(previous.pathname);
      link.textContent = "← Back to " + pageName;
      link.setAttribute("aria-label", "Return to " + pageName);
      link.addEventListener("click", function (event) {
        event.preventDefault();
        window.history.back();
      });
    } catch (_) { /* Keep the Sports Center fallback for an invalid or hidden referrer. */ }
  }

  setupBackLink();

  function savedFavorites() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(favoritesStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((id, index) => typeof id === "string" && parsed.indexOf(id) === index) : [];
    } catch (_) { return []; }
  }

  function updateFavoriteButton(favorites) {
    const button = el("[data-team-favorite]");
    const selected = favorites.includes(app.dataset.teamId);
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector("[aria-hidden]").textContent = selected ? "★" : "☆";
    el("[data-team-favorite-label]").textContent = selected ? "Favorited" : "Add favorite";
  }

  function setupFavoriteButton() {
    updateFavoriteButton(savedFavorites());
    el("[data-team-favorite]").addEventListener("click", function () {
      const favorites = savedFavorites();
      const index = favorites.indexOf(app.dataset.teamId);
      if (index === -1) favorites.push(app.dataset.teamId);
      else favorites.splice(index, 1);
      try { window.localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites)); }
      catch (_) { /* The team page remains usable when browser storage is unavailable. */ }
      updateFavoriteButton(favorites);
    });
  }

  function variantFor(team, jersey) {
    return jerseyHexVariants[team.id] && jerseyHexVariants[team.id][String(jersey || "").toLowerCase()];
  }

  setupFavoriteButton();

  function teamLogo(team, jersey) {
    return variantFor(team, jersey) && rivalryLogos[team.id] ? rivalryLogos[team.id] : team.logo_url;
  }

  function savedDisclosureState(key) {
    try { return window.sessionStorage.getItem("sports-team:" + app.dataset.teamId + ":" + key); }
    catch (_) { return null; }
  }

  function setupDisclosure(details, key, defaultOpen, restoreSaved = true) {
    const saved = restoreSaved ? savedDisclosureState(key) : null;
    details.open = saved === null ? defaultOpen : saved === "open";
    details.addEventListener("toggle", function () {
      try { window.sessionStorage.setItem("sports-team:" + app.dataset.teamId + ":" + key, details.open ? "open" : "closed"); }
      catch (_) { /* Storage may be unavailable in privacy modes. */ }
    });
  }

  function updateRosterToggle() {
    const button = el("[data-roster-toggle]");
    const groups = Array.from(app.querySelectorAll(".roster-group"));
    const shouldCollapse = groups.some((group) => group.open);
    button.textContent = shouldCollapse ? "Collapse all positions" : "Expand all positions";
    button.dataset.action = shouldCollapse ? "collapse" : "expand";
  }

  function setupRosterToggle() {
    const button = el("[data-roster-toggle]");
    const groups = Array.from(app.querySelectorAll(".roster-group"));
    groups.forEach((group) => group.addEventListener("toggle", updateRosterToggle));
    button.addEventListener("click", function () {
      const open = button.dataset.action !== "collapse";
      groups.forEach((group) => { group.open = open; });
      updateRosterToggle();
    });
    updateRosterToggle();
  }

  function darken(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount))).toString(16).padStart(2, "0");
    return "#" + channel(16) + channel(8) + channel(0);
  }

  function jerseyGradient(team, jersey) {
    const label = String(jersey || "").toLowerCase();
    const exact = variantFor(team, jersey);
    if (exact) return exact;
    if (teamDefaultGradients[team.id]) return teamDefaultGradients[team.id];
    if (!label) return [team.colors.primary, team.colors.secondary, false];
    const namedColors = [["white", "#F8FAFC"], ["black", "#050505"], ["cream", "#FFF1CC"], ["orange", "#F97316"], ["yellow", "#FACC15"], ["gold", "#D4A72C"], ["red", "#C81D25"], ["blue", "#2563EB"], ["green", "#15803D"], ["purple", "#6D28D9"], ["silver", "#9CA3AF"], ["gray", "#6B7280"]];
    const named = namedColors.find((entry) => label.includes(entry[0]));
    if (named) return [named[1], team.colors.primary, /white|cream|yellow|gold|silver/.test(named[0])];
    if (/classic|throwback|retro|heritage/.test(label)) return [team.colors.secondary, team.colors.primary, false];
    if (/alternate|color rush|colour rush/.test(label)) return [team.colors.primary, darken(team.colors.primary, 0.48), false];
    return [team.colors.primary, team.colors.secondary, false];
  }

  function gradientBackground(gradient) {
    if (gradient[4]) return "linear-gradient(145deg," + gradient[0] + " 0%," + gradient[0] + " " + gradient[3] + "%," + gradient[1] + " " + gradient[5] + "%," + gradient[4] + " 100%)";
    if (gradient[3]) return "linear-gradient(145deg," + gradient[0] + " 0%," + gradient[0] + " " + gradient[3] + "%," + gradient[1] + " 100%)";
    return "linear-gradient(145deg," + gradient[0] + "," + gradient[1] + ")";
  }

  function node(tag, value, className) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value != null) result.textContent = String(value);
    return result;
  }

  function image(url, alt, className) {
    if (!url) return node("span", alt.split(" ").map((part) => part[0]).join("").slice(0, 2), className + " image-fallback");
    const result = document.createElement("img");
    result.src = url; result.alt = alt; result.className = className; result.loading = "lazy";
    result.addEventListener("error", function () { result.replaceWith(node("span", alt.split(" ").map((part) => part[0]).join("").slice(0, 2), className + " image-fallback")); }, { once: true });
    return result;
  }

  function formattedHeight(value) {
    const inches = Number.parseInt(value, 10);
    if (!Number.isFinite(inches) || inches <= 0) return value || "";
    return Math.floor(inches / 12) + "′" + (inches % 12) + "″";
  }

  function renderSchedule(data) {
    const container = el("[data-team-schedule]");
    data.games.forEach((game) => {
      const isHome = game.home_team.id === data.team.id;
      const opponent = isHome ? game.away_team : game.home_team;
      const opponentJersey = isHome ? game.away_jersey : game.home_jersey;
      const item = document.createElement("article");
      item.className = "team-game-row";
      const jersey = isHome ? game.home_jersey : game.away_jersey;
      const gradient = jerseyGradient(data.team, jersey);
      const isWinterWarrior = String(jersey || "").toLowerCase() === "winter warrior white/purple";
      const isCreamsicle = data.team.id === "tb" && ["classic", "throwback"].includes(String(jersey || "").toLowerCase());
      const isHoustonRivalry = data.team.id === "hou" && String(jersey || "").toLowerCase() === "rivalry series";
      const overlay = gradient[7] ? "linear-gradient(100deg,rgba(255,255,255,.02),rgba(255,255,255,.08))" : isHoustonRivalry ? "linear-gradient(100deg,rgba(3,32,47,.08),rgba(3,32,47,.14))" : isCreamsicle ? "linear-gradient(100deg,rgba(50,20,7,.04),rgba(50,20,7,.07))" : isWinterWarrior ? "linear-gradient(100deg,rgba(30,26,52,.34),rgba(30,26,52,.2))" : gradient[2] ? "linear-gradient(100deg,rgba(0,0,0,.7),rgba(0,0,0,.42))" : "linear-gradient(100deg,rgba(0,0,0,.48),rgba(0,0,0,.18))";
      if (isWinterWarrior) item.classList.add("team-game-row-winter-warrior");
      if (isCreamsicle) item.classList.add("team-game-row-creamsicle");
      if (isHoustonRivalry) item.classList.add("team-game-row-houston-rivalry");
      item.style.background = overlay + "," + gradientBackground(gradient);
      if (gradient[7]) item.style.color = gradient[7];
      if (gradient[6] || teamAccentBorders[data.team.id]) item.style.borderColor = gradient[6] || teamAccentBorders[data.team.id];
      item.append(node("span", (game.season_phase || "Season") + (game.week ? " · W" + game.week : ""), "team-game-week"));
      const matchup = document.createElement("a");
      matchup.className = "team-game-opponent";
      if (gradient[7]) matchup.style.color = gradient[7];
      matchup.href = app.dataset.teamBaseUrl + opponent.id + "/";
      matchup.setAttribute("aria-label", "View " + opponent.name + " team page");
      const opponentLogo = image(teamLogo(opponent, opponentJersey), opponent.name + " logo", "team-game-logo");
      matchup.append(opponentLogo, node("strong", (isHome ? "vs " : "at ") + opponent.name));
      item.append(matchup);
      let result;
      if (game.status === "final") {
        const own = isHome ? game.home_score : game.away_score;
        const other = isHome ? game.away_score : game.home_score;
        result = (own > other ? "W " : own < other ? "L " : "T ") + own + "–" + other;
      } else result = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(game.kickoff));
      item.append(node("strong", result, "team-game-result"));
      container.append(item);
    });
    el("[data-schedule-count]").textContent = data.games.length + " games";
  }

  function renderInjuries(data) {
    const section = el("[data-team-injuries-section]");
    if (!data.injuries.length) return;
    section.hidden = false;
    data.injuries.forEach((injury) => {
      const row = node("div", null, "team-injury-row");
      row.append(node("strong", injury.player), node("span", injury.status + (injury.detail ? " · " + injury.detail : "")));
      el("[data-team-injuries]").append(row);
    });
    el("[data-injury-count]").textContent = data.injuries.length + " active";
  }

  function renderPlayer(player) {
    const card = node("a", null, "player-card");
    card.href = app.dataset.playerUrl + "?view=player-v2&team=" + encodeURIComponent(app.dataset.teamId) + "&id=" + encodeURIComponent(player.id);
    card.setAttribute("aria-label", "View " + player.name + " player page");
    card.append(image(player.headshot_url, player.name + " headshot", "player-headshot"));
    const copy = node("div", null, "player-copy");
    const heading = node("div", null, "player-heading");
    const depthLabel = player.depth_rank ? (player.depth_position || player.position) + player.depth_rank : "";
    heading.append(node("strong", player.name), node("span", [player.number ? "#" + player.number : "", player.position, depthLabel].filter(Boolean).join(" · ")));
    copy.append(heading);
    const bio = [formattedHeight(player.height), player.weight ? player.weight + " lb" : "", player.experience ? player.experience + " exp" : ""].filter(Boolean).join(" · ");
    if (bio) copy.append(node("p", bio, "player-bio"));
    const stats = node("dl", null, "player-stats");
    Object.entries(player.stats || {}).forEach(([key, value]) => {
      if (!statLabels[key]) return;
      const group = node("div"); group.append(node("dt", statLabels[key]), node("dd", value)); stats.append(group);
    });
    if (stats.children.length) copy.append(stats);
    card.append(copy);
    return card;
  }

  function renderRoster(data) {
    const grouped = new Map();
    data.players.forEach((player) => { if (!grouped.has(player.group)) grouped.set(player.group, []); grouped.get(player.group).push(player); });
    groupsOrder.forEach((groupName) => {
      const players = grouped.get(groupName);
      if (!players || !players.length) return;
      players.sort((a, b) => (a.depth_order ?? 999) - (b.depth_order ?? 999) || String(a.depth_position || a.position).localeCompare(String(b.depth_position || b.position)) || (a.depth_rank ?? 999) - (b.depth_rank ?? 999) || a.name.localeCompare(b.name));
      const section = node("details", null, "roster-group team-collapsible");
      const summary = node("summary", null, "team-collapse-summary roster-group-summary");
      summary.append(node("span", groupName, "team-section-title"), node("span", players.length + " players", "roster-group-count"));
      section.append(summary);
      const grid = node("div", null, "player-grid");
      players.forEach((player) => grid.append(renderPlayer(player)));
      section.append(grid); el("[data-roster-groups]").append(section);
      setupDisclosure(section, "position-v2:" + groupName, false);
    });
    el("[data-roster-count]").textContent = data.players.length + " players";
    setupRosterToggle();
  }

  fetch(app.dataset.dataUrl, { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      const defaultGradient = gradientBackground(jerseyGradient(data.team, ""));
      app.style.setProperty("--team-page-gradient", defaultGradient);
      document.body.classList.add("team-themed-page");
      document.body.style.setProperty("--team-background-gradient", "linear-gradient(rgba(7,10,18,.76),rgba(7,10,18,.9))," + defaultGradient);
      el("[data-team-logo]").append(image(data.team.logo_url, data.team.name + " logo", "team-page-logo-image"));
      el("[data-season-label]").textContent = data.season + " NFL season";
      el("[data-team-record]").textContent = data.team.record || "0-0";
      el("[data-team-updated]").textContent = "Updated " + new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(data.generated_at));
      app.querySelectorAll("details[data-collapse-key]").forEach((details) => setupDisclosure(details, details.dataset.collapseKey, true, details.dataset.collapseKey !== "schedule"));
      renderSchedule(data); renderInjuries(data); renderRoster(data);
    })
    .catch(() => { el("[data-team-updated]").textContent = "Data unavailable"; const notice = el("[data-team-notice]"); notice.hidden = false; notice.textContent = "This team snapshot could not be loaded."; });
}());
