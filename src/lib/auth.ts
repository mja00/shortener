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

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith("pbkdf2:")) {
    const derived = await verifyPbkdf2(password, hash);
    return derived;
  }
  return compareSync(password, hash);
}

// Werkzeug 2.x pbkdf2 hashes ("pbkdf2:sha256:<iters>$<salt>$<hex>") from the
// migrated Postgres data; bcryptjs can't read them, so verify natively here.
// Web login transparently upgrades these to bcrypt on success (see routes/web).
async function verifyPbkdf2(password: string, hash: string): Promise<boolean> {
  // "pbkdf2:<method>:<iterations>$<salt>$<hexdigest>" — the $-segments come
  // after the LAST colon, so split $ first, then method/iterations off the head.
  const dollar = hash.split("$");
  if (dollar.length !== 3) return false;
  const [method, iterStr] = dollar[0]!.slice("pbkdf2:".length).split(":");
  const salt = dollar[1]!;
  const expected = dollar[2]!;
  if (!method || !iterStr || !salt || !expected) return false;
  const iterations = parseInt(iterStr, 10);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const derived = await pbkdf2Derive(password, salt, iterations, expected.length / 2, method);
  return derived !== null && safeEqual(derived, expected);
}

// The Workers runtime caps crypto.subtle PBKDF2 at 100k iterations, so
// Werkzeug's 260k-iteration hashes must be derived manually: PBKDF2 is the
// XOR chain of HMAC(password, U_{i-1}). HMAC via WebCrypto has no cap.
// Slow (~seconds of CPU) but runs at most once per legacy user — the hash
// upgrades to bcrypt after a successful login.
async function pbkdf2Derive(
  password: string, salt: string, iterations: number, lengthBytes: number, method: string
): Promise<string | null> {
  const algo = method === "sha512" ? "SHA-512" : method === "sha1" ? "SHA-1" : "SHA-256";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "HMAC", hash: algo }, false, ["sign"]
  );
  const enc = new TextEncoder();
  const dkLen = lengthBytes;
  const blocks = Math.ceil(dkLen / (algo === "SHA-512" ? 64 : 32));
  const out = new Uint8Array(dkLen);
  const saltBytes = enc.encode(salt);

  for (let block = 1; block <= blocks; block++) {
    const blockBytes = new Uint8Array(4);
    new DataView(blockBytes.buffer).setUint32(0, block);
    // U1 = HMAC(P, salt || INT(block))
    const mac = await crypto.subtle.sign(
      "HMAC", key,
      concatBytes(saltBytes, blockBytes)
    );
    let u = new Uint8Array(mac);
    const xorAcc = new Uint8Array(u);
    for (let i = 1; i < iterations; i++) {
      const ui = new Uint8Array(await crypto.subtle.sign("HMAC", key, u));
      for (let j = 0; j < ui.length; j++) xorAcc[j] = (xorAcc[j] ?? 0) ^ ui[j]!;
      u = ui;
    }
    out.set(xorAcc.subarray(0, Math.min(xorAcc.length, dkLen - (block - 1) * (algo === "SHA-512" ? 64 : 32))), (block - 1) * (algo === "SHA-512" ? 64 : 32));
  }
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
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
