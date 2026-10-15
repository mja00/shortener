import {
	all,
	first,
	nowISO,
	run,
} from './db';

import type { Link } from '../types';

export type LinkBucket = 'active' | 'expired' | 'deleted';

const BUCKET_FILTERS: Record<LinkBucket, string> = {
	active: 'expired = 0 AND deleted = 0',
	expired: 'expired = 1',
	deleted: 'deleted = 1',
};

export interface LinkFields {
	original_url: string;
	short_url: string;
	max_clicks: number;
	expiration_date: string | null;
}

export function listLinks(db: D1Database, bucket: LinkBucket): Promise<Link[]> {
	return all<Link>(db, `SELECT * FROM shortlinks WHERE ${BUCKET_FILTERS[bucket]}`);
}

export function getLink(db: D1Database, id: number | string): Promise<Link | null> {
	return first<Link>(db, 'SELECT * FROM shortlinks WHERE id = ?', id);
}

export function getLinkByAlias(db: D1Database, alias: string): Promise<Link | null> {
	return first<Link>(db, 'SELECT * FROM shortlinks WHERE short_url = ?', alias);
}

export async function aliasTaken(db: D1Database, alias: string): Promise<boolean> {
	return (await first(db, 'SELECT 1 FROM shortlinks WHERE short_url = ?', alias)) !== null;
}

export async function insertLink(db: D1Database, fields: LinkFields, createdBy: number): Promise<Link> {
	const now = nowISO();
	const link = await first<Link>(
		db,
		'INSERT INTO shortlinks (original_url, short_url, expiration_date, max_clicks, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
		fields.original_url,
		fields.short_url,
		fields.expiration_date,
		fields.max_clicks,
		createdBy,
		now,
		now,
	);
	if (!link) {
		throw new Error('INSERT ... RETURNING produced no row');
	}
	return link;
}

export function updateLink(db: D1Database, id: number | string, fields: LinkFields): Promise<Link | null> {
	return first<Link>(
		db,
		'UPDATE shortlinks SET original_url = ?, short_url = ?, max_clicks = ?, expiration_date = ?, updated_at = ? WHERE id = ? RETURNING *',
		fields.original_url,
		fields.short_url,
		fields.max_clicks,
		fields.expiration_date,
		nowISO(),
		id,
	);
}

// Soft delete also expires the link; restoring clears both flags.
export function setDeleted(db: D1Database, id: number | string, deleted: boolean): Promise<Link | null> {
	const flag = deleted ? 1 : 0;
	return first<Link>(
		db,
		'UPDATE shortlinks SET deleted = ?, expired = ?, updated_at = ? WHERE id = ? RETURNING *',
		flag,
		flag,
		nowISO(),
		id,
	);
}

export async function expireLink(db: D1Database, id: number): Promise<void> {
	await run(db, 'UPDATE shortlinks SET expired = 1, updated_at = ? WHERE id = ?', nowISO(), id);
}

// Returns false when no link had that id. Visits go first to satisfy the FK.
export async function hardDeleteLink(db: D1Database, id: number | string): Promise<boolean> {
	const [, deleted] = await db.batch([
		db.prepare('DELETE FROM visits WHERE short_url_id = ?').bind(id),
		db.prepare('DELETE FROM shortlinks WHERE id = ?').bind(id),
	]);
	return (deleted?.meta.changes ?? 0) > 0;
}
