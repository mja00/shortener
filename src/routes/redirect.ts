import { Hono } from 'hono';

import { countryName } from '../lib/countries';
import { nowISO, parseStoredTimestamp } from '../lib/db';
import { expireLink, getLinkByAlias } from '../lib/links';

import type { AppEnv } from '../types';

const redirect = new Hono<AppEnv>();

// Unknown and deleted aliases follow NOT_FOUND_BEHAVIOR; expired and used-up
// links always go home. Only a successful redirect records a visit.
redirect.get('/:alias{.+}', async (c) => {
	const db = c.env.DB;
	const alias = c.req.param('alias').replace(/\/$/, '');
	const link = await getLinkByAlias(db, alias);

	if (!link || link.deleted) {
		if (c.env.NOT_FOUND_BEHAVIOR === '404') {
			return c.text('Not Found', 404);
		}
		return c.redirect('/', 302);
	}
	if (link.expired) {
		return c.redirect('/', 302);
	}

	// An unparseable date is NaN, which compares false, so the link stays live.
	const pastExpiry = link.expiration_date !== null && parseStoredTimestamp(link.expiration_date) < Date.now();
	const usedUp = link.max_clicks !== -1 && link.current_clicks >= link.max_clicks;
	if (pastExpiry || usedUp) {
		await expireLink(db, link.id);
		return c.redirect('/', 302);
	}

	const now = nowISO();
	const country = c.req.header('CF-IPCountry') ?? 'XX';
	await db.batch([
		db.prepare('UPDATE shortlinks SET current_clicks = current_clicks + 1, updated_at = ? WHERE id = ?').bind(now, link.id),
		db.prepare(
			'INSERT INTO visits (short_url_id, ip_address, user_agent, country, country_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).bind(
			link.id,
			c.req.header('CF-Connecting-IP') ?? '',
			c.req.header('User-Agent') ?? '',
			country,
			countryName(country),
			now,
			now,
		),
	]);

	return c.redirect(link.original_url, 302);
});

export { redirect };
