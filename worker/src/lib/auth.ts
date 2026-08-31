// Parity with Flask API: raw Authorization header (no Bearer prefix), 401 JSON
// on unset key, missing header, or mismatch.
import type { Context, Next } from "hono";
import type { Bindings } from "../index";

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
