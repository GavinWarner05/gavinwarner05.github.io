(function () {
  "use strict";

  const app = document.querySelector("[data-standings-app]");
  if (!app) return;

  const structure = {
    AFC: {
      East: ["buf", "mia", "ne", "nyj"],
      North: ["bal", "cin", "cle", "pit"],
      South: ["hou", "ind", "jax", "ten"],
      West: ["den", "kc", "lv", "lac"]
    },
    NFC: {
      East: ["dal", "nyg", "phi", "was"],
      North: ["chi", "det", "gb", "min"],
      South: ["atl", "car", "no", "tb"],
      West: ["ari", "lar", "sf", "sea"]
    }
  };
  const teamMeta = new Map();
  Object.entries(structure).forEach(([conference, divisions]) => {
    Object.entries(divisions).forEach(([division, ids]) => ids.forEach((id) => teamMeta.set(id, { conference: conference, division: division })));
  });

  const els = {
    updated: app.querySelector("[data-standings-updated]"),
    topSeeds: app.querySelector("[data-standings-top-seeds]"),
    content: app.querySelector("[data-standings-content]"),
    notice: app.querySelector("[data-standings-notice]"),
    note: app.querySelector("[data-standings-note]"),
    tabs: Array.from(app.querySelectorAll("[data-standings-view]"))
  };
  const state = { data: null, teams: null, records: null, conferences: null, view: "overview" };

  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }

  function blankSplit() { return { wins: 0, losses: 0, ties: 0 }; }

  function winPercentage(record) {
    const games = record.wins + record.losses + record.ties;
    return games ? (record.wins + record.ties * 0.5) / games : 0;
  }

  function percentageLabel(record) {
    const games = record.wins + record.losses + record.ties;
    if (!games) return ".000";
    return winPercentage(record).toFixed(3).replace(/^0/, "");
  }

  function recordLabel(record) {
    return record.wins + "–" + record.losses + (record.ties ? "–" + record.ties : "");
  }

  function addResult(record, ownScore, otherScore) {
    if (ownScore > otherScore) record.wins += 1;
    else if (ownScore < otherScore) record.losses += 1;
    else record.ties += 1;
  }

  function resultLetter(ownScore, otherScore) {
    return ownScore > otherScore ? "W" : ownScore < otherScore ? "L" : "T";
  }

  function buildRecords(data, teams) {
    const records = new Map();
    teams.forEach((team, id) => records.set(id, {
      team: team,
      conference: teamMeta.get(id).conference,
      division: teamMeta.get(id).division,
      wins: 0,
      losses: 0,
      ties: 0,
      conferenceRecord: blankSplit(),
      divisionRecord: blankSplit(),
      pointsFor: 0,
      pointsAgainst: 0,
      results: []
    }));
    data.games.slice().sort((left, right) => new Date(left.kickoff) - new Date(right.kickoff)).filter((game) => {
      return game.status === "final" && game.season_phase === "Regular Season" && game.away_score != null && game.home_score != null;
    }).forEach((game) => {
      const away = records.get(game.away_team.id);
      const home = records.get(game.home_team.id);
      if (!away || !home) return;
      [[away, home, game.away_score, game.home_score], [home, away, game.home_score, game.away_score]].forEach(([record, opponent, ownScore, otherScore]) => {
        addResult(record, ownScore, otherScore);
        record.pointsFor += ownScore;
        record.pointsAgainst += otherScore;
        record.results.push(resultLetter(ownScore, otherScore));
        if (record.conference === opponent.conference) addResult(record.conferenceRecord, ownScore, otherScore);
        if (record.conference === opponent.conference && record.division === opponent.division) addResult(record.divisionRecord, ownScore, otherScore);
      });
    });
    return records;
  }

  function compareRecords(left, right) {
    return winPercentage(right) - winPercentage(left)
      || right.wins - left.wins
      || winPercentage(right.conferenceRecord) - winPercentage(left.conferenceRecord)
      || (right.pointsFor - right.pointsAgainst) - (left.pointsFor - left.pointsAgainst)
      || right.pointsFor - left.pointsFor
      || left.team.name.localeCompare(right.team.name);
  }

  function compareDivisionRecords(left, right) {
    return winPercentage(right) - winPercentage(left)
      || right.wins - left.wins
      || winPercentage(right.divisionRecord) - winPercentage(left.divisionRecord)
      || winPercentage(right.conferenceRecord) - winPercentage(left.conferenceRecord)
      || (right.pointsFor - right.pointsAgainst) - (left.pointsFor - left.pointsAgainst)
      || right.pointsFor - left.pointsFor
      || left.team.name.localeCompare(right.team.name);
  }

  function conferenceEntries(conference, records) {
    const conferenceRecords = Array.from(records.values()).filter((record) => record.conference === conference);
    const divisionLeaders = Object.values(structure[conference]).map((ids) => {
      return ids.map((id) => records.get(id)).filter(Boolean).sort(compareDivisionRecords)[0];
    }).filter(Boolean).sort(compareRecords);
    const leaderIds = new Set(divisionLeaders.map((record) => record.team.id));
    const remaining = conferenceRecords.filter((record) => !leaderIds.has(record.team.id)).sort(compareRecords);
    return divisionLeaders.concat(remaining).map((record, index) => ({
      record: record,
      rank: index + 1,
      status: index < 4 ? "division" : index < 7 ? "wildcard" : index < 10 ? "hunt" : "outside"
    }));
  }

  function streakLabel(record) {
    if (!record.results.length) return "—";
    const latest = record.results[record.results.length - 1];
    let count = 0;
    for (let index = record.results.length - 1; index >= 0 && record.results[index] === latest; index -= 1) count += 1;
    return latest + count;
  }

  function teamLogo(team, className) {
    const image = document.createElement("img");
    image.className = className;
    image.src = team.logo_url;
    image.alt = "";
    image.width = 56;
    image.height = 56;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", function () { image.replaceWith(node("span", team.abbreviation, className + " image-fallback")); }, { once: true });
    return image;
  }

  function statusBadge(status) {
    const labels = { division: "DIV", wildcard: "WC", hunt: "HUNT", outside: "" };
    const descriptions = { division: "Division leader", wildcard: "Wild card", hunt: "In the hunt", outside: "" };
    if (!labels[status]) return null;
    const badge = node("span", labels[status], "standings-status is-" + status);
    badge.title = descriptions[status];
    badge.setAttribute("aria-label", descriptions[status]);
    return badge;
  }

  function teamCell(entry) {
    const record = entry.record;
    const link = document.createElement("a");
    link.className = "standings-team-link";
    link.href = app.dataset.teamBaseUrl + record.team.id + "/";
    link.append(teamLogo(record.team, "standings-team-logo"));
    const identity = document.createElement("span");
    identity.className = "standings-team-identity";
    identity.append(node("strong", record.team.name, "standings-team-name"), node("strong", record.team.abbreviation, "standings-team-abbreviation"), node("small", record.conference + " " + record.division));
    link.append(identity);
    const badge = statusBadge(entry.status);
    if (badge) link.append(badge);
    return link;
  }

  function formCell(record) {
    const form = document.createElement("span");
    form.className = "standings-form";
    const results = record.results.slice(-5);
    if (!results.length) form.append(node("span", "—", "is-empty"));
    else results.forEach((result) => form.append(node("span", result, "is-" + result.toLowerCase())));
    return form;
  }

  function cell(value, className) {
    const td = node("td", value, className);
    return td;
  }

  function standingsTable(entries, options) {
    const compact = Boolean(options && options.compact);
    const table = document.createElement("table");
    table.className = "standings-table" + (compact ? " is-compact" : "");
    const caption = node("caption", options.caption, "sr-only");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const headings = compact
      ? [["Seed", "standings-col-rank"], ["Team", "standings-col-team"], ["Record", "standings-col-record"], ["Diff", "standings-col-diff"], ["Form", "standings-col-form"]]
      : [[options.rankLabel || "Seed", "standings-col-rank"], ["Team", "standings-col-team"], ["W-L-T", "standings-col-record"], ["PCT", "standings-col-pct"], ["CONF", "standings-col-conference"], ["DIV", "standings-col-division"], ["PF", "standings-col-pf"], ["PA", "standings-col-pa"], ["DIFF", "standings-col-diff"], ["STRK", "standings-col-streak"], ["L5", "standings-col-form"]];
    headings.forEach(([label, className]) => {
      const th = node("th", label, className);
      th.scope = "col";
      headRow.append(th);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    entries.forEach((entry, index) => {
      const record = entry.record;
      const row = document.createElement("tr");
      row.className = "standings-team-row" + (entry.status === "division" || entry.status === "wildcard" ? " is-playoff" : "");
      row.dataset.teamId = record.team.id;
      const rank = document.createElement("th");
      rank.scope = "row";
      rank.className = "standings-col-rank";
      rank.append(node("span", entry.rank, "standings-rank"));
      const team = document.createElement("td");
      team.className = "standings-col-team";
      team.append(teamCell(entry));
      const differential = record.pointsFor - record.pointsAgainst;
      row.append(rank, team, cell(recordLabel(record), "standings-col-record"));
      if (compact) {
        row.append(cell((differential > 0 ? "+" : "") + differential, "standings-col-diff"));
        const form = document.createElement("td"); form.className = "standings-col-form"; form.append(formCell(record)); row.append(form);
      } else {
        row.append(
          cell(percentageLabel(record), "standings-col-pct"),
          cell(recordLabel(record.conferenceRecord), "standings-col-conference"),
          cell(recordLabel(record.divisionRecord), "standings-col-division"),
          cell(record.pointsFor, "standings-col-pf"),
          cell(record.pointsAgainst, "standings-col-pa"),
          cell((differential > 0 ? "+" : "") + differential, "standings-col-diff"),
          cell(streakLabel(record), "standings-col-streak")
        );
        const form = document.createElement("td"); form.className = "standings-col-form"; form.append(formCell(record)); row.append(form);
      }
      body.append(row);
      if (options.playoffCutline && index === 6) {
        const divider = document.createElement("tr");
        divider.className = "standings-playoff-cutline";
        const label = cell("Playoff cutline", "");
        label.colSpan = headings.length;
        divider.append(label);
        body.append(divider);
      }
    });
    table.append(caption, head, body);
    return table;
  }

  function conferencePanel(conference) {
    const panel = document.createElement("section");
    panel.className = "standings-conference-panel is-" + conference.toLowerCase();
    const heading = document.createElement("div");
    heading.className = "standings-panel-heading";
    const copy = document.createElement("div");
    copy.append(node("p", conference + " playoff picture", "sports-home-kicker"), node("h2", conference));
    const button = node("button", "Full " + conference + " table →");
    button.type = "button";
    button.addEventListener("click", function () { selectView(conference.toLowerCase()); });
    heading.append(copy, button);
    const scroll = document.createElement("div");
    scroll.className = "standings-table-shell";
    scroll.append(standingsTable(state.conferences[conference], { compact: true, caption: conference + " standings", playoffCutline: true }));
    panel.append(heading, scroll);
    return panel;
  }

  function renderOverview() {
    const intro = document.createElement("div");
    intro.className = "standings-view-intro";
    const copy = document.createElement("div");
    copy.append(node("p", "If the season ended today", "sports-home-kicker"), node("h2", "Playoff picture"));
    intro.append(copy, standingsLegend());
    const grid = document.createElement("div");
    grid.className = "standings-conference-grid";
    grid.append(conferencePanel("AFC"), conferencePanel("NFC"));
    els.content.replaceChildren(intro, grid);
  }

  function standingsLegend() {
    const legend = document.createElement("div");
    legend.className = "standings-legend";
    [["DIV", "Division leader", "division"], ["WC", "Wild card", "wildcard"], ["HUNT", "In the hunt", "hunt"]].forEach(([shortLabel, label, type]) => {
      const item = document.createElement("span");
      item.append(node("b", shortLabel, "is-" + type), document.createTextNode(label));
      legend.append(item);
    });
    return legend;
  }

  function renderDetailed(view) {
    const isLeague = view === "league";
    const conference = view.toUpperCase();
    const entries = isLeague
      ? Array.from(state.records.values()).sort(compareRecords).map((record, index) => ({ record: record, rank: index + 1, status: "outside" }))
      : state.conferences[conference];
    const intro = document.createElement("div");
    intro.className = "standings-view-intro";
    const copy = document.createElement("div");
    copy.append(node("p", isLeague ? "All 32 teams" : conference + " conference", "sports-home-kicker"), node("h2", isLeague ? "League standings" : conference + " standings"));
    intro.append(copy);
    if (!isLeague) intro.append(standingsLegend());
    const shell = document.createElement("div");
    shell.className = "standings-table-shell is-detailed";
    shell.append(standingsTable(entries, { caption: isLeague ? "NFL league standings" : conference + " conference standings", playoffCutline: !isLeague, rankLabel: isLeague ? "Rank" : "Seed" }));
    els.content.replaceChildren(intro, shell);
  }

  function renderTopSeeds() {
    const cards = ["AFC", "NFC"].map((conference) => {
      const entry = state.conferences[conference][0];
      const card = document.createElement("a");
      card.className = "standings-top-seed is-" + conference.toLowerCase();
      card.href = app.dataset.teamBaseUrl + entry.record.team.id + "/";
      card.append(node("span", conference + " No. 1", "standings-top-label"), teamLogo(entry.record.team, "standings-top-logo"));
      const copy = document.createElement("span");
      copy.append(node("strong", entry.record.team.name), node("small", recordLabel(entry.record) + " · " + (entry.record.pointsFor - entry.record.pointsAgainst >= 0 ? "+" : "") + (entry.record.pointsFor - entry.record.pointsAgainst) + " point diff"));
      card.append(copy);
      return card;
    });
    els.topSeeds.replaceChildren(...cards);
  }

  function render() {
    els.tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.standingsView === state.view)));
    if (state.view === "overview") renderOverview();
    else renderDetailed(state.view);
    els.content.dataset.view = state.view;
  }

  function selectView(view) {
    if (!state.data || !["overview", "afc", "nfc", "league"].includes(view)) return;
    state.view = view;
    render();
    const url = new URL(window.location.href);
    if (view === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    window.history.replaceState(null, "", url);
    app.querySelector(".standings-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  els.tabs.forEach((tab) => tab.addEventListener("click", function () { selectView(tab.dataset.standingsView); }));

  fetch(app.dataset.dataUrl, { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      const teams = new Map();
      data.games.forEach((game) => {
        if (teamMeta.has(game.away_team.id)) teams.set(game.away_team.id, game.away_team);
        if (teamMeta.has(game.home_team.id)) teams.set(game.home_team.id, game.home_team);
      });
      if (teams.size !== 32) throw new Error("Incomplete team data");
      state.data = data;
      state.teams = teams;
      state.records = buildRecords(data, teams);
      state.conferences = { AFC: conferenceEntries("AFC", state.records), NFC: conferenceEntries("NFC", state.records) };
      const requestedView = new URLSearchParams(window.location.search).get("view");
      state.view = ["afc", "nfc", "league"].includes(requestedView) ? requestedView : "overview";
      const season = Math.min(...data.games.filter((game) => game.season_phase === "Regular Season").map((game) => new Date(game.kickoff).getFullYear()));
      els.updated.textContent = season + " regular season · Updated " + new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.display_timezone || "America/Los_Angeles" }).format(new Date(data.generated_at));
      renderTopSeeds();
      render();
      els.note.hidden = false;
    })
    .catch(() => {
      els.updated.textContent = "Standings unavailable";
      els.notice.hidden = false;
      els.notice.textContent = "The conference standings could not be calculated from the latest sports snapshot. Please try again later.";
      els.content.hidden = true;
    });
}());
