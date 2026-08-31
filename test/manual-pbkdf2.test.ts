import { pbkdf2Sync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyPassword } from '../src/lib/auth';

describe('manual PBKDF2 vs Node reference', () => {
	it('matches pbkdf2Sync for 260k iterations', async () => {
		const password = 'correct-horse-battery';
		const salt = 'lWDJ8tSVNgiQH8wO';
		const reference = pbkdf2Sync(password, salt, 260000, 32, 'sha256').toString('hex');
		const werkzeugHash = `pbkdf2:sha256:260000$${salt}$${reference}`;
		expect(await verifyPassword(password, werkzeugHash)).toBe(true);
		expect(await verifyPassword('wrong', werkzeugHash)).toBe(false);
	});

	it('handles multi-block output (64 bytes sha256)', async () => {
		const password = 'p2';
		const salt = 's2';
		const reference = pbkdf2Sync(password, salt, 150000, 64, 'sha256').toString('hex');
		const werkzeugHash = `pbkdf2:sha256:150000$${salt}$${reference}`;
		expect(await verifyPassword(password, werkzeugHash)).toBe(true);
	});
});
