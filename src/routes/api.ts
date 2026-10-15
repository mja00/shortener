import { Hono } from 'hono';

import { requireApiKey } from '../lib/auth';
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

import type { LinkBucket, LinkFields } from '../lib/links';
import type { AppEnv } from '../types';

const api = new Hono<AppEnv>();

api.use('*', requireApiKey);

api.get('/test', c => c.json({ message: 'Hello World!' }));

for (const bucket of ['active', 'expired', 'deleted'] satisfies LinkBucket[]) {
	api.get(`/links/${bucket}`, async (c) => {
		const links = await listLinks(c.env.DB, bucket);
		return c.json({ links: links.map(link => linkToDict(link)) });
	});
}

api.get('/links/:id', async (c) => {
	const link = await getLink(c.env.DB, c.req.param('id'));
	if (!link) {
		return c.json({ error: 'Link not found' }, 404);
	}
	return c.json({ link: linkToDict(link) });
});

type ParsedBody =
	| { error: string; }
	| { error?: undefined; fields: LinkFields; };

// Shared POST/PUT validation. The missing-field message differs per route for
// parity with the Flask API, so callers pass it in.
async function parseLinkBody(req: Request, missingMessage: string): Promise<ParsedBody> {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return { error: 'Missing body' };
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return { error: 'Missing body' };
	}

	const record = body as Record<string, unknown>;
	const expiration = normalizeExpiration(record.expiration_date);
	if (expiration === INVALID_DATE) {
		return { error: 'Invalid expiration date. Must be unix timestamp.' };
	}
	const alias = normalizeAlias(record.alias);
	if (typeof record.url !== 'string' || !record.url || !alias) {
		return { error: missingMessage };
	}
	return {
		fields: {
			original_url: record.url,
			short_url: alias,
			max_clicks: normalizeMaxClicks(record.max_click_count),
			expiration_date: expiration,
		},
	};
}

api.post('/links', async (c) => {
	const parsed = await parseLinkBody(c.req.raw, 'Missing url or alias or created_by');
	if (parsed.error !== undefined) {
		return c.json({ error: parsed.error }, 400);
	}
	if (await aliasTaken(c.env.DB, parsed.fields.short_url)) {
		return c.json({ error: 'Alias is taken' }, 400);
	}

	// A malformed API_USER_ID would otherwise bind NaN and fail the insert.
	const configuredUserId = Number(c.env.API_USER_ID ?? '1');
	const createdBy = Number.isSafeInteger(configuredUserId) ? configuredUserId : 1;
	try {
		const link = await insertLink(c.env.DB, parsed.fields, createdBy);
		return c.json({ link: linkToDict(link) }, 201);
	} catch {
		// The UNIQUE index catches a concurrent create that slipped past the pre-check.
		return c.json({ error: 'Alias is taken' }, 400);
	}
});

// PUT replaces every field; keeping the current alias never trips the taken check.
api.put('/links/:id', async (c) => {
	const id = c.req.param('id');
	const link = await getLink(c.env.DB, id);
	if (!link) {
		return c.json({ error: 'Link not found' }, 404);
	}

	const parsed = await parseLinkBody(c.req.raw, 'Missing url or alias');
	if (parsed.error !== undefined) {
		return c.json({ error: parsed.error }, 400);
	}
	if (link.short_url !== parsed.fields.short_url && await aliasTaken(c.env.DB, parsed.fields.short_url)) {
		return c.json({ error: 'Alias is taken' }, 400);
	}

	const updated = await updateLink(c.env.DB, id, parsed.fields);
	if (!updated) {
		return c.json({ error: 'Link not found' }, 404);
	}
	return c.json({ link: linkToDict(updated) });
});

api.delete('/links/:id', async (c) => {
	const link = await setDeleted(c.env.DB, c.req.param('id'), true);
	if (!link) {
		return c.json({ error: 'Link not found' }, 404);
	}
	return c.json({ link: linkToDict(link) });
});

api.put('/links/:id/restore', async (c) => {
	const link = await setDeleted(c.env.DB, c.req.param('id'), false);
	if (!link) {
		return c.json({ error: 'Link not found' }, 404);
	}
	return c.json({ link: linkToDict(link) });
});

api.delete('/links/:id/hard', async (c) => {
	if (!(await hardDeleteLink(c.env.DB, c.req.param('id')))) {
		return c.json({ error: 'Link not found' }, 404);
	}
	return c.json({ message: 'Link deleted' });
});

export { api };
