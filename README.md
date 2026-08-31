# shortener

URL shortener running as a Cloudflare Worker (Hono + TypeScript + D1). Serves **https://mart.fyi** and **https://www.mart.fyi**.

This is a full rewrite of the original Flask app (removed in the cutover); behavior parity notes and the deliberate fixes are listed in [worker/README.md](worker/README.md).

## Layout

All source lives in [`worker/`](worker/):

- `src/` — Worker code (routes, views, lib)
- `migrations/` — D1 schema migrations
- `test/` — Vitest suite (`@cloudflare/vitest-pool-workers`, local D1)
- `wrangler.toml` — bindings, routes, observability

## Development

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars   # local secrets
npx wrangler d1 migrations apply shortener --local
npm run dev                      # http://localhost:8787
npm test
```

## Deploy

```sh
cd worker
npx wrangler d1 migrations apply shortener --remote
npm run deploy
```

Secrets (`SECRET_KEY`, `API_KEY`) are set via `npx wrangler secret put <name>`; config vars live in `wrangler.toml`. Observability (Workers Logs 100%, traces 5%) is enabled in `wrangler.toml`.

## API

Same endpoints as the original — see [worker/README.md](worker/README.md#api). Auth is a raw `Authorization` header equal to `API_KEY` (no `Bearer ` prefix).
