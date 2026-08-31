import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';

import { generateUniqueAlias } from '../lib/alias';
import {
	SESSION_COOKIE,
	getSessionUser,
	hashPassword,
	requireSession,
	sessionCookieOptions,
	signSession,
	verifyPassword,
} from '../lib/auth';
import {
	all,
	first,
	nowISO,
	run,
} from '../lib/db';
import { normalizeAlias, normalizeExpiration } from '../lib/normalize';
import { linkToDict } from '../lib/serialize';
import { createPage } from '../views/create';
import { indexPage } from '../views/index';
import { linksPage } from '../views/links';
import { loginPage } from '../views/login';
import { registerPage } from '../views/register';
import { visitsPage } from '../views/visits';

import type { AppEnv } from '../index';
import type { Link, User, Visit } from '../types';
import type { Context } from 'hono';

const web = new Hono<AppEnv>();

// Flash messages ride query params on the redirect (Flask used the session);
// the base view renders them into the same bootstrap alert block.
function flashUrl(path: string, msg: string, msgType: string): string {
	const params = new URLSearchParams({ msg, msg_type: msgType });
	return `${path}?${params.toString()}`;
}

function viewOpts(c: Context<AppEnv>) {
	const url = new URL(c.req.url);
	const theme = typeof c.env.THEME === 'string' && c.env.THEME ? c.env.THEME : 'darkly';
	return {
		theme,
		msg: url.searchParams.get('msg') ?? undefined,
		msg_type: url.searchParams.get('msg_type') ?? undefined,
	};
}

web.get('/login', c => c.html(loginPage(viewOpts(c))));

web.post('/login', async (c) => {
	const form = await c.req.parseBody();
	const username = typeof form.username === 'string' ? form.username : '';
	const password = typeof form.password === 'string' ? form.password : '';

	if (!username || !password) {
		return c.redirect(flashUrl('/login', 'Please fill out all fields.', 'danger'), 302);
	}

	const user = await first<User>(c.env.DB, 'SELECT * FROM users WHERE username = ?', username);
	if (!user || !(await verifyPassword(password, user.password))) {
		return c.redirect(flashUrl('/login', 'Incorrect details.', 'danger'), 302);
	}

	// Transparent upgrade: pre-migration Werkzeug pbkdf2 hashes re-hash to
	// bcrypt after a successful login, so the legacy format disappears.
	if (user.password.startsWith('pbkdf2:')) {
		await run(
			c.env.DB,
			'UPDATE users SET password = ?, updated_at = ? WHERE id = ?',
			hashPassword(password),
			nowISO(),
			user.id,
		);
	}

	const token = await signSession({ id: user.id, username: user.username }, c.env.SECRET_KEY);
	setCookie(c, SESSION_COOKIE, token, sessionCookieOptions);
	return c.redirect(flashUrl('/', 'You are now logged in.', 'success'), 302);
});

web.get('/logout', requireSession, (c) => {
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
	return c.redirect(flashUrl('/', 'You are now logged out.', 'success'), 302);
});

web.get('/register', c => c.html(registerPage(viewOpts(c))));

web.post('/register', async (c) => {
	// Parity fix: the original computed the redirect then fell through.
	const disabled = typeof c.env.DISABLE_REGISTRATION === 'string'
		&& ['true', '1', 't'].includes(c.env.DISABLE_REGISTRATION.toLowerCase());
	if (disabled) {
		return c.redirect('/', 302);
	}

	const form = await c.req.parseBody();
	const username = typeof form.username === 'string' ? form.username : '';
	const password = typeof form.password === 'string' ? form.password : '';
	const confirm = typeof form.confirm === 'string' ? form.confirm : '';

	if (!username || !password || !confirm) {
		return c.redirect(flashUrl('/register', 'Please fill out all fields.', 'danger'), 302);
	}
	if (password !== confirm) {
		return c.redirect(flashUrl('/register', 'Passwords do not match.', 'danger'), 302);
	}
	if (await first<User>(c.env.DB, 'SELECT * FROM users WHERE username = ?', username)) {
		return c.redirect(flashUrl('/register', 'Username is taken.', 'danger'), 302);
	}

	const now = nowISO();
	try {
		await run(
			c.env.DB,
			'INSERT INTO users (username, password, created_at, updated_at) VALUES (?, ?, ?, ?)',
			username,
			hashPassword(password),
			now,
			now,
		);
	} catch (e) {
		return c.redirect(flashUrl('/register', `Error: ${e}`, 'danger'), 302);
	}
	return c.redirect(flashUrl('/login', 'Account created!', 'success'), 302);
});

web.get('/', async (c) => {
	const rootRedirect = typeof c.env.ROOT_REDIRECT === 'string' ? c.env.ROOT_REDIRECT : '';
	const user = await getSessionUser(c);
	if (rootRedirect && !user) {
		return c.redirect(rootRedirect, 302);
	}
	return c.html(indexPage({ ...viewOpts(c), user }));
});

web.get('/create', requireSession, c => c.html(createPage(viewOpts(c))));

web.post('/create', requireSession, async (c) => {
	const form = await c.req.parseBody();
	const url = typeof form.url === 'string' ? form.url : '';
	const user = c.get('user');

	// Blank alias → random unique; otherwise keep the user's choice and let the
	// taken-check below reject duplicates, as the original did.
	const requested = normalizeAlias(typeof form.alias === 'string' ? form.alias : '');
	const alias = requested === '' ? await generateUniqueAlias(c.env.DB) : requested;

	if (await first<Link>(c.env.DB, 'SELECT 1 FROM shortlinks WHERE short_url = ?', alias)) {
		return c.redirect(flashUrl('/create', 'Alias already exists. Please try again.', 'danger'), 302);
	}

	const expiration = normalizeExpiration(typeof form.expiration_date === 'string' ? form.expiration_date : '');
	if (expiration === 'invalid') {
		return c.redirect(flashUrl('/create', 'Error: Invalid expiration date', 'danger'), 302);
	}

	const rawMax = typeof form.max_clicks === 'string' ? Number(form.max_clicks) : -1;
	const maxClicks = Number.isFinite(rawMax) ? rawMax : -1;
	const now = nowISO();
	try {
		await run(
			c.env.DB,
			'INSERT INTO shortlinks (original_url, short_url, expired, expiration_date, max_clicks, current_clicks, deleted, created_by, created_at, updated_at) VALUES (?, ?, 0, ?, ?, 0, 0, ?, ?, ?)',
			url,
			alias,
			expiration,
			maxClicks,
			user.id,
			now,
			now,
		);
	} catch (e) {
		return c.redirect(flashUrl('/create', `Error: ${e}`, 'danger'), 302);
	}
	return c.redirect(flashUrl('/links', 'Short link created successfully!', 'success'), 302);
});

web.get('/links', requireSession, async (c) => {
	const links = await all<Link>(c.env.DB, 'SELECT * FROM shortlinks WHERE deleted = 0 AND expired = 0');
	return c.html(linksPage({ ...viewOpts(c), user: c.get('user'), links }));
});

web.get('/links/deleted', requireSession, async (c) => {
	const links = await all<Link>(c.env.DB, 'SELECT * FROM shortlinks WHERE deleted = 1');
	return c.html(linksPage({ ...viewOpts(c), user: c.get('user'), links }));
});

web.get('/links/expired', requireSession, async (c) => {
	const links = await all<Link>(c.env.DB, 'SELECT * FROM shortlinks WHERE expired = 1');
	return c.html(linksPage({ ...viewOpts(c), user: c.get('user'), links }));
});

web.get('/links/info/:id', requireSession, async (c) => {
	const link = await first<Link>(c.env.DB, 'SELECT * FROM shortlinks WHERE id = ?', c.req.param('id'));
	if (!link) {
		return c.json({ error: 'Short link not found' });
	}

	const owner = link.created_by === null
		? null
		: await first<User>(c.env.DB, 'SELECT username FROM users WHERE id = ?', link.created_by);
	const dict = linkToDict(link);
	dict.created_by = owner ? owner.username : 'Unknown';
	return c.json(dict);
});

web.post('/links/edit/:id', requireSession, async (c) => {
	const link = await first<Link>(c.env.DB, 'SELECT * FROM shortlinks WHERE id = ?', c.req.param('id'));
	if (!link) {
		return c.json({ error: 'Short link not found' });
	}

	const form = await c.req.parseBody();
	const url = typeof form.url === 'string' ? form.url : '';
	const alias = normalizeAlias(typeof form.alias === 'string' ? form.alias : '');
	const rawMax = typeof form.max_clicks === 'string' ? Number(form.max_clicks) : -1;
	const maxClicks = Number.isFinite(rawMax) ? rawMax : -1;
	const expiration = normalizeExpiration(typeof form.expiration_date === 'string' ? form.expiration_date : '');

	const now = nowISO();
	try {
		await run(
			c.env.DB,
			'UPDATE shortlinks SET original_url = ?, short_url = ?, max_clicks = ?, expiration_date = ?, updated_at = ? WHERE id = ?',
			url,
			alias,
			maxClicks,
			expiration === 'invalid' ? null : expiration,
			now,
			link.id,
		);
	} catch (e) {
		// Parity with the original DataError handler: a UNIQUE alias clash comes
		// back as a 200 JSON error, not an HTTP failure.
		return c.json({ error: `Error: ${e}` });
	}
	const updated = await first<Link>(c.env.DB, 'SELECT * FROM shortlinks WHERE id = ?', link.id);
	return c.json({
		success: 'Short link updated successfully',
		link_data: updated ? linkToDict(updated) : null,
	});
});

web.post('/links/delete/:id', requireSession, async (c) => {
	await run(
		c.env.DB,
		'UPDATE shortlinks SET expired = 1, deleted = 1, updated_at = ? WHERE id = ?',
		nowISO(),
		c.req.param('id'),
	);
	return c.redirect(flashUrl('/links', 'Short link deleted successfully!', 'success'), 302);
});

web.post('/links/hard_delete/:id', requireSession, async (c) => {
	const id = c.req.param('id');
	// Visits go first so the D1 FK constraint is satisfied.
	await c.env.DB.batch([
		c.env.DB.prepare('DELETE FROM visits WHERE short_url_id IN (SELECT id FROM shortlinks WHERE id = ?)').bind(id),
		c.env.DB.prepare('DELETE FROM shortlinks WHERE id = ?').bind(id),
	]);
	return c.redirect(flashUrl('/links', 'Short link deleted successfully!', 'success'), 302);
});

web.post('/links/restore/:id', requireSession, async (c) => {
	await run(
		c.env.DB,
		'UPDATE shortlinks SET expired = 0, deleted = 0, updated_at = ? WHERE id = ?',
		nowISO(),
		c.req.param('id'),
	);
	return c.redirect(flashUrl('/links/deleted', 'Short link restored successfully!', 'success'), 302);
});

web.get('/visits', requireSession, c => c.html(visitsPage({ ...viewOpts(c), user: c.get('user') })));

interface VisitRow extends Visit {
	_short_url: string | null;
}

function visitToDict(row: VisitRow) {
	const { _short_url, ...visit } = row;
	return {
		...visit,
		shortlink: {
			// A missing link (should not happen with the FK) serializes like the
			// original would on a dangling backref: null fields.
			short_url: _short_url,
		},
	};
}

// DataTables server-side endpoint. Original Visit.to_dict nests the link dict
// under `shortlink`; the join provides it. Sensible defaults replace the
// original's undefined-offset behavior when params are absent.
web.get('/visits/data', requireSession, async (c) => {
	const url = new URL(c.req.url);
	const search = url.searchParams.get('search[value]') ?? '';
	const start = Number(url.searchParams.get('start') ?? '0') || 0;
	const rawLength = url.searchParams.get('length');
	const length = rawLength === null || rawLength === '' || Number.isNaN(Number(rawLength)) ? -1 : Number(rawLength);
	const draw = Number(url.searchParams.get('draw') ?? '0') || 0;

	const like = `%${search}%`;
	const filterClause = search
		? 'WHERE v.ip_address LIKE ? OR v.country_name LIKE ? OR v.user_agent LIKE ? OR s.short_url LIKE ?'
		: '';
	const filterParams = search ? [like, like, like, like] : [];

	const filtered = await first<{ n: number; }>(
		c.env.DB,
		`SELECT COUNT(*) AS n FROM visits v LEFT JOIN shortlinks s ON s.id = v.short_url_id ${filterClause}`,
		...filterParams,
	);
	const total = await first<{ n: number; }>(c.env.DB, 'SELECT COUNT(*) AS n FROM visits');

	const pageClause = length === -1 ? '' : ' LIMIT ? OFFSET ?';
	const pageParams = length === -1 ? [] : [length, start];
	const rows = await all<VisitRow>(
		c.env.DB,
		`SELECT v.*, s.short_url AS _short_url FROM visits v LEFT JOIN shortlinks s ON s.id = v.short_url_id ${filterClause} ORDER BY v.id DESC${pageClause}`,
		...filterParams,
		...pageParams,
	);

	return c.json({
		data: rows.map(row => visitToDict(row)),
		recordsFiltered: filtered?.n ?? 0,
		recordsTotal: total?.n ?? 0,
		draw,
	});
});

export { web };
