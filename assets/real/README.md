# Auction Finder snapshot

`/real/` is an independent, public research prototype. It is excluded from Hugo lists,
sitemap and feeds and emits noindex/nofollow metadata. This does not provide access control.
No other page or navigation links to it.

The six candidate records are manually supplied research snapshots checked approximately
2026-10-25 06:40 UTC, with Randle rechecked at 06:46 and Lutz at 06:48 UTC. They are not live quotes, verified payouts or account eligibility.
Do not publish account balances, holdings, credentials, or personalized ownership data.

An empty `url` deliberately renders a disabled listing button. Only fill it with the
verified direct HTTPS URL for that exact auction, never a marketplace homepage, search
URL, inferred ID or same-player card. A null `endAt` means not verified. Observed countdowns are not live or absolute end times. Record the
verification timestamp and recheck all card attributes when updating data. Each card has its own check timestamp and display label; update both together. Sold context is manually recorded and not proof of equivalent attributes.

The budget is optional and kept only in the page session; it is never persisted or sent.
There is no API integration, automatic refresh, scraping backend or purchasing control.

Validation:

```sh
HUGO_RESOURCEDIR=/tmp/real-resources hugo --environment production --minify --destination /tmp/real-site
python3 -m unittest discover -s tests -v
npm install --prefix /tmp/real-browser --no-audit --no-fund playwright
npx --prefix /tmp/real-browser playwright install chromium
NODE_PATH=/tmp/real-browser/node_modules node tests/real_finder.browser.cjs
```

The existing Deploy GitHub Pages workflow builds from main on its schedule. The active
branch-based Pages deployment also publishes `docs/`; only `docs/real/` is generated
for this feature. After changes, copy the built real/index.html and its referenced
/real/ CSS and JS into docs/real. Do not rewrite unrelated generated pages.
