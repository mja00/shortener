import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Link, Visit } from "../src/types";

const PAST = "2020-01-01T00:00:00.000Z";

async function seedLink(shortUrl: string, extra: Partial<Link> = {}) {
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
}

async function getLink(alias: string): Promise<Link> {
  const row = await env.DB.prepare("SELECT * FROM shortlinks WHERE short_url = ?").bind(alias).first<Link>();
  expect(row).not.toBeNull();
  return row as Link;
}

async function getVisits(alias: string): Promise<Visit[]> {
  const { results } = await env.DB.prepare(
    "SELECT v.* FROM visits v JOIN shortlinks s ON s.id = v.short_url_id WHERE s.short_url = ? ORDER BY v.id",
  )
    .bind(alias)
    .all<Visit>();
  return results ?? [];
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM visits").run();
  await env.DB.prepare("DELETE FROM shortlinks").run();
  await seedLink("xyZab");
  await seedLink("expiredlink", { expired: 1 });
  await seedLink("datelink", { expiration_date: PAST });
  await seedLink("maxlink", { max_clicks: 5, current_clicks: 5 });
  await seedLink("deletedlink", { deleted: 1 });
});

describe("GET /:alias redirect engine", () => {
  it("redirects an active alias to its original URL and records a visit", async () => {
    const res = await SELF.fetch("https://example.com/xyZab", {
      headers: { "CF-Connecting-IP": "203.0.113.9", "CF-IPCountry": "DE", "User-Agent": "vitest-agent" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.com/xyZab");

    const link = await getLink("xyZab");
    expect(link.current_clicks).toBe(1);

    const visits = await getVisits("xyZab");
    expect(visits).toHaveLength(1);
    const visit = visits[0] as Visit;
    expect(visit.country).toBe("DE");
    expect(visit.country_name).toBe("Germany");
    expect(visit.ip_address).toBe("203.0.113.9");
    expect(visit.user_agent).toBe("vitest-agent");
  });

  it("strips a trailing slash before lookup", async () => {
    const res = await SELF.fetch("https://example.com/xyZab/", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.com/xyZab");
    expect((await getLink("xyZab")).current_clicks).toBe(1);
  });

  it("falls back to / for an already-expired link without recording a visit", async () => {
    const res = await SELF.fetch("https://example.com/expiredlink", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(await getVisits("expiredlink")).toHaveLength(0);
  });

  it("marks a date-expired link expired and redirects to / without a visit", async () => {
    const res = await SELF.fetch("https://example.com/datelink", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect((await getLink("datelink")).expired).toBe(1);
    expect(await getVisits("datelink")).toHaveLength(0);
  });

  it("marks a max-clicks-exhausted link expired and redirects to / without a visit", async () => {
    const res = await SELF.fetch("https://example.com/maxlink", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect((await getLink("maxlink")).expired).toBe(1);
    expect(await getVisits("maxlink")).toHaveLength(0);
  });

  it("treats an expired link's visit count as untouched", async () => {
    await SELF.fetch("https://example.com/expiredlink", { redirect: "manual" });
    const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM visits").all<{ n: number }>();
    expect(results?.[0]?.n).toBe(0);
  });
});
