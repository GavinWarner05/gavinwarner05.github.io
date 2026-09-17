(function () {
  "use strict";

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function option(value, label) {
    const element = node("option", label); element.value = value; return element;
  }

  function svgNode(tag, attributes, text) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text != null) element.textContent = text;
    return element;
  }

  function seasonFor(player, snapshot, year) {
    const seasons = player.seasons?.length ? player.seasons : [{ season: snapshot.season, team: snapshot.team, stats: player.stats || {}, weekly_stats: player.weekly_stats || [] }];
    return seasons.find((season) => Number(season.season) === Number(year));
  }

  function statsForPeriod(season, period) {
    if (!season) return {};
    return (period === "season" ? season.stats : season.weekly_stats?.find((week) => String(week.week) === period)?.stats) || {};
  }

  function scoringTouchdowns(stats) {
    const receiving = stats.receiving_tds;
    const rushing = stats.rushing_tds;
    if (receiving == null && rushing == null) return "—";
    return (receiving || 0) + (rushing || 0);
  }

  function shareStatsForComparison(keys, firstStats, secondStats, statLabels) {
    const rows = [];
    let addedTouchdowns = false;
    keys.forEach((key) => {
      if (key === "receiving_tds" || key === "rushing_tds") {
        if (addedTouchdowns) return;
        addedTouchdowns = true;
        const leftValue = scoringTouchdowns(firstStats);
        const rightValue = scoringTouchdowns(secondStats);
        rows.push({ key: "touchdowns", label: "Touchdowns", leftValue, rightValue, value: `${leftValue} / ${rightValue}` });
        return;
      }
      const leftValue = firstStats[key] ?? "—";
      const rightValue = secondStats[key] ?? "—";
      rows.push({ key, label: statLabels[key], leftValue, rightValue, value: `${leftValue} / ${rightValue}` });
    });
    return rows;
  }

  function table(headers, rows, caption) {
    const result = node("table", null, "player-insight-table");
    result.append(node("caption", caption));
    const head = node("thead"); const heading = node("tr");
    headers.forEach((label) => { const cell = node("th", label); cell.scope = "col"; heading.append(cell); });
    head.append(heading); result.append(head);
    const body = node("tbody");
    rows.forEach((values) => {
      const row = node("tr");
      values.forEach((value, index) => { const cell = node(index === 0 ? "th" : "td", value); if (!index) cell.scope = "row"; row.append(cell); });
      body.append(row);
    });
    result.append(body); return result;
  }

  function mount(app, snapshot, player, helpers) {
    const { statLabels, orderedStats, optimizedHeadshot } = helpers;
    const el = (selector) => app.querySelector(selector);
    const metric = el("[data-chart-stat]");
    const teamSelect = el("[data-comparison-team]");
    const playerSelect = el("[data-comparison-player]");
    const periodSelect = el("[data-comparison-period]");
    const share = el("[data-comparison-share]");
    const status = el("[data-comparison-status]");
    const retry = el("[data-comparison-retry]");
    const cache = new Map([[snapshot.team.id, snapshot]]);
    let currentSeason; let otherSnapshot; let otherPlayer; let shareData; let requestVersion = 0;

    function renderChart() {
      const weeks = (currentSeason.weekly_stats || []).slice().sort((a, b) => a.week - b.week);
      const key = metric.value;
      const host = el("[data-player-chart]"); host.replaceChildren();
      const summary = el("[data-chart-summary]");
      const points = weeks.filter((week) => Number.isFinite(week.stats?.[key]));
      el("[data-chart-details]").hidden = !points.length;
      el("[data-chart-table]").replaceChildren();
      if (!points.length) {
        summary.textContent = "Weekly performance will appear once statistics are available for this season.";
        return;
      }
      const label = statLabels[key];
      summary.textContent = `${currentSeason.season} · ${label} by week. Select a bar for its value. Gaps mean no reported value. Scroll the chart to see later weeks.`;
      el("[data-chart-table]").append(table(["Week", "Opponent", label], weeks.map((week) => [week.week, week.opponent || "—", week.stats?.[key] ?? "—"]), `${currentSeason.season} weekly ${label.toLowerCase()}`));
      const lastWeek = Math.max(...weeks.map((week) => week.week));
      const width = Math.max(620, lastWeek * 42 + 80); const height = 280;
      const left = 58; const right = width - 20; const top = 22; const bottom = 230;
      const low = Math.min(0, ...points.map((week) => week.stats[key]));
      const high = Math.max(0, ...points.map((week) => week.stats[key])) || (low < 0 ? 0 : 1);
      const scaleY = (value) => bottom - (value - low) / (high - low) * (bottom - top);
      const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "group", "aria-label": `${player.name}, ${currentSeason.season}, weekly ${label.toLowerCase()}` });
      const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
      [low, (low + high) / 2, high].forEach((value) => {
        const y = scaleY(value);
        svg.append(svgNode("line", { x1: left, x2: right, y1: y, y2: y, class: "player-chart-grid" }));
        svg.append(svgNode("text", { x: left - 10, y: y + 4, "text-anchor": "end", class: "player-chart-label" }, formatter.format(value)));
      });
      svg.append(svgNode("line", { x1: left, x2: right, y1: scaleY(0), y2: scaleY(0), class: "player-chart-baseline" }));
      const step = (right - left) / lastWeek;
      for (let week = 1; week <= lastWeek; week++) {
        svg.append(svgNode("text", { x: left + (week - .5) * step, y: 255, "text-anchor": "middle", class: "player-chart-label" }, `W${week}`));
      }
      points.forEach((week) => {
        const value = week.stats[key]; const x = left + (week.week - .5) * step;
        const description = `Week ${week.week}${week.opponent ? ` vs. ${week.opponent}` : ""}: ${value} ${label.toLowerCase()}`;
        const bar = svgNode("rect", { x: x - Math.min(28, step * .62) / 2, y: value === 0 ? scaleY(0) - 3 : Math.min(scaleY(0), scaleY(value)), width: Math.min(28, step * .62), height: Math.max(3, Math.abs(scaleY(value) - scaleY(0))), rx: 3, class: "player-chart-bar", tabindex: 0, role: "img", "aria-label": description });
        bar.append(svgNode("title", {}, description));
        ["mouseenter", "focus", "click"].forEach((event) => bar.addEventListener(event, () => { summary.textContent = description; }));
        svg.append(bar);
      });
      host.append(svg);
    }

    function updateChart() {
      const previous = metric.value;
      const stats = Object.assign({}, ...(currentSeason.weekly_stats || []).map((week) => week.stats));
      const keys = orderedStats(player, stats, true);
      metric.replaceChildren(...keys.map((key) => option(key, statLabels[key])));
      metric.disabled = !keys.length;
      if (!keys.length) metric.append(option("", "No weekly stats"));
      const preferred = { QB: "passing_yards", RB: "rushing_yards", FB: "rushing_yards", WR: "receiving_yards", TE: "receiving_yards", K: "field_goals_made" }[player.position] || "def_tackles_solo";
      metric.value = keys.includes(previous) ? previous : keys.includes(preferred) ? preferred : keys[0] || "";
      el("[data-chart-season]").textContent = currentSeason.season;
      renderChart();
    }

    function renderComparison() {
      shareData = null; share.disabled = true;
      el("[data-comparison-identities]").replaceChildren();
      el("[data-comparison-table]").replaceChildren();
      if (!currentSeason || !otherPlayer) return;
      const secondSeason = seasonFor(otherPlayer, otherSnapshot, currentSeason.season);
      const period = periodSelect.value;
      const firstStats = statsForPeriod(currentSeason, period);
      const secondStats = statsForPeriod(secondSeason, period);
      const teams = [currentSeason.team || snapshot.team, secondSeason?.team || otherSnapshot.team];
      const players = [player, otherPlayer]; const seasons = [currentSeason, secondSeason];
      players.forEach((entry, index) => {
        const card = node("div", null, "player-comparison-person");
        if (entry.headshot_url) {
          const portrait = node("img"); portrait.src = optimizedHeadshot(entry.headshot_url, 240); portrait.alt = ""; portrait.width = 64; portrait.height = 64;
          portrait.addEventListener("error", () => { portrait.hidden = true; }, { once: true }); card.append(portrait);
        }
        const identity = node("div"); identity.append(node("strong", entry.name));
        const week = seasons[index]?.weekly_stats?.find((week) => String(week.week) === period);
        const context = period === "season" ? (seasons[index] ? `${currentSeason.season} season` : "Season unavailable") : week ? (week.opponent ? `vs. ${week.opponent}` : `Week ${period}`) : "No recorded week";
        identity.append(node("span", `${teams[index].abbreviation} · ${entry.position || "NFL"} · ${context}`));
        card.append(identity); el("[data-comparison-identities]").append(card);
      });
      const keys = orderedStats(player, Object.assign({}, secondStats, firstStats), true);
      const periodLabel = `${currentSeason.season} · ${period === "season" ? "Season totals" : `Week ${period}`}`;
      status.textContent = !secondSeason ? `${otherPlayer.name} has no ${currentSeason.season} season data. Choose another player or season.` : !keys.length ? `No recorded stats for ${periodLabel.toLowerCase()}.` : `${periodLabel}. A dash means no reported value; zero means a recorded zero.`;
      if (!keys.length) return;
      el("[data-comparison-table]").append(table(["Stat", player.name, otherPlayer.name], keys.map((key) => [statLabels[key], firstStats[key] ?? "—", secondStats[key] ?? "—"]), periodLabel));
      // Both players must have reported data before a comparison can be shared.
      if (!Object.keys(firstStats).length || !Object.keys(secondStats).length) return;
      const available = shareStatsForComparison(keys, firstStats, secondStats, statLabels);
      shareData = {
        players: players.map((entry) => Object.assign({}, entry, { headshot_url: optimizedHeadshot(entry.headshot_url, 640) })),
        teams, season: currentSeason.season, periodLabel,
        contexts: seasons.map((season) => {
          const opponent = season.weekly_stats?.find((week) => String(week.week) === period)?.opponent;
          return period === "season" ? "SEASON TOTALS" : opponent ? `VS. ${opponent}` : `WEEK ${period}`;
        }),
        stats: available.slice(0, 4), availableStats: available,
        title: `${player.name} vs. ${otherPlayer.name} · ${periodLabel}`,
        filename: `${players.map((entry) => entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join('-vs-')}-${currentSeason.season}-${period === "season" ? "season" : `week-${period}`}.png`
      };
      share.disabled = false;
    }

    function updatePeriods() {
      const previous = periodSelect.value;
      const secondSeason = otherPlayer && seasonFor(otherPlayer, otherSnapshot, currentSeason.season);
      const weeks = [...new Set([...(currentSeason.weekly_stats || []), ...(secondSeason?.weekly_stats || [])].map((week) => week.week))].sort((a, b) => a - b);
      periodSelect.replaceChildren(option("season", "Season totals"), ...weeks.map((week) => option(String(week), `Week ${week}`)));
      periodSelect.value = weeks.some((week) => String(week) === previous) ? previous : "season";
      periodSelect.disabled = !otherPlayer;
      renderComparison();
    }

    async function loadTeam() {
      const version = ++requestVersion; const id = teamSelect.value;
      otherPlayer = null; otherSnapshot = null; shareData = null;
      playerSelect.replaceChildren(option("", "Loading players…")); playerSelect.disabled = true;
      periodSelect.disabled = true; share.disabled = true; retry.hidden = true;
      el("[data-comparison-identities]").replaceChildren(); el("[data-comparison-table]").replaceChildren();
      status.textContent = "Loading roster…";
      try {
        let data = cache.get(id);
        if (!data) {
          const response = await fetch(app.dataset.teamDataBaseUrl + encodeURIComponent(id) + ".json", { headers: { Accept: "application/json" }, cache: "no-cache" });
          if (!response.ok) throw new Error("Roster unavailable");
          data = await response.json();
          if (!data.team || !Array.isArray(data.players)) throw new Error("Invalid roster");
          cache.set(id, data);
        }
        if (version !== requestVersion) return;
        otherSnapshot = data;
        const seen = new Set([player.id]);
        const players = (data.players || []).concat(data.injury_players || []).filter((entry) => { if (seen.has(entry.id)) return false; seen.add(entry.id); return true; }).sort((a, b) => a.name.localeCompare(b.name));
        playerSelect.replaceChildren(option("", "Choose a player"), ...players.map((entry) => option(entry.id, `${entry.name} · ${entry.position || "NFL"}`)));
        playerSelect.disabled = !players.length;
        status.textContent = players.length ? "Choose a player to compare." : "No other players are available on this roster.";
      } catch (_) {
        if (version !== requestVersion) return;
        playerSelect.replaceChildren(option("", "Roster unavailable"));
        status.textContent = "This roster could not be loaded. Try again or choose another team.";
        retry.hidden = false;
      }
    }

    metric.addEventListener("change", renderChart);
    teamSelect.value = snapshot.team.id;
    teamSelect.addEventListener("change", loadTeam);
    retry.addEventListener("click", loadTeam);
    playerSelect.addEventListener("change", () => {
      otherPlayer = (otherSnapshot?.players || []).concat(otherSnapshot?.injury_players || []).find((entry) => entry.id === playerSelect.value);
      if (!otherPlayer) status.textContent = "Choose a player to compare.";
      updatePeriods();
    });
    periodSelect.addEventListener("change", renderComparison);
    share.addEventListener("click", () => { if (shareData && window.SportsShare) window.SportsShare.comparison(shareData); });
    loadTeam();
    return { updateSeason(season) { const changed = currentSeason?.season !== season.season; currentSeason = season; if (changed) periodSelect.value = "season"; updateChart(); updatePeriods(); } };
  }

  window.SportsPlayerInsights = { mount };
}());
