import { describe, expect, it } from "vitest";
import { hashPassword, signSession, verifyPassword, verifySession } from "../src/lib/auth";

const SECRET = "test-secret-key";

describe("hashPassword/verifyPassword", () => {
  it("roundtrips a password", () => {
    const hash = hashPassword("hunter2");
    expect(hash).not.toBe("hunter2");
    expect(verifyPassword("hunter2", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("hunter2");
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces a bcrypt-format hash", () => {
    expect(hashPassword("x")).toMatch(/^\$2[aby]\$/);
  });
});

describe("signSession/verifySession", () => {
  it("roundtrips a session", async () => {
    const token = await signSession({ id: 42, username: "alice" }, SECRET);
    const user = await verifySession(token, SECRET);
    expect(user).toEqual({ id: 42, username: "alice" });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({ id: 1, username: "alice" }, SECRET);
    const parts = token.split(".");
    parts[2] = `${parts[2]!.slice(0, -2)}xx`;
    expect(await verifySession(parts.join("."), SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ id: 1, username: "alice" }, "other-secret");
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejects garbage tokens", async () => {
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
  });
});
