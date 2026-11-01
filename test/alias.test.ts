import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { generateUniqueAlias, randomString } from '../src/lib/alias';

describe('randomString', () => {
	it('produces the requested length within [A-Za-z0-9]', () => {
		for (let i = 0; i < 100; i++) {
			const alias = randomString(15);
			expect(alias).toHaveLength(15);
			expect(alias).toMatch(/^[A-Z0-9]+$/i);
		}
	});
});

describe('generateUniqueAlias', () => {
	it('generates a random 15-char alias', async () => {
		const alias = await generateUniqueAlias(env.DB);
		expect(alias).toHaveLength(15);
		expect(alias).toMatch(/^[A-Z0-9]+$/i);
	});
});
