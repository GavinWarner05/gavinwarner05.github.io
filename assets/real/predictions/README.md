# NBA paper predictions

Public, unlisted/noindex page: `/real/predictions/`. Only the auction tool links to it.
The manually supplied baseline and quote snapshot is in `data/real/predictions.json`.
No Real account, API, automatic data refresh, purchase, bid, or actual-spending mode.

The seven-game diagnostic ledger and original two-pick value ledger are separate.
TOR/MIN and ORL/NYK are opposing positions in the same games; never sum the two
maximum profits or describe nine independent games. Frozen stakes are 25 Rax per
pick; actual spending is zero. Outcomes remain pending until explicitly researched.

The optional calculator defaults to 1% of a whole-Rax example balance, accepts
0–1% via fixed choices, and splits the floored budget equally across selected,
not-yet-started picks in the active portfolio. Remainders remain unallocated.
Inputs are session-memory only; no storage, URL serialization, telemetry or requests.
The minute timer only checks local clock eligibility; it does not refresh any data.
This heuristic is neither optimal nor a trained-model recommendation. Payout scales
are estimates from historical quotes; fees, minimums and execution are unverified.

Checks:

```sh
HUGO_RESOURCEDIR=/tmp/real-resources hugo --environment production --minify --destination /tmp/real-predictions-preview
python3 -m unittest discover -s tests -v
NODE_PATH=/tmp/real-browser/node_modules node tests/real_predictions.browser.cjs
```

For branch-based Pages deployment, copy only the rendered `/real/predictions/`
HTML and its referenced generated assets into `docs/real/predictions/`. Copy the
auction index only when its within-tool navigation changes. Do not rebuild other
tracked pages. The other existing Pages workflow also renders Hugo from source.
