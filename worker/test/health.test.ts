import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await SELF.fetch("https://example.com/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
