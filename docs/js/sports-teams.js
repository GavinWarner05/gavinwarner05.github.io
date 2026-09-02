(function () {
  "use strict";

  const app = document.querySelector("[data-team-directory]");
  if (!app) return;
  const directory = app.querySelector(".team-directory");
  if (!directory) return;

  const divisions = {
    NFC: { East: ["dal", "nyg", "phi", "was"], North: ["chi", "det", "gb", "min"], South: ["atl", "car", "no", "tb"], West: ["ari", "lar", "sf", "sea"] },
    AFC: { East: ["buf", "mia", "ne", "nyj"], North: ["bal", "cin", "cle", "pit"], South: ["hou", "ind", "jax", "ten"], West: ["den", "kc", "lv", "lac"] }
  };
  const directoryPalettes = {
    gb: ["#203731", "#FFB612", 70],
    ind: ["#002C5F", "#A2AAAD", 78],
    lar: ["#003594", "#FFA300", 72]
  };

  function recordsFrom(games, teams) {
    const records = new Map();
    teams.forEach((team, id) => records.set(id, { wins: 0, losses: 0, ties: 0, name: team.name }));
    games.filter((game) => game.status === "final" && game.season_phase === "Regular Season").forEach((game) => {
      const away = records.get(game.away_team.id);
      const home = records.get(game.home_team.id);
      if (!away || !home || game.away_score == null || game.home_score == null) return;
      if (game.away_score > game.home_score) { away.wins += 1; home.losses += 1; }
      else if (game.home_score > game.away_score) { home.wins += 1; away.losses += 1; }
      else { away.ties += 1; home.ties += 1; }
    });
    return records;
  }

  function winPercentage(record) {
    const games = record.wins + record.losses + record.ties;
    return games ? (record.wins + record.ties * 0.5) / games : 0;
  }

  function recordLabel(record) {
    return record.wins + "–" + record.losses + (record.ties ? "–" + record.ties : "");
  }

  fetch(app.dataset.dataUrl, { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then((data) => {
      const teams = new Map();
      data.games.forEach((game) => {
        teams.set(game.away_team.id, game.away_team);
        teams.set(game.home_team.id, game.home_team);
      });
      const cards = new Map();
      directory.querySelectorAll("[data-team-id]").forEach((card) => {
        const team = teams.get(card.dataset.teamId);
        if (!team) return;
        cards.set(team.id, card);
        const palette = directoryPalettes[team.id];
        const primary = palette ? palette[0] : (team.colors && team.colors.primary ? team.colors.primary : "#334155");
        const secondary = palette ? palette[1] : (team.colors && team.colors.secondary ? team.colors.secondary : "#0f172a");
        const gradient = palette
          ? "linear-gradient(135deg," + primary + " 0%," + primary + " " + palette[2] + "%," + secondary + " 100%)"
          : "linear-gradient(135deg," + primary + "," + secondary + ")";
        card.style.setProperty("--directory-team-gradient", gradient);
        const image = document.createElement("img");
        image.className = "team-directory-logo";
        image.src = team.logo_url;
        image.alt = "";
        image.width = 64;
        image.height = 64;
        image.loading = "lazy";
        image.addEventListener("error", function () { image.remove(); }, { once: true });
        card.querySelector(".team-directory-logo-slot").replaceChildren(image);
      });

      const records = recordsFrom(data.games, teams);
      const fragment = document.createDocumentFragment();
      Object.entries(divisions).forEach(([conferenceName, conferenceDivisions]) => {
        const conference = document.createElement("section");
        conference.className = "team-conference";
        const heading = document.createElement("h2");
        heading.textContent = conferenceName;
        conference.append(heading);
        const divisionGrid = document.createElement("div");
        divisionGrid.className = "team-division-grid";
        Object.entries(conferenceDivisions).forEach(([divisionName, teamIds]) => {
          const division = document.createElement("section");
          division.className = "team-division";
          const divisionHeading = document.createElement("h3");
          divisionHeading.textContent = conferenceName + " " + divisionName;
          division.append(divisionHeading);
          const list = document.createElement("div");
          list.className = "team-division-list";
          teamIds.slice().sort((leftId, rightId) => {
            const left = records.get(leftId);
            const right = records.get(rightId);
            return winPercentage(right) - winPercentage(left) || right.wins - left.wins || left.name.localeCompare(right.name);
          }).forEach((teamId) => {
            const card = cards.get(teamId);
            const record = records.get(teamId);
            if (!card || !record) return;
            const details = document.createElement("span");
            details.className = "team-directory-standing";
            details.textContent = recordLabel(record);
            details.setAttribute("aria-label", "Record " + recordLabel(record));
            card.append(details);
            list.append(card);
          });
          division.append(list);
          divisionGrid.append(division);
        });
        conference.append(divisionGrid);
        fragment.append(conference);
      });
      directory.replaceChildren(fragment);
    })
    .catch(() => { /* Text links remain fully usable when the snapshot is unavailable. */ });
}());
