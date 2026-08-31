import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { compareSync, hashSync } from "bcryptjs";
import type { AppEnv, Bindings } from "../index";

// Constant-time compare without Node crypto (unavailable in Workers): UTF-8
// bytes, lengths folded into the accumulator, XOR over the min length.
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length === bb.length ? 0 : 1;
  const min = Math.min(ab.length, bb.length);
  for (let i = 0; i < min; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export async function requireApiKey(c: Context<{ Bindings: Bindings }>, next: Next) {
  const provided = c.req.header("Authorization");
  if (!c.env.API_KEY || !provided || !safeEqual(provided, c.env.API_KEY)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}

export interface SessionUser {
  id: number;
  username: string;
}

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7d, matches the JWT expiry

export function hashPassword(password: string): string {
  return hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return compareSync(password, hash);
}

function keyBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser, secret: string): Promise<string> {
  return new SignJWT({ id: user.id, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(keyBytes(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, keyBytes(secret), { algorithms: ["HS256"] });
    if (typeof payload.id !== "number" || typeof payload.username !== "string") return null;
    return { id: payload.id, username: payload.username };
  } catch {
    return null;
  }
}

export async function getSessionUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !c.env.SECRET_KEY) return null;
  return verifySession(token, c.env.SECRET_KEY);
}

export async function requireSession(c: Context<AppEnv>, next: Next) {
  const user = await getSessionUser(c);
  if (!user) return c.redirect("/login", 302);
  c.set("user", user);
  await next();
}

export const sessionCookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "Lax",
  maxAge: SESSION_MAX_AGE,
} as const;
