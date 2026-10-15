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

	// Block offsets once assumed a 32-byte digest, misplacing every sha1 block after the first.
	it('handles multi-block sha1 output (40 bytes)', async () => {
		const reference = pbkdf2Sync('p3', 's3', 1000, 40, 'sha1').toString('hex');
		const werkzeugHash = `pbkdf2:sha1:1000$s3$${reference}`;
		expect(await verifyPassword('p3', werkzeugHash)).toBe(true);
		expect(await verifyPassword('wrong', werkzeugHash)).toBe(false);
	});

	it('rejects an unsupported pbkdf2 digest', async () => {
		const reference = pbkdf2Sync('p4', 's4', 1000, 32, 'sha256').toString('hex');
		expect(await verifyPassword('p4', `pbkdf2:md5:1000$s4$${reference}`)).toBe(false);
	});
});
