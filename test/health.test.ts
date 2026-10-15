import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /health', () => {
	it('returns 200 ok', async () => {
		const res = await exports.default.fetch('https://example.com/health');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('ok');
	});
});
