# shortener

A self-hosted URL shortener that runs entirely on Cloudflare Workers with a D1 database. It has a small web UI for managing links and viewing visit stats, plus a JSON API for automation.

Built with Hono and TypeScript. The live instance is https://mart.fyi.

## Features

- Custom or randomly generated aliases
- Optional expiration date and max click count per link
- Soft delete, restore, and hard delete
- Per-visit logging (IP, user agent, country) with a searchable visits page
- API-key protected JSON API
- Bootswatch themes

## Requirements

- A Cloudflare account (the Workers free plan is enough)
- Node.js 24 and npm
- Optional: a domain on Cloudflare if you want to serve it on your own hostname instead of `*.workers.dev`

## Deploying your own instance

### 1. Clone and install

```sh
git clone https://github.com/mja00/shortener.git
cd shortener
npm install
npx wrangler login
```

### 2. Create the D1 database

```sh
npx wrangler d1 create shortener
```

Copy the `database_id` it prints into the `[[d1_databases]]` block in `wrangler.toml`, replacing the existing one.

### 3. Point it at your domain

`wrangler.toml` is set up for mart.fyi. Change it to match your setup:

**Your own domain** (must be a zone on your Cloudflare account): replace the two `[[routes]]` blocks:

```toml
[[routes]]
pattern = "s.example.com"
custom_domain = true
```

`custom_domain = true` creates the DNS record for you. If you want the worker on an existing zone's root or a path pattern instead, use `pattern = "example.com/*"` with `zone_name = "example.com"`.

**No domain**: delete the `[[routes]]` blocks and set `workers_dev = true`. The worker will be served at `https://shortener.<your-subdomain>.workers.dev`.

### 4. Configure

Edit `[vars]` in `wrangler.toml`. See [Configuration](#configuration) for what each one does. For the first deploy, set `DISABLE_REGISTRATION = "false"` so you can create your account.

### 5. Create the schema and deploy

```sh
npx wrangler d1 migrations apply shortener --remote
npx wrangler deploy
```

### 6. Set secrets

```sh
openssl rand -base64 32 | npx wrangler secret put SECRET_KEY
openssl rand -base64 32 | npx wrangler secret put API_KEY
```

Save the `API_KEY` value somewhere if you plan to use the API; Cloudflare won't show it again. Secrets take effect immediately, no redeploy needed.

### 7. Create your account and lock registration

1. Open `https://<your-host>/register` and create a user. The first user gets ID `1`, which is what `API_USER_ID` defaults to.
2. Set `DISABLE_REGISTRATION = "true"` in `wrangler.toml` and run `npx wrangler deploy` again.

Anyone who can reach `/register` while registration is open can create an account, so don't skip step 2. For extra protection you can also put `/login` and `/register` behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/).

## Configuration

Plain variables live in `[vars]` in `wrangler.toml`:

| Variable | Default | Description |
|---|---|---|
| `DISABLE_REGISTRATION` | unset (open) | `true`, `1`, or `t` blocks new signups. |
| `ROOT_REDIRECT` | unset | If set, logged-out visitors hitting `/` are redirected here instead of seeing the homepage. `/login` still works directly. |
| `NOT_FOUND_BEHAVIOR` | `redirect` | What unknown aliases do: `redirect` sends them to `/`, `404` returns a plain 404. |
| `THEME` | `darkly` | Any [Bootswatch](https://bootswatch.com/) theme name, e.g. `slate`, `lumen`, `flatly`. |
| `API_USER_ID` | `1` | User ID recorded as the creator of links made through the API. |

Secrets are set with `npx wrangler secret put <NAME>`:

| Secret | Description |
|---|---|
| `SECRET_KEY` | Signs login session cookies. Changing it logs everyone out. |
| `API_KEY` | Required for every `/api/*` request. If unset, the API rejects all requests. |

## Using the API

Send the key as the raw `Authorization` header value. There is no `Bearer ` prefix.

```sh
curl -H "Authorization: $API_KEY" https://s.example.com/api/test

curl -X POST https://s.example.com/api/links \
  -H "Authorization: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "alias": "ex", "max_click_count": 100, "expiration_date": 1767225600}'
```

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/test` | Check that your key works |
| `GET` | `/api/links/active` | Links that are not expired or deleted |
| `GET` | `/api/links/expired` | Expired links (includes soft-deleted ones) |
| `GET` | `/api/links/deleted` | Soft-deleted links |
| `GET` | `/api/links/:id` | One link by numeric ID |
| `POST` | `/api/links` | Create a link |
| `PUT` | `/api/links/:id` | Replace a link's fields |
| `DELETE` | `/api/links/:id` | Soft delete |
| `PUT` | `/api/links/:id/restore` | Undo a soft delete |
| `DELETE` | `/api/links/:id/hard` | Permanently delete the link and its visits |

Request body for `POST` and `PUT`:

| Field | Required | Notes |
|---|---|---|
| `url` | yes | Destination URL |
| `alias` | yes | Short path. Spaces become `-`. The API does not generate random aliases; the web UI does. |
| `max_click_count` | no | Defaults to `-1` (unlimited) |
| `expiration_date` | no | Unix seconds, Unix milliseconds, or an ISO-8601 string |

`PUT` replaces every field, so omitting `max_click_count` or `expiration_date` resets them to unlimited/never.

There is also an unauthenticated `GET /health` that returns `ok`.

## Automatic deploys with GitHub Actions

`.github/workflows/deploy.yml` lints, typechecks, tests, applies migrations, and deploys on every push to `master`. `ci.yml` runs the same checks plus a dry-run build on pull requests.

To use it on your fork, add two repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers & Pages overview in the dashboard
- `CLOUDFLARE_API_TOKEN`: create one from the "Edit Cloudflare Workers" template and add the **Account > D1 > Edit** permission so migrations can run

Worker secrets (`SECRET_KEY`, `API_KEY`) are not managed by the workflow; set them once with `wrangler secret put` as above.

## Local development

```sh
cp .dev.vars.example .dev.vars        # local secrets and var overrides
npx wrangler d1 migrations apply shortener --local
npx wrangler dev                      # http://localhost:8787
```

Local D1 data lives in `.wrangler/` and is separate from production.

Checks (the same ones CI runs):

```sh
npm run lint
npm run typecheck
npm test
```

> `npm run dev` and `npm run deploy` are wired to the maintainer's `.env.prod` file. If you don't have one, use `npx wrangler dev` and `npx wrangler deploy` directly.

## Project layout

- `src/routes/` HTTP handlers: `web.ts` (UI), `api.ts`, `redirect.ts` (the `/:alias` catch-all)
- `src/views/` HTML templates
- `src/lib/` auth, DB helpers, alias and date normalization
- `migrations/` D1 schema
- `test/` Vitest suite running against a local D1

## Migrating from the old Flask version

This repo used to be a Flask + Postgres app. If you're coming from it, export your `shortlinks`, `users`, and `visits` tables into D1 with the schema in `migrations/0001_init.sql` (booleans become `0`/`1`). Existing Werkzeug password hashes keep working and are upgraded to bcrypt on each user's next login.

Behavior differences from the Flask app:

- `expiration_date` is stored as ISO-8601 everywhere. The old app treated it as seconds in the API but milliseconds in the web UI.
- `DISABLE_REGISTRATION` actually blocks registration.
- Unknown country codes (e.g. Tor's `T1`) show as `Unknown` instead of erroring.
- Click counting is atomic.
- Hard delete works (the old app hit a foreign key error).
