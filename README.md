# WebCounter

WebCounter is a privacy-conscious, embeddable website traffic widget. It shows total page views, visitors online now, country flags, and a recent visitor feed.

The project has two deployable parts:

- `docs/` — the landing page and embeddable widget, hosted on GitHub Pages.
- `worker/` — the API and D1 database, hosted on Cloudflare Workers.

## How it works

Website owners register a domain on the landing page and receive a small script tag. The script records a page view, sends a short heartbeat while the page is visible, and renders the latest public traffic summary inside an isolated Shadow DOM component.

Raw IP addresses are never stored. A random browser identifier is hashed by the API before it is used for presence counting.

## 1. Deploy the API

Install Node.js 22 or newer and enable pnpm, then authenticate Wrangler:

```bash
cd worker
corepack enable
pnpm install
pnpm exec wrangler login
```

Create the database:

```bash
pnpm exec wrangler d1 create webcounter
```

Copy the returned database ID into `worker/wrangler.toml`.

Apply the schema and deploy:

```bash
pnpm run db:migrate:remote
pnpm run deploy
```

Wrangler will return an address similar to:

```text
https://webcounter-api.<your-subdomain>.workers.dev
```

## 2. Connect the landing page

Open `docs/config.js` and replace the placeholder with the Worker address:

```js
window.WEBCOUNTER_CONFIG = {
  apiUrl: "https://webcounter-api.<your-subdomain>.workers.dev",
};
```

Commit and push the change.

## 3. Enable GitHub Pages

In the repository, open **Settings → Pages** and choose:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/docs**

The landing page will be available at:

```text
https://jaizovic.github.io/webcounter/
```

## Local checks

Run the static site locally from the repository root:

```bash
python3 -m http.server 8080 --directory docs
```

Run the Worker locally from `worker/`:

```bash
pnpm install
pnpm run db:migrate:local
pnpm run dev
```

Update `docs/config.js` to `http://localhost:8787` while testing locally.

## API routes

- `POST /api/sites` — register a domain or return its existing public site ID.
- `POST /api/events` — record a page view or presence heartbeat.
- `GET /api/sites/:siteId/stats` — return public widget statistics.
- `GET /health` — service health check.

## Current MVP limits

Registration is intentionally open for the first version. Before operating this as a large public service, add account authentication, bot protection, rate limiting, retention rules, and a deletion workflow.

## License

MIT
