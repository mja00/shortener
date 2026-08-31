# Shortener Worker

Cloudflare Workers port of the Flask URL shortener in `services/web/`, using Hono + TypeScript + D1. It is a 1:1 feature port, with a handful of deliberate fixes where the original had outright bugs:

## Fixes vs the original
1. `expiration_date` is normalized to ISO-8601 at every write boundary. The original interpreted epoch *seconds* on the API but epoch *milliseconds* on the web UI, silently producing dates centuries apart.
2. Unknown country codes (e.g. `T1` from Tor exit nodes) resolve to `Unknown` instead of raising a `KeyError` 500.
3. `DISABLE_REGISTRATION=true` actually blocks registration. The original computed the redirect response and then fell through to register the user anyway.
4. Click counting is atomic (`UPDATE shortlinks SET current_clicks = current_clicks + 1 WHERE id = ?`, batched with the visit insert via D1 `batch`) instead of the original read-modify-write race.
5. Hard delete removes the link's `visits` rows before the link itself, satisfying D1's foreign key enforcement. The original Postgres app 500'd here.

Everything else, including the quirks listed in the config table below, is kept for parity.

## Local development

```sh
npm install
npx wrangler d1 migrations apply shortener --local
cp .dev.vars.example .dev.vars
npm run dev      # serves on http://localhost:8787
npm test         # vitest, uses vitest-pool-workers against a local D1
```

Secrets live in `.dev.vars` (gitignored); commit changes to `.dev.vars.example` instead.

## Deploy

```sh
# create the production database and record its id in wrangler.toml
npx wrangler d1 create shortener
#   -> paste the returned database_id into the [[d1_databases]] block

npx wrangler d1 migrations apply shortener --remote
npx wrangler secret put SECRET_KEY
npx wrangler secret put API_KEY
npm run deploy

# smoke test: expect a JSON list of links
curl -H "Authorization: <your API_KEY>" https://mart.fyi/api/links/active
```

The worker serves on `https://mart.fyi` and `https://www.mart.fyi` via zone routes in `wrangler.toml` (`workers_dev` is disabled, so no `*.workers.dev` URL).

`wrangler.toml` ships with `database_id = "local"` for development; replace it with the real id before deploying.

## Configuration

The original Flask env vars map to either Worker [vars](https://developers.cloudflare.com/workers/configuration/environment-variables/) (plain strings in `wrangler.toml`, overridable per-environment) or [secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (encrypted, set via `wrangler secret put` or a `.dev.vars` file locally).

| Flask env var | Worker binding | Kind | Default | Notes |
| --- | --- | --- | --- | --- |
| `SECRET_KEY` | `SECRET_KEY` | secret | — | JWT/session signing |
| `API_KEY` | `API_KEY` | secret | — | API auth; requests are rejected with 401 when unset |
| `API_USER_ID` | `API_USER_ID` | var | `"1"` | User id recorded as creator on API-created links |
| `DISABLE_REGISTRATION` | `DISABLE_REGISTRATION` | var | `"false"` | `"true"` blocks `/register` (see fix 3) |
| `ROOT_REDIRECT` | `ROOT_REDIRECT` | var | `""` | URL to redirect `/` to; empty serves the UI |
| `NOT_FOUND_BEHAVIOR` | `NOT_FOUND_BEHAVIOR` | var | `"redirect"` | `redirect` (302 to `/`) or `404`; new option, no Flask equivalent |
| `THEME` | `THEME` | var | `"darkly"` | [Bootswatch](https://bootswatch.com/) theme name injected into the base template |
| `ENABLE_API` | — | — | — | The original code defaulted to `False` while its README claimed `True`. This port always registers `/api` routes and gates them only on `API_KEY`, so `ENABLE_API` is effectively always-on and is not read. |

## API

Same routes as the original Flask app:

- `GET /api/links/active` — list all active links
- `GET /api/links/expired` — list all expired links
- `GET /api/links/deleted` — list all deleted links
- `GET /api/links/<link_id>` — return one link
- `POST /api/links` — create a link; body `{"url", "alias", "max_click_count"?, "expiration_date"?}` (both `url` and `alias` required, no auto-generation)
- `PUT /api/links/<link_id>` — update a link; same body
- `DELETE /api/links/<link_id>` — soft delete
- `PUT /api/links/<link_id>/restore` — restore a soft-deleted link
- `DELETE /api/links/<link_id>/hard` — hard delete (also removes the link's visit rows)

Auth: send the API key as a raw `Authorization` header with **no** `Bearer ` prefix, exactly equal to the `API_KEY` secret (constant-time compare). Missing or mismatched keys get `401 {"error":"Unauthorized"}`.

`expiration_date` accepts epoch seconds, epoch milliseconds, or ISO-8601 strings; empty or absent means never expires, anything unparseable returns 400.

## Security note

The web registration endpoint has no rate limiting or captcha. Put `/register` behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) or set `DISABLE_REGISTRATION=true` after creating your account. The original README's advice to also firewall `/login` applies equally here.
