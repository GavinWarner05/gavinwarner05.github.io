(function () {
  "use strict";

  const SIZE = 1080;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const state = { blob: null, filename: "sports-center-card.png", title: "NFL Sports Center" };

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  }

  function rounded(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fillRound(ctx, x, y, width, height, radius, color) {
    rounded(ctx, x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function background(ctx, primary, secondary) {
    const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    gradient.addColorStop(0, safeColor(primary, "#4f2683"));
    gradient.addColorStop(.52, safeColor(secondary, "#24143d"));
    gradient.addColorStop(1, "#090b14");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const glow = ctx.createRadialGradient(880, 130, 10, 880, 130, 690);
    glow.addColorStop(0, "rgba(255,255,255,.22)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const lowerGlow = ctx.createRadialGradient(145, 980, 20, 145, 980, 580);
    lowerGlow.addColorStop(0, "rgba(0,0,0,.04)");
    lowerGlow.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = lowerGlow;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.save();
    const panel = ctx.createLinearGradient(0, 0, SIZE, 0);
    panel.addColorStop(0, "rgba(5,8,18,.28)");
    panel.addColorStop(1, "rgba(255,255,255,.045)");
    ctx.fillStyle = panel;
    ctx.beginPath(); ctx.moveTo(0, 565); ctx.lineTo(700, 500); ctx.lineTo(SIZE, 610); ctx.lineTo(SIZE, SIZE); ctx.lineTo(0, SIZE); ctx.closePath(); ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.1)";
    for (let y = 110; y < 500; y += 24) {
      for (let x = 700; x < 1040; x += 24) {
        const distance = Math.hypot(x - 900, y - 250);
        if (distance < 230) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,.1)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(1040, 70, 310, .35 * Math.PI, 1.15 * Math.PI); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(1040, 70, 260, .35 * Math.PI, 1.15 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function watermark(ctx, image, x, y, width, height) {
    if (!image) return;
    ctx.save();
    ctx.globalAlpha = .075;
    contain(ctx, image, x, y, width, height);
    ctx.restore();
  }

  function text(ctx, value, x, y, size, weight, color, align) {
    ctx.font = `${weight || 600} ${size}px ${FONT}`;
    ctx.fillStyle = color || "#fff";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(value || ""), x, y);
  }

  function fitText(ctx, value, maxWidth, startSize, minimum, weight) {
    let size = startSize;
    while (size > minimum) {
      ctx.font = `${weight || 700} ${size}px ${FONT}`;
      if (ctx.measureText(value).width <= maxWidth) return size;
      size -= 2;
    }
    return minimum;
  }

  function wrap(ctx, value, x, y, maxWidth, lineHeight, maximumLines) {
    const words = String(value || "").split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? line + " " + word : word;
      if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
      else line = candidate;
    });
    if (line) lines.push(line);
    lines.slice(0, maximumLines || lines.length).forEach((entry, index) => ctx.fillText(entry, x, y + index * lineHeight));
    return Math.min(lines.length, maximumLines || lines.length);
  }

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = function () { resolve(image); };
      image.onerror = function () { resolve(null); };
      image.src = url;
    });
  }

  function contain(ctx, image, x, y, width, height) {
    if (!image) return;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale; const h = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
  }

  function coverBottom(ctx, image, x, y, width, height) {
    if (!image) return;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale; const h = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - w) / 2, y + height - h, w, h);
  }

  function brand(ctx, label) {
    text(ctx, "NFL SPORTS CENTER", 64, 72, 25, 800, "rgba(255,255,255,.76)");
    text(ctx, label, 1016, 72, 23, 700, "rgba(255,255,255,.62)", "right");
  }

  function statsForCard(items) {
    return (items || []).filter((item) => item && item.value != null && item.value !== "").slice(0, 4);
  }

  function statGrid(ctx, stats, startY) {
    const items = statsForCard(stats);
    if (!items.length) {
      fillRound(ctx, 64, startY, 952, 150, 28, "rgba(8,9,18,.42)");
      text(ctx, "Statistics will appear after the first recorded game.", 96, startY + 88, 27, 650, "rgba(255,255,255,.74)");
      return;
    }
    const gap = 18; const width = (952 - gap) / 2; const height = 154;
    items.forEach((item, index) => {
      const column = index % 2; const row = Math.floor(index / 2);
      const x = 64 + column * (width + gap); const y = startY + row * (height + gap);
      fillRound(ctx, x, y, width, height, 26, "rgba(8,9,18,.48)");
      text(ctx, String(item.label || "STAT").toUpperCase(), x + 28, y + 43, 20, 800, "rgba(255,255,255,.68)");
      const valueSize = fitText(ctx, String(item.value), width - 56, 58, 34, 800);
      text(ctx, item.value, x + 28, y + 116, valueSize, 800, "#fff");
    });
  }

  async function drawPlayer(canvas, data) {
    const ctx = canvas.getContext("2d");
    const team = data.team || {};
    background(ctx, team.colors?.primary, team.colors?.secondary);
    brand(ctx, data.week ? `${data.season} · WEEK ${data.week.week}` : `${data.season} SEASON`);
    const [headshot, logo] = await Promise.all([loadImage(data.player.headshot_url), loadImage(team.logo_url)]);
    watermark(ctx, logo, -120, 520, 650, 650);
    if (logo) contain(ctx, logo, 64, 105, 82, 82);
    text(ctx, team.abbreviation || "NFL", logo ? 166 : 64, 159, 27, 800, "rgba(255,255,255,.78)");
    if (headshot) {
      ctx.save(); rounded(ctx, 580, 104, 436, 480, 34); ctx.clip();
      const portrait = ctx.createLinearGradient(580, 104, 580, 584);
      portrait.addColorStop(0, "rgba(255,255,255,.12)"); portrait.addColorStop(1, "rgba(0,0,0,.18)");
      ctx.fillStyle = portrait; ctx.fillRect(580, 104, 436, 480);
      coverBottom(ctx, headshot, 580, 104, 436, 480); ctx.restore();
    }
    text(ctx, data.week ? "WEEKLY PERFORMANCE" : "PLAYER SNAPSHOT", 64, 244, 22, 800, "rgba(255,255,255,.66)");
    ctx.font = `800 74px ${FONT}`; ctx.fillStyle = "#fff";
    const nameLines = wrap(ctx, data.player.name, 64, 326, 500, 78, 2);
    const metaY = 326 + nameLines * 78 + 12;
    text(ctx, [data.player.position, data.player.number ? "#" + data.player.number : "", data.player.depth_rank ? (data.player.depth_position || data.player.position) + data.player.depth_rank : ""].filter(Boolean).join("  •  "), 64, metaY, 27, 700, "rgba(255,255,255,.78)");
    if (data.week?.opponent) text(ctx, `VS. ${data.week.opponent}`, 64, metaY + 54, 30, 800, "#fff");
    statGrid(ctx, data.stats, 650);
    text(ctx, "gavinwarner.digital/sports", 64, 1030, 21, 650, "rgba(255,255,255,.55)");
    text(ctx, "SHARE CARD", 1016, 1030, 20, 800, "rgba(255,255,255,.48)", "right");
  }

  function gameStatus(game, timeZone) {
    if (game.status === "final") return "FINAL";
    if (game.status === "halftime") return "HALFTIME";
    if (game.status === "live") return String(game.status_detail || "LIVE").toUpperCase();
    return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timeZone || "America/Los_Angeles" }).format(new Date(game.kickoff));
  }

  async function drawGame(canvas, data) {
    const ctx = canvas.getContext("2d"); const game = data.game; const home = game.home_team; const away = game.away_team;
    const colors = data.colors || home.colors || {};
    background(ctx, colors.primary, colors.secondary);
    brand(ctx, `${String(game.season_phase || "NFL").toUpperCase()} · WEEK ${game.week || "–"}`);
    const [awayLogo, homeLogo] = await Promise.all([loadImage(data.awayLogo || away.logo_url), loadImage(data.homeLogo || home.logo_url)]);
    watermark(ctx, homeLogo, 610, 500, 580, 580);
    watermark(ctx, awayLogo, -130, 570, 510, 510);
    contain(ctx, awayLogo, 95, 170, 230, 210); contain(ctx, homeLogo, 755, 170, 230, 210);
    text(ctx, away.abbreviation, 210, 420, 34, 850, "#fff", "center");
    text(ctx, home.abbreviation, 870, 420, 34, 850, "#fff", "center");
    if (game.away_score != null && game.home_score != null) {
      text(ctx, game.away_score, 360, 350, 92, 850, "#fff", "center");
      text(ctx, "–", 540, 350, 62, 650, "rgba(255,255,255,.65)", "center");
      text(ctx, game.home_score, 720, 350, 92, 850, "#fff", "center");
    } else text(ctx, "AT", 540, 333, 32, 850, "rgba(255,255,255,.66)", "center");
    text(ctx, gameStatus(game, data.timeZone), 540, 500, 30, 800, "#fff", "center");
    const title = `${away.name} at ${home.name}`;
    const titleSize = fitText(ctx, title, 952, 58, 38, 800);
    text(ctx, title, 540, 590, titleSize, 800, "#fff", "center");
    const rows = [
      { label: "NETWORK", value: game.network || "Not announced" },
      { label: "VENUE", value: game.venue || "Not listed" },
      { label: "INJURY REPORT", value: `${(game.injuries || []).length} listed` },
      { label: "JERSEYS", value: [game.away_jersey, game.home_jersey].filter(Boolean).join(" / ") || "Not listed" }
    ];
    statGrid(ctx, rows, 650);
    text(ctx, "gavinwarner.digital/sports", 64, 1030, 21, 650, "rgba(255,255,255,.55)");
    text(ctx, "MATCHUP CARD", 1016, 1030, 20, 800, "rgba(255,255,255,.48)", "right");
  }

  function dialog() {
    let modal = document.querySelector("[data-share-card-dialog]");
    if (modal) return modal;
    modal = document.createElement("dialog"); modal.className = "sports-share-dialog"; modal.dataset.shareCardDialog = "";
    modal.innerHTML = '<div class="sports-share-panel"><div class="sports-share-heading"><div><p>READY TO SEND</p><h2>Share card</h2></div><button type="button" data-share-close aria-label="Close share card">×</button></div><p class="sports-share-status" data-share-status role="status" aria-live="polite">Creating your card…</p><canvas width="1080" height="1080" data-share-canvas aria-label="Generated Sports Center share card"></canvas><div class="sports-share-actions"><button type="button" class="sports-share-primary" data-share-native>Share image</button><button type="button" data-share-copy>Copy image</button><button type="button" data-share-download>Save PNG</button></div></div>';
    document.body.append(modal);
    modal.querySelector("[data-share-close]").addEventListener("click", function () { modal.close(); });
    modal.addEventListener("click", function (event) { if (event.target === modal) modal.close(); });
    modal.querySelector("[data-share-download]").addEventListener("click", function () {
      if (!state.blob) return;
      const link = document.createElement("a"); link.href = URL.createObjectURL(state.blob); link.download = state.filename; link.click();
      window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    });
    modal.querySelector("[data-share-copy]").addEventListener("click", async function () {
      const status = modal.querySelector("[data-share-status]");
      if (!state.blob) return;
      if (!navigator.clipboard || !window.ClipboardItem) {
        status.textContent = "This browser cannot copy PNG images directly. Use Share image or Save PNG instead."; return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": state.blob })]);
        status.textContent = "Image copied. You can paste it into Messages, Mail, or another app.";
      } catch (_) {
        status.textContent = "Image copying was blocked by this browser. Use Share image or Save PNG instead.";
      }
    });
    modal.querySelector("[data-share-native]").addEventListener("click", async function () {
      if (!state.blob) return;
      const file = new File([state.blob], state.filename, { type: "image/png" });
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
        modal.querySelector("[data-share-status]").textContent = "Direct image sharing is unavailable here. Use Save PNG instead."; return;
      }
      try { await navigator.share({ files: [file], title: state.title }); }
      catch (error) { if (error.name !== "AbortError") modal.querySelector("[data-share-status]").textContent = "The share sheet could not be opened. You can still save the PNG."; }
    });
    return modal;
  }

  async function open(kind, data) {
    const modal = dialog(); const canvas = modal.querySelector("[data-share-canvas]"); const status = modal.querySelector("[data-share-status]");
    state.blob = null; status.textContent = "Creating your card…";
    if (typeof modal.showModal === "function") modal.showModal(); else modal.setAttribute("open", "");
    try {
      if (kind === "player") await drawPlayer(canvas, data); else await drawGame(canvas, data);
      state.blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", .94));
      if (!state.blob) throw new Error("Export failed");
      state.filename = data.filename || "sports-center-card.png"; state.title = data.title || "NFL Sports Center";
      status.textContent = "Your 1080 × 1080 card is ready.";
    } catch (_) { status.textContent = "This card could not be created. One of its images may be temporarily unavailable."; }
  }

  window.SportsShare = {
    player: function (data) { return open("player", data); },
    game: function (data) { return open("game", data); }
  };
}());
