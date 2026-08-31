# shortener

URL shortener running as a Cloudflare Worker (Hono + TypeScript + D1). Serves **https://mart.fyi** and **https://www.mart.fyi**.


## Fixes vs the original Flask app
1. `expiration_date` is normalized to ISO-8601 at every write boundary. The original interpreted epoch *seconds* on the API but epoch *milliseconds* on the web UI, silently producing dates centuries apart.
2. Unknown country codes (e.g. `T1` from Tor exit nodes) resolve to `Unknown` instead of raising a `KeyError` 500.
3. `DISABLE_REGISTRATION=true` actually blocks registration. The original computed the redirect response and then fell through to register the user anyway.
4. Click counting is atomic (`UPDATE shortlinks SET current_clicks = current_clicks + 1 WHERE id = ?`, batched with the visit insert via D1 `batch`) instead of the original read-modify-write race.
5. Hard delete removes the link's `visits` rows before the link itself, satisfying D1's foreign key enforcement. The original Postgres app 500'd here.

Everything else, including the parity quirks, is kept: raw `Authorization`-header API auth (no `Bearer `), 200-with-error JSON on some web endpoints, unknown aliases redirect home (switchable via `NOT_FOUND_BEHAVIOR`).

## Layout
- `src/` — Worker code (`routes/`, `views/`, `lib/`)
- `migrations/` — D1 schema migrations
- `test/` — Vitest suite (`@cloudflare/vitest-pool-workers`, local D1)
- `wrangler.toml` — bindings, routes, observability

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # local secrets
npx wrangler d1 migrations apply shortener --local
npm run dev                      # http://localhost:8787
npm test                         # 66 tests
```

## Deploy

```sh
npx wrangler d1 migrations apply shortener --remote
npm run deploy
```

Secrets (`SECRET_KEY`, `API_KEY`) via `npx wrangler secret put <name>`; config vars (`API_USER_ID`, `DISABLE_REGISTRATION`, `ROOT_REDIRECT`, `NOT_FOUND_BEHAVIOR`, `THEME`) live in `wrangler.toml`. Observability is enabled (Workers Logs 100% sampling, traces 5%) — view in the Cloudflare dashboard under Workers & Pages → shortener → Logs/Traces.

Serving is via zone routes on `mart.fyi` / `www.mart.fyi` (`workers_dev` and `preview_urls` disabled, so no `*.workers.dev` URL).

## API

Same endpoints as the original Flask app: `/api/test`, `/api/links/active|expired|deleted`, `GET|POST /api/links`, `PUT|DELETE /api/links/:id`, `PUT /api/links/:id/restore`, `DELETE /api/links/:id/hard`. Auth is a raw `Authorization` header equal to `API_KEY` — no `Bearer ` prefix.

The worker serves on `https://mart.fyi` and `https://www.mart.fyi`. `/login` is behind Cloudflare Access on the zone; for open deployments prefer `DISABLE_REGISTRATION=true` or an Access policy.
