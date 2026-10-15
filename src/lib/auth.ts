import { compareSync, hashSync } from 'bcryptjs';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { SignJWT, jwtVerify } from 'jose';

import type { AppEnv, SessionUser } from '../types';
import type { Context, Next } from 'hono';

const encoder = new TextEncoder();

export const SESSION_COOKIE = 'session';

// Constant-time compare without Node crypto (unavailable in Workers): lengths
// fold into the accumulator so a mismatch still walks the shorter input.
function safeEqual(a: string, b: string): boolean {
	const ab = encoder.encode(a);
	const bb = encoder.encode(b);
	let diff = ab.length === bb.length ? 0 : 1;
	const min = Math.min(ab.length, bb.length);
	for (let i = 0; i < min; i++) {
		diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
	}
	return diff === 0;
}

export async function requireApiKey(c: Context<AppEnv>, next: Next) {
	const provided = c.req.header('Authorization');
	if (!c.env.API_KEY || !provided || !safeEqual(provided, c.env.API_KEY)) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
}

export function hashPassword(password: string): string {
	return hashSync(password, 10);
}

const PBKDF2_DIGESTS: Record<string, { algo: string; length: number; }> = {
	sha1: { algo: 'SHA-1', length: 20 },
	sha256: { algo: 'SHA-256', length: 32 },
	sha512: { algo: 'SHA-512', length: 64 },
};

// The Workers runtime caps crypto.subtle PBKDF2 at 100k iterations, so
// Werkzeug's 260k-iteration hashes are derived by hand from HMAC, which has
// no cap. Slow, but it runs once per legacy user before the bcrypt upgrade.
async function pbkdf2Hex(password: string, salt: string, iterations: number, dkLen: number, digest: { algo: string; length: number; }): Promise<string> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: digest.algo }, false, ['sign']);
	const saltBytes = encoder.encode(salt);
	const out = new Uint8Array(dkLen);

	for (let offset = 0, block = 1; offset < dkLen; offset += digest.length, block++) {
		// U1 = HMAC(P, salt || INT_32_BE(block)), then U_i = HMAC(P, U_{i-1}), XORed together.
		const firstInput = new Uint8Array(saltBytes.length + 4);
		firstInput.set(saltBytes);
		new DataView(firstInput.buffer).setUint32(saltBytes.length, block);

		let prev = new Uint8Array(await crypto.subtle.sign('HMAC', key, firstInput));
		const acc = new Uint8Array(prev);
		for (let i = 1; i < iterations; i++) {
			prev = new Uint8Array(await crypto.subtle.sign('HMAC', key, prev));
			for (const [index, byte] of prev.entries()) {
				acc[index] = (acc[index] ?? 0) ^ byte;
			}
		}
		out.set(acc.subarray(0, dkLen - offset), offset);
	}
	return [...out].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Werkzeug hashes from the Flask era: "pbkdf2:<method>:<iterations>$<salt>$<hex>".
async function verifyPbkdf2(password: string, hash: string): Promise<boolean> {
	const parts = hash.split('$');
	if (parts.length !== 3) {
		return false;
	}
	const [head = '', salt, expected] = parts;
	const [method = '', iterStr = ''] = head.slice('pbkdf2:'.length).split(':', 2);
	const digest = PBKDF2_DIGESTS[method];
	const iterations = Number(iterStr);
	if (!digest || !salt || !expected || !Number.isSafeInteger(iterations) || iterations < 1) {
		return false;
	}
	const derived = await pbkdf2Hex(password, salt, iterations, expected.length / 2, digest);
	return safeEqual(derived, expected);
}

export function isLegacyHash(hash: string): boolean {
	return hash.startsWith('pbkdf2:');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	if (isLegacyHash(hash)) {
		return verifyPbkdf2(password, hash);
	}
	return compareSync(password, hash);
}

export async function signSession(user: SessionUser, secret: string): Promise<string> {
	return new SignJWT({ id: user.id, username: user.username })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('7d')
		.sign(encoder.encode(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
	try {
		const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] });
		if (typeof payload.id !== 'number' || typeof payload.username !== 'string') {
			return null;
		}
		return { id: payload.id, username: payload.username };
	} catch {
		return null;
	}
}

export async function getSessionUser(c: Context<AppEnv>): Promise<SessionUser | null> {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token || !c.env.SECRET_KEY) {
		return null;
	}
	return verifySession(token, c.env.SECRET_KEY);
}

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
	const user = await getSessionUser(c);
	if (!user) {
		return c.redirect('/login', 302);
	}
	c.set('user', user);
	await next();
});

// Secure follows the request scheme so the cookie still sets on plain-http `wrangler dev`.
export function sessionCookieOptions(c: Context<AppEnv>) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
		secure: new URL(c.req.url).protocol === 'https:',
		maxAge: 60 * 60 * 24 * 7, // matches the JWT expiry
	} as const;
}
