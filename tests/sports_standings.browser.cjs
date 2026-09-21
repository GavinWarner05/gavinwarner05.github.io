const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = process.env.SPORTS_TEST_SITE_DIR || "/tmp/gavinwarner-standings";
const artifacts = process.env.SPORTS_TEST_ARTIFACT_DIR || "/tmp/sports-standings-browser";
fs.mkdirSync(artifacts, { recursive: true });

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith("/")) file += "index.html";
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
    response.end(data);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.SPORTS_TEST_BROWSER || "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark", serviceWorkers: "block" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(base + "/sports/standings/");
    await page.locator(".standings-conference-grid").waitFor({ state: "visible" });

    assert.equal(await page.locator('.sports-navigation a[href$="/sports/standings/"]').getAttribute("class"), "navigation-link is-active");
    assert.match(await page.locator("[data-standings-updated]").textContent(), /2026 regular season/);
    assert.equal(await page.locator(".standings-top-seed").count(), 2);
    assert.equal(await page.locator(".standings-conference-panel").count(), 2);
    assert.equal(await page.locator(".standings-conference-panel [data-team-id]").count(), 32);
    assert.equal(await page.locator(".standings-conference-panel .standings-playoff-cutline").count(), 2);
    assert.equal(await page.locator(".standings-conference-panel .standings-status.is-division").count(), 8);
    assert.equal(await page.locator(".standings-conference-panel .standings-status.is-wildcard").count(), 6);
    assert.match(await page.locator(".standings-conference-panel .standings-team-link").first().getAttribute("href"), /\/sports\/teams\/[a-z]+\/$/);
    await page.screenshot({ path: path.join(artifacts, "overview-desktop.png"), fullPage: true });

    await page.locator('[data-standings-view="afc"]').click();
    assert.equal(await page.locator('[data-standings-content][data-view="afc"] [data-team-id]').count(), 16);
    assert.match(await page.locator(".standings-table thead").textContent(), /W-L-T.*PCT.*CONF.*DIV.*PF.*PA.*DIFF.*STRK.*L5/s);
    assert.match(await page.locator(".standings-tiebreaker-note").textContent(), /NFL's division and conference tiebreaking procedures/);
    await page.locator("[data-standings-content]").screenshot({ path: path.join(artifacts, "afc-desktop.png") });

    await page.locator('[data-standings-view="league"]').click();
    assert.equal(await page.locator('[data-standings-content][data-view="league"] [data-team-id]').count(), 32);
    assert.equal(await page.locator("[data-standings-content] .standings-playoff-cutline").count(), 0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-standings-view="nfc"]').click();
    await page.locator("[data-standings-content]").screenshot({ path: path.join(artifacts, "nfc-mobile.png") });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Standings page must not overflow on mobile");
    assert.equal(await page.locator('[data-standings-content][data-view="nfc"] [data-team-id]').count(), 16);
    assert.deepEqual(errors, []);
    console.log("PASS: conference overview, playoff cutlines, detailed tables, league view, team links, and mobile layout");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
