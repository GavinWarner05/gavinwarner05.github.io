# Sports notification service

This Cloudflare Worker adds optional Web Push to the static Sports Center. It uses D1 for subscriptions and prior game/injury state, and polls only `https://gavinwarner.digital/sports/data/` every five minutes.

## Security and privacy

- Never put `VAPID_PRIVATE_KEY` in GitHub, Hugo, browser JavaScript, or chat.
- Subscriptions have a random management token created and retained by the visitor's browser. D1 stores only its SHA-256 hash.
- Team and player preferences are IDs, not names, email addresses, or accounts.
- The API accepts browser requests only from `https://gavinwarner.digital`.
- The browser can delete its subscription using its device-only management token.

## Cloudflare setup

Requirements: Node.js 20 or newer and a Cloudflare account.

```sh
cd workers/sports-notifications
npm install
npx wrangler login
npx wrangler d1 create sports-notifications --binding DB --update-config
npm run db:migrate:remote
npm run keys:install
```

The key command generates a VAPID keypair and passes both values directly to Cloudflare's encrypted secret store without displaying them. Do not paste either key into chat, and never commit them. Then run `npm run deploy`.

Copy only the resulting public Worker URL (for example, `https://nfl-sports-notifications.example.workers.dev`). Set that safe URL in `static/sports/data/notifications.json` and change `enabled` to `true`, then rebuild and deploy Hugo.

## Local checks

Apply a local database and run the Worker with its scheduled handler available:

```sh
npm run db:migrate:local
npm run dev
```

The Hugo app can be tested separately with its notification config left disabled. Browser push subscription testing requires HTTPS and an allowed origin; use the deployed site for the final permission and test-notification check.

## Operations

The cron initializes stored state on its first run without sending old game or injury notifications. Later changes are compared with stored state and deduplicated. Invalid or expired push endpoints are automatically removed after a `404` or `410` response.

To roll back the UI before launch, leave `static/sports/data/notifications.json` disabled. To stop delivery after launch, disable the Worker's Cron Trigger in Cloudflare. Existing Sports Center pages and data continue working independently.
