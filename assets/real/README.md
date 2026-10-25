# Auction Finder snapshot

`/real/` is a public research prototype excluded from Hugo lists, sitemap and feeds,
with noindex/nofollow metadata. This is not access control. Only requested tools under
`/real/` link to one another; other site navigation does not link here.

The current two-candidate replacement was checked on 2026-10-25 at 16:16:55 UTC
(Alperen Şengün) and 16:18:29 UTC (Harrison Butker). These are manually verified
research snapshots, not live quotes, payouts or account eligibility. Removed older
candidates are simply omitted; omission does not establish that an auction ended.
Never publish account balances, holdings, credentials or ownership data.

`data/real/candidates.json` supplies counts, sports, tiers, timestamps and sale records.
Prices with zero bids are labeled opening/listed prices. Empty URLs render disabled
buttons. Only add verified exact listing URLs, never inferred IDs or marketplace pages.
Null `endAt` means no absolute closing time was verified. Countdown observations are
not live timers; do not silently convert rounded countdowns to exact closing times.

`sold` is an array of date/price/rating observations. Multiple records produce a labeled
historical observed-sales arithmetic mean with sample size; a single record is called
a historical observed sale, never an average. Empty arrays show unavailable. Şengün's
four records average 8,500 Rax over November 2025–July 2026; this is not a current fair
value estimate. Butker has no verified same-player sale comp. Do not reuse another
player's market-panel median. Historical Rax is gross season earnings, not sale price
or guaranteed future/remaining earnings.

The optional budget stays in page-session memory. There is no account/API integration,
automatic refresh, backend or purchasing control. Photos map to player identities in
`headshots.json`; public NFL/ESPN URLs were verified and initials handle load failures.

Rarity accents are artwork-sampled visual matches, not official CSS tokens: Mystic
#A77320 from a supplied Rodgers Mystic reference; Iconic #9F4396 from the historical
Real post https://x.com/realapp_/status/1745249532948963683. Text is lightened for contrast.

Checks:

```sh
HUGO_RESOURCEDIR=/tmp/real-resources hugo --environment production --minify --destination /tmp/real-refresh-preview
python3 -m unittest discover -s tests -v
REAL_TEST_IMAGES=1 NODE_PATH=/tmp/real-browser/node_modules node tests/real_finder.browser.cjs
```

For active branch-based Pages publishing, copy only the built `real/index.html` and
its referenced `/real/` CSS/JS into `docs/real/`. Do not rewrite unrelated generated
pages. The existing separate deployment workflow also renders Hugo from source.
