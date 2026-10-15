import { aliasTaken } from './links';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ALIAS_LENGTH = 15;
// Bounded retry so a saturated keyspace fails fast instead of spinning forever.
const MAX_ATTEMPTS = 20;

export function randomString(length: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (const byte of bytes) {
		out += ALPHABET.charAt(byte % ALPHABET.length);
	}
	return out;
}

export async function generateUniqueAlias(db: D1Database): Promise<string> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const candidate = randomString(ALIAS_LENGTH);
		if (!(await aliasTaken(db, candidate))) {
			return candidate;
		}
	}
	throw new Error(`Could not generate a unique alias after ${MAX_ATTEMPTS} attempts`);
}
