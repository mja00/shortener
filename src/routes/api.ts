import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireApiKey } from "../lib/auth";
import { all, first, nowISO, run } from "../lib/db";
import { normalizeAlias, normalizeExpiration } from "../lib/normalize";
import { linkToDict } from "../lib/serialize";
import type { Link } from "../types";

const api = new Hono<{ Bindings: Bindings }>();

api.use("*", requireApiKey);

api.get("/test", (c) => c.json({ message: "Hello World!" }));

api.get("/links/active", async (c) => {
  const links = await all<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE expired = 0 AND deleted = 0");
  return c.json({ links: links.map(linkToDict) });
});

api.get("/links/expired", async (c) => {
  const links = await all<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE expired = 1");
  return c.json({ links: links.map(linkToDict) });
});

api.get("/links/deleted", async (c) => {
  const links = await all<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE deleted = 1");
  return c.json({ links: links.map(linkToDict) });
});

api.get("/links/:id", async (c) => {
  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", c.req.param("id"));
  if (!link) return c.json({ error: "Link not found" }, 404);
  return c.json({ link: linkToDict(link) });
});

// Parse a request body into a plain object; null when absent, non-object, or
// invalid JSON. Shared by POST and PUT so both treat malformed bodies alike.
function bodyRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Parity: POST expiration accepts epoch s/ms or ISO via the shared normalizer;
// created_by defaults to API_USER_ID ("1").
api.post("/links", async (c) => {
  const body = bodyRecord(await c.req.text());
  if (!body) return c.json({ error: "Missing body" }, 400);

  const url = body.url;
  const alias = normalizeAlias(typeof body.alias === "string" ? body.alias : undefined);
  const expiration = normalizeExpiration(body.expiration_date);
  if (expiration === "invalid") {
    return c.json({ error: "Invalid expiration date. Must be unix timestamp." }, 400);
  }
  if (!url || typeof url !== "string" || !alias) {
    return c.json({ error: "Missing url or alias or created_by" }, 400);
  }

  const taken = await first<Link>(c.env.DB, "SELECT id FROM shortlinks WHERE short_url = ?", alias);
  if (taken) return c.json({ error: "Alias is taken" }, 400);

  const now = nowISO();
  const createdBy = Number(c.env.API_USER_ID ?? "1");
  // UNIQUE index is the race-safe backstop for non-integer alias collisions.
  try {
    await run(
      c.env.DB,
      "INSERT INTO shortlinks (original_url, short_url, expired, expiration_date, max_clicks, current_clicks, deleted, created_by, created_at, updated_at) VALUES (?, ?, 0, ?, ?, 0, 0, ?, ?, ?)",
      url,
      alias,
      expiration,
      typeof body.max_click_count === "number" ? body.max_click_count : -1,
      createdBy,
      now,
      now,
    );
  } catch {
    return c.json({ error: "Alias is taken" }, 400);
  }

  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE short_url = ?", alias);
  if (!link) return c.json({ error: "Alias is taken" }, 400);
  return c.json({ link: linkToDict(link) }, 201);
});

// Parity: PUT distinguishes 'Missing url or alias' from POST's longer message;
// an alias kept unchanged never trips the taken check.
api.put("/links/:id", async (c) => {
  const id = c.req.param("id");
  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!link) return c.json({ error: "Link not found" }, 404);

  const body = bodyRecord(await c.req.text());
  if (!body) return c.json({ error: "Missing body" }, 400);

  const url = body.url;
  const alias = normalizeAlias(typeof body.alias === "string" ? body.alias : undefined);
  const expiration = normalizeExpiration(body.expiration_date);
  if (expiration === "invalid") {
    return c.json({ error: "Invalid expiration date. Must be unix timestamp." }, 400);
  }
  if (!url || typeof url !== "string" || !alias) {
    return c.json({ error: "Missing url or alias" }, 400);
  }

  if (link.short_url !== alias) {
    const taken = await first<Link>(c.env.DB, "SELECT id FROM shortlinks WHERE short_url = ?", alias);
    if (taken) return c.json({ error: "Alias is taken" }, 400);
  }

  const now = nowISO();
  await run(
    c.env.DB,
    "UPDATE shortlinks SET original_url = ?, short_url = ?, max_clicks = ?, expiration_date = ?, updated_at = ? WHERE id = ?",
    url,
    alias,
    typeof body.max_click_count === "number" ? body.max_click_count : -1,
    expiration,
    now,
    id,
  );

  const updated = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!updated) return c.json({ error: "Link not found" }, 404);
  return c.json({ link: linkToDict(updated) });
});

api.delete("/links/:id", async (c) => {
  const id = c.req.param("id");
  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!link) return c.json({ error: "Link not found" }, 404);

  const now = nowISO();
  await run(
    c.env.DB,
    "UPDATE shortlinks SET deleted = 1, expired = 1, updated_at = ? WHERE id = ?",
    now,
    id,
  );

  const updated = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!updated) return c.json({ error: "Link not found" }, 404);
  return c.json({ link: linkToDict(updated) });
});

api.put("/links/:id/restore", async (c) => {
  const id = c.req.param("id");
  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!link) return c.json({ error: "Link not found" }, 404);

  const now = nowISO();
  await run(
    c.env.DB,
    "UPDATE shortlinks SET deleted = 0, expired = 0, updated_at = ? WHERE id = ?",
    now,
    id,
  );

  const updated = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!updated) return c.json({ error: "Link not found" }, 404);
  return c.json({ link: linkToDict(updated) });
});

// Parity fix: visits rows go first so the D1 FK constraint is satisfied.
api.delete("/links/:id/hard", async (c) => {
  const id = c.req.param("id");
  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE id = ?", id);
  if (!link) return c.json({ error: "Link not found" }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM visits WHERE short_url_id = ?").bind(link.id),
    c.env.DB.prepare("DELETE FROM shortlinks WHERE id = ?").bind(link.id),
  ]);

  return c.json({ message: "Link deleted" });
});

export { api };
