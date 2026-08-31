import { describe, expect, it } from 'vitest';

import {
	hashPassword,
	signSession,
	verifyPassword,
	verifySession,
} from '../src/lib/auth';

const SECRET = 'test-secret-key';

describe('hashPassword/verifyPassword', () => {
	it('roundtrips a password', async () => {
		const hash = hashPassword('hunter2');
		expect(hash).not.toBe('hunter2');
		expect(await verifyPassword('hunter2', hash)).toBe(true);
	});

	it('verifies Werkzeug pbkdf2 hashes (migrated data)', async () => {
		// Format: pbkdf2:sha256:<iters>$<urlsafe-b64-salt>$<hex digest>
		const subtle = crypto.subtle;
		const key = await subtle.importKey('raw', new TextEncoder().encode('hunter2'), 'PBKDF2', false, ['deriveBits']);
		const salt = 'lWDJ8tSVNgiQH8wO';
		const bits = await subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 260000 },
			key,
			256,
		);
		const hex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
		const werkzeugHash = `pbkdf2:sha256:260000$${salt}$${hex}`;
		expect(await verifyPassword('hunter2', werkzeugHash)).toBe(true);
		expect(await verifyPassword('wrong', werkzeugHash)).toBe(false);
	});

	it('rejects malformed pbkdf2 hashes', async () => {
		expect(await verifyPassword('x', 'pbkdf2:sha256:notanumber$abc$def')).toBe(false);
		expect(await verifyPassword('x', 'pbkdf2:sha256:260000')).toBe(false);
	});

	it('rejects a wrong password', async () => {
		const hash = hashPassword('hunter2');
		expect(await verifyPassword('wrong', hash)).toBe(false);
	});

	it('produces a bcrypt-format hash', () => {
		expect(hashPassword('x')).toMatch(/^\$2[aby]\$/);
	});
});

describe('signSession/verifySession', () => {
	it('roundtrips a session', async () => {
		const token = await signSession({ id: 42, username: 'alice' }, SECRET);
		const user = await verifySession(token, SECRET);
		expect(user).toEqual({ id: 42, username: 'alice' });
	});

	it('rejects a tampered token', async () => {
		const token = await signSession({ id: 1, username: 'alice' }, SECRET);
		const parts = token.split('.');
		parts[2] = `${parts[2]!.slice(0, -2)}xx`;
		expect(await verifySession(parts.join('.'), SECRET)).toBeNull();
	});

	it('rejects a token signed with a different secret', async () => {
		const token = await signSession({ id: 1, username: 'alice' }, 'other-secret');
		expect(await verifySession(token, SECRET)).toBeNull();
	});

	it('rejects garbage tokens', async () => {
		expect(await verifySession('not-a-jwt', SECRET)).toBeNull();
	});
});
