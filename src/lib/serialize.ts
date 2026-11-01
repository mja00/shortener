import type { Link } from '../types';

// SQLite stores booleans as 0/1; responses expose real booleans like the Flask API did.
export type LinkDict = Omit<Link, 'expired' | 'deleted'> & { expired: boolean; deleted: boolean; };

export function linkToDict(link: Link): LinkDict {
	return { ...link, expired: Boolean(link.expired), deleted: Boolean(link.deleted) };
}
