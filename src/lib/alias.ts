import { first } from './db';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ALIAS_LENGTH = 15;
// Bounded retry so a saturated keyspace fails fast instead of spinning forever.
const MAX_ATTEMPTS = 20;

export function randomString(length: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (let i = 0; i < length; i++) {
		out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length] as string;
	}
	return out;
}

export async function generateUniqueAlias(db: D1Database, preferred?: string): Promise<string> {
	if (preferred) {
		const taken = await first<{ 1: number; }>(db, 'SELECT 1 FROM shortlinks WHERE short_url = ?', preferred);
		if (!taken) {
			return preferred;
		}
	}
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const candidate = randomString(ALIAS_LENGTH);
		const taken = await first<{ 1: number; }>(db, 'SELECT 1 FROM shortlinks WHERE short_url = ?', candidate);
		if (!taken) {
			return candidate;
		}
	}
	throw new Error(`Could not generate a unique alias after ${MAX_ATTEMPTS} attempts`);
}
