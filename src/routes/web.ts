import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';

import { generateUniqueAlias } from '../lib/alias';
import {
	SESSION_COOKIE,
	getSessionUser,
	hashPassword,
	isLegacyHash,
	requireSession,
	sessionCookieOptions,
	signSession,
	verifyPassword,
} from '../lib/auth';
import {
	all,
	first,
	isUniqueViolation,
	nowISO,
	run,
} from '../lib/db';
import {
	aliasTaken,
	getLink,
	hardDeleteLink,
	insertLink,
	listLinks,
	setDeleted,
	updateLink,
} from '../lib/links';
import {
	INVALID_DATE,
	normalizeAlias,
	normalizeExpiration,
	normalizeMaxClicks,
} from '../lib/normalize';
import { linkToDict } from '../lib/serialize';
import { createPage } from '../views/create';
import { indexPage } from '../views/index';
import { linksPage } from '../views/links';
import { loginPage } from '../views/login';
import { registerPage } from '../views/register';
import { visitsPage } from '../views/visits';

import type { LinkBucket } from '../lib/links';
import type { AppEnv, User, Visit } from '../types';
import type { PageOptions } from '../views/base';
import type { Context } from 'hono';

const web = new Hono<AppEnv>();

// Flash messages ride query params on the redirect; the base layout renders them.
function flashUrl(path: string, msg: string, msgType: 'success' | 'danger'): string {
	return `${path}?${new URLSearchParams({ msg, msg_type: msgType }).toString()}`;
}

function pageOptions(c: Context<AppEnv>): PageOptions {
	return {
		theme: c.env.THEME || 'darkly',
		// Only populated behind requireSession.
		user: c.get('user'),
		msg: c.req.query('msg'),
		msg_type: c.req.query('msg_type'),
	};
}

// Form bodies as plain strings; file uploads are never expected.
async function readForm(c: Context<AppEnv>): Promise<Partial<Record<string, string>>> {
	const form: Partial<Record<string, string>> = {};
	for (const [key, value] of Object.entries(await c.req.parseBody())) {
		if (typeof value === 'string') {
			form[key] = value;
		}
	}
	return form;
}

web.get('/login', c => c.html(loginPage(pageOptions(c))));

web.post('/login', async (c) => {
	const { username, password } = await readForm(c);
	if (!username || !password) {
		return c.redirect(flashUrl('/login', 'Please fill out all fields.', 'danger'), 302);
	}

	const user = await first<User>(c.env.DB, 'SELECT * FROM users WHERE username = ?', username);
	if (!user || !(await verifyPassword(password, user.password))) {
		return c.redirect(flashUrl('/login', 'Incorrect details.', 'danger'), 302);
	}

	// Re-hash Flask-era pbkdf2 passwords to bcrypt so the slow legacy path runs once per user.
	if (isLegacyHash(user.password)) {
		await run(c.env.DB, 'UPDATE users SET password = ?, updated_at = ? WHERE id = ?', hashPassword(password), nowISO(), user.id);
	}

	const token = await signSession({ id: user.id, username: user.username }, c.env.SECRET_KEY);
	setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(c));
	return c.redirect(flashUrl('/', 'You are now logged in.', 'success'), 302);
});

web.get('/logout', requireSession, (c) => {
	deleteCookie(c, SESSION_COOKIE, sessionCookieOptions(c));
	return c.redirect(flashUrl('/', 'You are now logged out.', 'success'), 302);
});

// Covers GET too, so a disabled instance never shows a signup form that can't work.
web.use('/register', async (c, next) => {
	if (['true', '1', 't'].includes((c.env.DISABLE_REGISTRATION ?? '').toLowerCase())) {
		return c.redirect(flashUrl('/login', 'Registration is disabled.', 'danger'), 302);
	}
	await next();
});

web.get('/register', c => c.html(registerPage(pageOptions(c))));

web.post('/register', async (c) => {
	const { username, password, confirm } = await readForm(c);
	if (!username || !password || !confirm) {
		return c.redirect(flashUrl('/register', 'Please fill out all fields.', 'danger'), 302);
	}
	if (password !== confirm) {
		return c.redirect(flashUrl('/register', 'Passwords do not match.', 'danger'), 302);
	}
	if (await first(c.env.DB, 'SELECT 1 FROM users WHERE username = ?', username)) {
		return c.redirect(flashUrl('/register', 'Username is taken.', 'danger'), 302);
	}

	const now = nowISO();
	await run(
		c.env.DB,
		'INSERT INTO users (username, password, created_at, updated_at) VALUES (?, ?, ?, ?)',
		username,
		hashPassword(password),
		now,
		now,
	);
	return c.redirect(flashUrl('/login', 'Account created!', 'success'), 302);
});

web.get('/', async (c) => {
	const user = await getSessionUser(c);
	if (c.env.ROOT_REDIRECT && !user) {
		return c.redirect(c.env.ROOT_REDIRECT, 302);
	}
	return c.html(indexPage({ ...pageOptions(c), user }));
});

web.get('/create', requireSession, c => c.html(createPage(pageOptions(c))));

web.post('/create', requireSession, async (c) => {
	const form = await readForm(c);
	if (!form.url) {
		return c.redirect(flashUrl('/create', 'Please enter a URL.', 'danger'), 302);
	}

	const requested = normalizeAlias(form.alias);
	if (requested && await aliasTaken(c.env.DB, requested)) {
		return c.redirect(flashUrl('/create', 'Alias already exists. Please try again.', 'danger'), 302);
	}

	const expiration = normalizeExpiration(form.expiration_date);
	if (expiration === INVALID_DATE) {
		return c.redirect(flashUrl('/create', 'Error: Invalid expiration date', 'danger'), 302);
	}

	try {
		await insertLink(c.env.DB, {
			original_url: form.url,
			short_url: requested || await generateUniqueAlias(c.env.DB),
			max_clicks: normalizeMaxClicks(form.max_clicks),
			expiration_date: expiration,
		}, c.get('user').id);
	} catch (error) {
		if (!isUniqueViolation(error)) {
			throw error;
		}
		return c.redirect(flashUrl('/create', 'Alias already exists. Please try again.', 'danger'), 302);
	}
	return c.redirect(flashUrl('/links', 'Short link created successfully!', 'success'), 302);
});

const LINK_LIST_PAGES: [path: string, bucket: LinkBucket][] = [
	['/links', 'active'],
	['/links/expired', 'expired'],
	['/links/deleted', 'deleted'],
];
for (const [path, bucket] of LINK_LIST_PAGES) {
	web.get(path, requireSession, async (c) => {
		const links = await listLinks(c.env.DB, bucket);
		return c.html(linksPage({ ...pageOptions(c), links }));
	});
}

// The links page JS reads errors from a 200 JSON body, so misses are not 404s.
web.get('/links/info/:id', requireSession, async (c) => {
	const link = await getLink(c.env.DB, c.req.param('id'));
	if (!link) {
		return c.json({ error: 'Short link not found' });
	}

	const owner = link.created_by === null
		? null
		: await first<Pick<User, 'username'>>(c.env.DB, 'SELECT username FROM users WHERE id = ?', link.created_by);
	return c.json({ ...linkToDict(link), created_by: owner?.username ?? 'Unknown' });
});

web.post('/links/edit/:id', requireSession, async (c) => {
	const link = await getLink(c.env.DB, c.req.param('id'));
	if (!link) {
		return c.json({ error: 'Short link not found' });
	}

	const form = await readForm(c);
	// Blank fields keep their current value; a blank alias would orphan the link.
	const alias = normalizeAlias(form.alias) || link.short_url;
	if (alias !== link.short_url && await aliasTaken(c.env.DB, alias)) {
		return c.json({ error: 'Alias already exists.' });
	}
	const expiration = normalizeExpiration(form.expiration_date);
	if (expiration === INVALID_DATE) {
		return c.json({ error: 'Invalid expiration date.' });
	}

	let updated;
	try {
		updated = await updateLink(c.env.DB, link.id, {
			original_url: form.url || link.original_url,
			short_url: alias,
			max_clicks: normalizeMaxClicks(form.max_clicks),
			expiration_date: expiration,
		});
	} catch (error) {
		if (!isUniqueViolation(error)) {
			throw error;
		}
		return c.json({ error: 'Alias already exists.' });
	}
	return c.json({
		success: 'Short link updated successfully',
		link_data: updated ? linkToDict(updated) : null,
	});
});

web.post('/links/delete/:id', requireSession, async (c) => {
	if (!(await setDeleted(c.env.DB, c.req.param('id'), true))) {
		return c.redirect(flashUrl('/links', 'Short link not found.', 'danger'), 302);
	}
	return c.redirect(flashUrl('/links', 'Short link deleted successfully!', 'success'), 302);
});

web.post('/links/hard_delete/:id', requireSession, async (c) => {
	if (!(await hardDeleteLink(c.env.DB, c.req.param('id')))) {
		return c.redirect(flashUrl('/links', 'Short link not found.', 'danger'), 302);
	}
	return c.redirect(flashUrl('/links', 'Short link deleted successfully!', 'success'), 302);
});

web.post('/links/restore/:id', requireSession, async (c) => {
	if (!(await setDeleted(c.env.DB, c.req.param('id'), false))) {
		return c.redirect(flashUrl('/links/deleted', 'Short link not found.', 'danger'), 302);
	}
	return c.redirect(flashUrl('/links/deleted', 'Short link restored successfully!', 'success'), 302);
});

web.get('/visits', requireSession, c => c.html(visitsPage(pageOptions(c))));

// DataTables server-side endpoint. The client never sends ordering (every
// column is unorderable), so rows are always newest first.
web.get('/visits/data', requireSession, async (c) => {
	const search = c.req.query('search[value]') ?? '';
	const start = Number.parseInt(c.req.query('start') ?? '', 10) || 0;
	const length = Number.parseInt(c.req.query('length') ?? '', 10);
	const draw = Number.parseInt(c.req.query('draw') ?? '', 10) || 0;

	const like = `%${search}%`;
	const filterClause = search
		? 'WHERE v.ip_address LIKE ? OR v.country_name LIKE ? OR v.user_agent LIKE ? OR s.short_url LIKE ?'
		: '';
	const filterParams = search ? [like, like, like, like] : [];
	// DataTables sends length=-1 for "show all".
	const paginate = length > 0;
	const pageClause = paginate ? ' LIMIT ? OFFSET ?' : '';
	const pageParams = paginate ? [length, start] : [];
	const from = `FROM visits v LEFT JOIN shortlinks s ON s.id = v.short_url_id ${filterClause}`;

	const [filtered, total, rows] = await Promise.all([
		first<{ n: number; }>(c.env.DB, `SELECT COUNT(*) AS n ${from}`, ...filterParams),
		first<{ n: number; }>(c.env.DB, 'SELECT COUNT(*) AS n FROM visits'),
		all<Visit & { link_alias: string | null; }>(
			c.env.DB,
			`SELECT v.*, s.short_url AS link_alias ${from} ORDER BY v.id DESC${pageClause}`,
			...filterParams,
			...pageParams,
		),
	]);

	return c.json({
		data: rows.map(({ link_alias, ...visit }) => {
			return { ...visit, shortlink: { short_url: link_alias } };
		}),
		recordsFiltered: filtered?.n ?? 0,
		recordsTotal: total?.n ?? 0,
		draw,
	});
});

export { web };
