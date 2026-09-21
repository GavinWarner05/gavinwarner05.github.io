const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = process.env.SPORTS_TEST_SITE_DIR || "/tmp/gavinwarner-home-discovery";
const artifacts = process.env.SPORTS_TEST_ARTIFACT_DIR || "/tmp/sports-home-discovery";
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
    await page.goto(base + "/sports/");

    assert.equal(await page.locator('.sports-home-nav a[href$="/sports/standings/"]').count(), 1);
    await page.locator("[data-player-search-section]").waitFor({ state: "visible" });
    assert.match(await page.locator("[data-player-search-count]").textContent(), /2,\d{3} players/);
    await page.locator("[data-player-search]").fill("Lamar Jackson");
    await page.locator("[data-player-search-results] a").first().waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-player-search-results] a").count(), 1);
    assert.match(await page.locator("[data-player-search-results] a").first().getAttribute("href"), /team=bal&id=00-0034796/);
    assert.match(await page.locator("[data-player-search-results]").textContent(), /BAL · QB/);

    await page.locator("[data-weekly-leaders-section]").waitFor({ state: "visible" });
    assert.match(await page.locator("[data-leaders-heading]").textContent(), /2026 · Week 1/);
    assert.equal(await page.locator("[data-weekly-leaders] a").count(), 5);
    await page.locator('[data-leader-category="rushing_yards"]').click();
    assert.match(await page.locator("[data-weekly-leaders] a").first().textContent(), /Kenneth Walker III/);
    assert.match(await page.locator("[data-weekly-leaders] a").first().textContent(), /173YDS/);
    await page.locator('[data-leader-category="def_interceptions"]').click();
    assert.match(await page.locator("[data-weekly-leaders] a").first().textContent(), /Andrew Wingard/);
    assert.match(await page.locator("[data-weekly-leaders] a").first().textContent(), /1INT/);
    await page.locator('[data-leader-category="def_qb_hits"]').click();
    assert.match(await page.locator("[data-weekly-leaders] a").first().textContent(), /Dallas Turner/);
    assert.match(await page.locator("[data-weekly-leaders] a").first().textContent(), /7HIT/);
    await page.screenshot({ path: path.join(artifacts, "home-desktop.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-player-search]").fill("Lamar Jackson");
    await page.locator("[data-player-search-section]").screenshot({ path: path.join(artifacts, "search-mobile.png") });
    await page.locator("[data-weekly-leaders-section]").screenshot({ path: path.join(artifacts, "leaders-mobile.png") });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Page must not overflow on mobile");
    assert.deepEqual(errors, []);
    console.log("PASS: player search, direct player links, weekly leader categories, and mobile layout");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
