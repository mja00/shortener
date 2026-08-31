import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Link } from "../src/types";

const AUTH = { Authorization: "test-api-key" };

async function seedLink(shortUrl: string, extra: Partial<Link> = {}): Promise<number> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO shortlinks (original_url, short_url, expired, expiration_date, max_clicks, current_clicks, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      `https://example.com/${shortUrl}`,
      shortUrl,
      extra.expired ?? 0,
      extra.expiration_date ?? null,
      extra.max_clicks ?? -1,
      extra.current_clicks ?? 0,
      extra.deleted ?? 0,
      now,
      now,
    )
    .run();
  const row = await env.DB.prepare("SELECT id FROM shortlinks WHERE short_url = ?").bind(shortUrl).first<{ id: number }>();
  return row!.id;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function linkGet(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://example.com/api${path}`, init);
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM visits").run();
  await env.DB.prepare("DELETE FROM shortlinks").run();
});

describe("API auth", () => {
  it("rejects missing Authorization header", async () => {
    const res = await linkGet("/test");
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized" });
  });

  it("rejects a wrong key", async () => {
    const res = await linkGet("/test", { headers: { Authorization: "nope" } });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized" });
  });

  it("accepts the configured key", async () => {
    const res = await linkGet("/test", { headers: AUTH });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ message: "Hello World!" });
  });
});

describe("GET /api/links/:id", () => {
  it("returns the link envelope", async () => {
    const id = await seedLink("getme");
    const res = await linkGet(`/links/${id}`, { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(["link"]);
    const link = body.link as Record<string, unknown>;
    expect(link.short_url).toBe("getme");
    expect(link.expired).toBe(false);
    expect(link.deleted).toBe(false);
    expect(link.max_clicks).toBe(-1);
    expect(link.current_clicks).toBe(0);
  });

  it("404s on a missing id", async () => {
    const res = await linkGet("/links/9999", { headers: AUTH });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Link not found" });
  });
});

describe("GET list routes", () => {
  it("splits active/expired/deleted buckets", async () => {
    await seedLink("active");
    await seedLink("gone", { expired: 1 });
    await seedLink("trashed", { deleted: 1 });

    const active = await json(await linkGet("/links/active", { headers: AUTH }));
    const expired = await json(await linkGet("/links/expired", { headers: AUTH }));
    const deleted = await json(await linkGet("/links/deleted", { headers: AUTH }));

    expect(Object.keys(active)).toEqual(["links"]);
    expect((active.links as { short_url: string }[]).map((l) => l.short_url)).toEqual(["active"]);
    expect(Object.keys(expired)).toEqual(["links"]);
    expect((expired.links as { short_url: string }[]).map((l) => l.short_url)).toEqual(["gone"]);
    expect(Object.keys(deleted)).toEqual(["links"]);
    expect((deleted.links as { short_url: string }[]).map((l) => l.short_url)).toEqual(["trashed"]);
  });
});

describe("POST /api/links", () => {
  const create = (payload: unknown) =>
    linkGet("/links", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  it("creates a link with defaults", async () => {
    const res = await create({ url: "https://example.org/a", alias: "alpha" });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(["link"]);
    const link = body.link as Record<string, unknown>;
    expect(link.short_url).toBe("alpha");
    expect(link.original_url).toBe("https://example.org/a");
    expect(link.expired).toBe(false);
    expect(link.deleted).toBe(false);
    expect(link.max_clicks).toBe(-1);
    expect(link.expiration_date).toBeNull();
    expect(link.created_by).toBe(1);
  });

  it("400s on missing body", async () => {
    const res = await linkGet("/links", { method: "POST", headers: AUTH });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Missing body" });
  });

  it("400s on malformed JSON body", async () => {
    const res = await linkGet("/links", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: "{nope",
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Missing body" });
  });

  it("400s on missing url or alias (parity message)", async () => {
    const res = await create({ url: "https://example.org/x" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Missing url or alias or created_by" });
  });

  it("400s on invalid expiration", async () => {
    const res = await create({ url: "https://example.org/x", alias: "badexp", expiration_date: "not-a-date" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Invalid expiration date. Must be unix timestamp." });
  });

  it("normalizes epoch-second expiration to ISO", async () => {
    const res = await create({ url: "https://example.org/x", alias: "epoch", expiration_date: 1700000000 });
    expect(res.status).toBe(201);
    const link = (await json(res)).link as Record<string, unknown>;
    expect(link.expiration_date).toBe("2023-11-14T22:13:20.000Z");
  });

  it("400s when alias already exists (pre-check)", async () => {
    await seedLink("taken");
    const res = await create({ url: "https://example.org/x", alias: "taken" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Alias is taken" });
  });

  it("normalizes alias spaces to dashes on create", async () => {
    const res = await create({ url: "https://example.org/x", alias: "two words" });
    expect(res.status).toBe(201);
    const link = (await json(res)).link as Record<string, unknown>;
    expect(link.short_url).toBe("two-words");
  });
});

describe("PUT /api/links/:id", () => {
  const update = (id: number, payload: unknown) =>
    linkGet(`/links/${id}`, {
      method: "PUT",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  it("updates url, alias, max_clicks, and expiration_date", async () => {
    const id = await seedLink("before");
    const res = await update(id, {
      url: "https://example.org/after",
      alias: "after",
      max_click_count: 10,
      expiration_date: 1700000000,
    });
    expect(res.status).toBe(200);
    const link = (await json(res)).link as Record<string, unknown>;
    expect(link.original_url).toBe("https://example.org/after");
    expect(link.short_url).toBe("after");
  });

  it("400s with the PUT parity message on missing url or alias", async () => {
    const id = await seedLink("nofield");
    const res = await update(id, { url: "https://example.org/x" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Missing url or alias" });
  });

  it("400s on invalid expiration", async () => {
    const id = await seedLink("badexp");
    const res = await update(id, { url: "https://example.org/x", alias: "badexp", expiration_date: "not-a-date" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Invalid expiration date. Must be unix timestamp." });
  });

  it("400s when alias changed to an existing alias", async () => {
    await seedLink("first");
    const id = await seedLink("second");
    const res = await update(id, { url: "https://example.org/x", alias: "first" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "Alias is taken" });
  });

  it("allows re-saving with the same alias", async () => {
    const id = await seedLink("same");
    const res = await update(id, { url: "https://example.org/x", alias: "same" });
    expect(res.status).toBe(200);
    const link = (await json(res)).link as Record<string, unknown>;
    expect(link.short_url).toBe("same");
    expect(link.original_url).toBe("https://example.org/x");
  });
});

describe("DELETE /api/links/:id (soft)", () => {
  it("marks deleted and expired", async () => {
    const id = await seedLink("softy");
    const res = await linkGet(`/links/${id}`, { method: "DELETE", headers: AUTH });
    expect(res.status).toBe(200);
    const link = (await json(res)).link as Record<string, unknown>;
    expect(link.deleted).toBe(true);
    expect(link.expired).toBe(true);

    const active = (await json(await linkGet("/links/active", { headers: AUTH }))).links as unknown[];
    expect(active).toEqual([]);
  });

  it("404s on missing id", async () => {
    const res = await linkGet("/links/9999", { method: "DELETE", headers: AUTH });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Link not found" });
  });
});

describe("PUT /api/links/:id/restore", () => {
  it("clears deleted and expired", async () => {
    const id = await seedLink("revive", { deleted: 1, expired: 1 });
    const res = await linkGet(`/links/${id}/restore`, { method: "PUT", headers: AUTH });
    expect(res.status).toBe(200);
    const link = (await json(res)).link as Record<string, unknown>;
    expect(link.deleted).toBe(false);
    expect(link.expired).toBe(false);

    const active = (await json(await linkGet("/links/active", { headers: AUTH }))).links as { short_url: string }[];
    expect(active.map((l) => l.short_url)).toEqual(["revive"]);
  });

  it("404s on missing id", async () => {
    const res = await linkGet("/links/9999/restore", { method: "PUT", headers: AUTH });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Link not found" });
  });
});

describe("DELETE /api/links/:id/hard", () => {
  it("removes the row and its visits", async () => {
    const id = await seedLink("doomed");
    await env.DB.prepare(
      "INSERT INTO visits (short_url_id, ip_address, user_agent, country, country_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, "1.2.3.4", "ua", "US", "United States", new Date().toISOString(), new Date().toISOString())
      .run();

    const res = await linkGet(`/links/${id}/hard`, { method: "DELETE", headers: AUTH });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Object.keys(body)).toEqual(["message"]);
    expect(body.message).toBe("Link deleted");

    const row = await env.DB.prepare("SELECT id FROM shortlinks WHERE id = ?").bind(id).first();
    expect(row).toBeNull();
    const visits = await env.DB.prepare("SELECT COUNT(*) AS n FROM visits WHERE short_url_id = ?").bind(id).first<{ n: number }>();
    expect(visits!.n).toBe(0);
  });

  it("404s on missing id", async () => {
    const res = await linkGet("/links/9999/hard", { method: "DELETE", headers: AUTH });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: "Link not found" });
  });
});
