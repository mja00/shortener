import { Hono } from "hono";
import type { Bindings } from "../index";
import { countryName } from "../lib/countries";
import { first, nowISO } from "../lib/db";
import type { Link } from "../types";

const redirect = new Hono<{ Bindings: Bindings }>();

// Parity with Flask: unknown alias, expired, used-up and deleted links all
// fall back to NOT_FOUND_BEHAVIOR; only the success path records a visit.
redirect.get("/:alias{.+}", async (c) => {
  let alias = c.req.path.slice(1);
  if (alias.endsWith("/")) alias = alias.slice(0, -1);

  const link = await first<Link>(c.env.DB, "SELECT * FROM shortlinks WHERE short_url = ?", alias);

  const notFound = () => {
    if (c.env.NOT_FOUND_BEHAVIOR === "404") return c.text("Not Found", 404);
    return c.redirect("/", 302);
  };

  if (!link || link.deleted) return notFound();
  if (link.expired) return c.redirect("/", 302);

  const now = nowISO();
  if (link.expiration_date && link.expiration_date < now) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE shortlinks SET expired = 1, updated_at = ? WHERE id = ?").bind(now, link.id),
    ]);
    return c.redirect("/", 302);
  }

  if (link.max_clicks !== -1 && link.current_clicks >= link.max_clicks) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE shortlinks SET expired = 1, updated_at = ? WHERE id = ?").bind(now, link.id),
    ]);
    return c.redirect("/", 302);
  }

  const ip = c.req.header("CF-Connecting-IP") ?? "";
  const userAgent = c.req.header("User-Agent") ?? "";
  const country = c.req.header("CF-IPCountry") ?? "XX";

  // Atomic increment + visit insert in one batch; visit rows exist only on
  // the success path, so failed lookups never inflate analytics.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE shortlinks SET current_clicks = current_clicks + 1, updated_at = ? WHERE id = ?").bind(
      now,
      link.id,
    ),
    c.env.DB.prepare(
      "INSERT INTO visits (short_url_id, ip_address, user_agent, country, country_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(link.id, ip, userAgent, country, countryName(country), now, now),
  ]);

  return c.redirect(link.original_url, 302);
});

export { redirect };
