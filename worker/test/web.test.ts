import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Link } from "../src/types";
import { hashPassword } from "../src/lib/auth";

const now = () => new Date().toISOString();

async function seedUser(username: string, password: string): Promise<number> {
  await env.DB.prepare("INSERT INTO users (username, password, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(username, hashPassword(password), now(), now())
    .run();
  const row = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first<{ id: number }>();
  return row!.id;
}

async function seedLink(shortUrl: string, extra: Partial<Link> = {}): Promise<number> {
  await env.DB.prepare(
    "INSERT INTO shortlinks (original_url, short_url, expired, expiration_date, max_clicks, current_clicks, deleted, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      `https://example.com/${shortUrl}`,
      shortUrl,
      extra.expired ?? 0,
      extra.expiration_date ?? null,
      extra.max_clicks ?? -1,
      extra.current_clicks ?? 0,
      extra.deleted ?? 0,
      extra.created_by ?? null,
      now(),
      now(),
    )
    .run();
  const row = await env.DB.prepare("SELECT id FROM shortlinks WHERE short_url = ?").bind(shortUrl).first<{ id: number }>();
  return row!.id;
}

async function seedVisit(shortUrlId: number): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO visits (short_url_id, ip_address, user_agent, country, country_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(shortUrlId, "203.0.113.7", "test-agent", "US", "United States", now(), now())
    .run();
}

function form(body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    redirect: "manual",
  };
}

function cookieHeader(cookie: string): Record<string, string> {
  return { Cookie: cookie };
}

// Form POST carrying the session cookie.
function postForm(cookie: string, body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams(body).toString(),
    redirect: "manual",
  };
}

// Register + login through the real routes; returns the session cookie.
async function loginAs(username = "webuser", password = "hunter2"): Promise<string> {
  await seedUser(username, password);
  const res = await SELF.fetch("https://example.com/login", form({ username, password }));
  expect(res.status).toBe(302);
  const setCookie = res.headers.get("set-cookie")!;
  return setCookie.split(";")[0]!;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM visits").run();
  await env.DB.prepare("DELETE FROM shortlinks").run();
  await env.DB.prepare("DELETE FROM users").run();
});

describe("web auth guards", () => {
  it.each(["/create", "/links", "/visits"])("redirects unauthenticated %s to /login", async (path) => {
    const res = await SELF.fetch(`https://example.com${path}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("serves /login unauthenticated", async () => {
    const res = await SELF.fetch("https://example.com/login");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Login");
  });
});

describe("register", () => {
  it("creates a user and redirects to /login", async () => {
    const res = await SELF.fetch("https://example.com/register", form({ username: "newuser", password: "pw", confirm: "pw" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login");
    const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind("newuser").first();
    expect(row).not.toBeNull();
  });

  it("rejects a duplicate username", async () => {
    await seedUser("dup", "pw");
    const res = await SELF.fetch("https://example.com/register", form({ username: "dup", password: "pw", confirm: "pw" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/register");
    expect(res.headers.get("location")).toContain("Username+is+taken");
  });

  it("rejects mismatched confirm", async () => {
    const res = await SELF.fetch("https://example.com/register", form({ username: "x", password: "pw", confirm: "other" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("Passwords+do+not+match");
  });

  it("rejects missing fields", async () => {
    const res = await SELF.fetch("https://example.com/register", form({ username: "x", password: "pw" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("Please+fill+out+all+fields");
  });
});

describe("login/logout", () => {
  it("sets a session cookie on success and /links works with it", async () => {
    await seedUser("loginuser", "pw");
    const res = await SELF.fetch("https://example.com/login", form({ username: "loginuser", password: "pw" }));
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("session=");

    const links = await SELF.fetch("https://example.com/links", { headers: cookieHeader(setCookie.split(";")[0]!) });
    expect(links.status).toBe(200);
  });

  it("rejects a wrong password without a cookie", async () => {
    await seedUser("wrongpw", "pw");
    const res = await SELF.fetch("https://example.com/login", form({ username: "wrongpw", password: "nope" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("Incorrect+details");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("session=");
  });

  it("clears the cookie on logout", async () => {
    const cookie = await loginAs("logoutuser", "pw");
    const res = await SELF.fetch("https://example.com/logout", { headers: cookieHeader(cookie), redirect: "manual" });
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("session=");
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});

describe("index", () => {
  it("renders when ROOT_REDIRECT is unset", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Some random URL shortener");
  });
});

describe("create", () => {
  it("creates a link and redirects to /links", async () => {
    const cookie = await loginAs("creator", "pw");
    const res = await SELF.fetch("https://example.com/create", postForm(cookie, { url: "https://example.com", alias: "demoui" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/links");

    const row = await env.DB.prepare("SELECT * FROM shortlinks WHERE short_url = ?").bind("demoui").first<{ created_by: number }>();
    expect(row).not.toBeNull();
    const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind("creator").first<{ id: number }>();
    expect(row!.created_by).toBe(user!.id);
  });

  it("renders the alias on /links", async () => {
    const cookie = await loginAs("creator2", "pw");
    await SELF.fetch("https://example.com/create", postForm(cookie, { url: "https://example.com/page", alias: "shown" }));
    const links = await SELF.fetch("https://example.com/links", { headers: cookieHeader(cookie) });
    expect(await links.text()).toContain("shown");
  });

  it("rejects a taken alias", async () => {
    const cookie = await loginAs("creator3", "pw");
    await seedLink("taken");
    const res = await SELF.fetch("https://example.com/create", postForm(cookie, { url: "https://example.com", alias: "taken" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("Alias+already+exists");
  });

  it("generates an alias when blank", async () => {
    const cookie = await loginAs("creator4", "pw");
    const res = await SELF.fetch("https://example.com/create", postForm(cookie, { url: "https://example.com", alias: "" }));
    expect(res.status).toBe(302);
    const row = await env.DB.prepare("SELECT short_url FROM shortlinks").first<{ short_url: string }>();
    expect(row!.short_url).not.toBe("");
  });
});

describe("links info/edit lifecycle", () => {
  it("returns info with the owner username", async () => {
    const cookie = await loginAs("owner", "pw");
    const userId = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind("owner").first<{ id: number }>();
    const id = await seedLink("infolink", { created_by: userId!.id });
    const res = await SELF.fetch(`https://example.com/links/info/${id}`, { headers: cookieHeader(cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.created_by).toBe("owner");
    expect(data.short_url).toBe("infolink");
  });

  it("reports Unknown creator without a user", async () => {
    const cookie = await loginAs("owner2", "pw");
    const id = await seedLink("orphan");
    const res = await SELF.fetch(`https://example.com/links/info/${id}`, { headers: cookieHeader(cookie) });
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.created_by).toBe("Unknown");
  });

  it("returns a 200 JSON error for a missing link", async () => {
    const cookie = await loginAs("owner3", "pw");
    const res = await SELF.fetch("https://example.com/links/info/99999", { headers: cookieHeader(cookie) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: "Short link not found" });
  });

  it("edits a link", async () => {
    const cookie = await loginAs("owner4", "pw");
    const id = await seedLink("editable");
    const res = await SELF.fetch(
      `https://example.com/links/edit/${id}`,
      postForm(cookie, { url: "https://example.com/edited", alias: "edited", max_clicks: "5", expiration_date: "" }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { link_data: Link };
    expect(data.link_data.original_url).toBe("https://example.com/edited");
    expect(data.link_data.short_url).toBe("edited");
    expect(data.link_data.max_clicks).toBe(5);

    const row = await env.DB.prepare("SELECT original_url, max_clicks FROM shortlinks WHERE id = ?").bind(id).first<{ original_url: string; max_clicks: number }>();
    expect(row!.original_url).toBe("https://example.com/edited");
    expect(row!.max_clicks).toBe(5);
  });

  it("soft deletes, shows in deleted, restores, hard deletes", async () => {
    const cookie = await loginAs("owner5", "pw");
    const id = await seedLink("cycle");

    await SELF.fetch(`https://example.com/links/delete/${id}`, postForm(cookie, {}));
    const gone = await env.DB.prepare("SELECT expired, deleted FROM shortlinks WHERE id = ?").bind(id).first<{ expired: number; deleted: number }>();
    expect(gone!.deleted).toBe(1);

    const deletedPage = await SELF.fetch("https://example.com/links/deleted", { headers: cookieHeader(cookie) });
    expect(await deletedPage.text()).toContain("cycle");

    const restore = await SELF.fetch(`https://example.com/links/restore/${id}`, postForm(cookie, {}));
    expect(restore.status).toBe(302);
    const back = await env.DB.prepare("SELECT expired, deleted FROM shortlinks WHERE id = ?").bind(id).first<{ expired: number; deleted: number }>();
    expect(back!.deleted).toBe(0);

    await seedVisit(id);
    await SELF.fetch(`https://example.com/links/hard_delete/${id}`, postForm(cookie, {}));
    const link = await env.DB.prepare("SELECT id FROM shortlinks WHERE id = ?").bind(id).first();
    const visit = await env.DB.prepare("SELECT id FROM visits WHERE short_url_id = ?").bind(id).first();
    expect(link).toBeNull();
    expect(visit).toBeNull();
  });
});

describe("visits/data", () => {
  it("returns the DataTables envelope with nested shortlink", async () => {
    const cookie = await loginAs("viewer", "pw");
    const id = await seedLink("visited");
    await seedVisit(id);

    const res = await SELF.fetch("https://example.com/visits/data?draw=1&start=0&length=-1", { headers: cookieHeader(cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      data: Array<{ ip_address: string; shortlink: { short_url: string | null } }>;
      recordsFiltered: number;
      recordsTotal: number;
      draw: number;
    };
    expect(data.draw).toBe(1);
    expect(data.recordsTotal).toBe(1);
    expect(data.recordsFiltered).toBe(1);
    expect(data.data[0]!.shortlink.short_url).toBe("visited");
    expect(data.data[0]!.ip_address).toBe("203.0.113.7");
  });

  it("filters by search term", async () => {
    const cookie = await loginAs("viewer2", "pw");
    const a = await seedLink("one");
    const b = await seedLink("two");
    await seedVisit(a);
    await seedVisit(b);

    const res = await SELF.fetch("https://example.com/visits/data?draw=2&start=0&length=-1&search%5Bvalue%5D=one", {
      headers: cookieHeader(cookie),
    });
    const data = (await res.json()) as { data: unknown[]; recordsFiltered: number };
    expect(data.recordsFiltered).toBe(1);
    expect(data.data).toHaveLength(1);
  });
});
