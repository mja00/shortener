import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { generateUniqueAlias, randomString } from "../src/lib/alias";

describe("randomString", () => {
  it("produces the requested length within [A-Za-z0-9]", () => {
    for (let i = 0; i < 100; i++) {
      const s = randomString(15);
      expect(s).toHaveLength(15);
      expect(s).toMatch(/^[A-Za-z0-9]+$/);
    }
  });
});

describe("generateUniqueAlias", () => {
  it("returns the preferred alias when free", async () => {
    const alias = await generateUniqueAlias(env.DB, "freealias");
    expect(alias).toBe("freealias");
  });

  it("falls back to a random 15-char alias when preferred is taken", async () => {
    const ts = Date.now();
    await env.DB.prepare(
      "INSERT INTO shortlinks (original_url, short_url, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )
      .bind(`https://example.com/taken-${ts}`, "takenalias", new Date().toISOString(), new Date().toISOString())
      .run();
    const alias = await generateUniqueAlias(env.DB, "takenalias");
    expect(alias).not.toBe("takenalias");
    expect(alias).toHaveLength(15);
    expect(alias).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("generates a random alias when no preferred alias given", async () => {
    const alias = await generateUniqueAlias(env.DB);
    expect(alias).toHaveLength(15);
    expect(alias).toMatch(/^[A-Za-z0-9]+$/);
  });
});
