export const INVALID_DATE = Symbol('invalid date');

// Epochs below 1e12 are read as seconds, larger ones as milliseconds: the API
// documents both and the web forms post milliseconds.
function fromEpoch(value: number): string | typeof INVALID_DATE {
	const date = new Date(Math.abs(value) < 1e12 ? value * 1000 : value);
	return Number.isNaN(date.getTime()) ? INVALID_DATE : date.toISOString();
}

// Blank means "never expires"; anything unparseable is INVALID_DATE.
export function normalizeExpiration(value: unknown): string | null | typeof INVALID_DATE {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? fromEpoch(value) : INVALID_DATE;
	}
	if (typeof value !== 'string') {
		return INVALID_DATE;
	}

	const trimmed = value.trim();
	if (trimmed === '') {
		return null;
	}
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
		return fromEpoch(Number(trimmed));
	}
	const date = new Date(trimmed);
	return Number.isNaN(date.getTime()) ? INVALID_DATE : date.toISOString();
}

export function normalizeAlias(input: unknown): string {
	if (typeof input !== 'string') {
		return '';
	}
	return input.trim().replaceAll(' ', '-');
}

// -1 means unlimited; a blank or non-integer value falls back to it rather than 0, which would make the link dead on arrival.
export function normalizeMaxClicks(input: unknown): number {
	const value = typeof input === 'string' && input.trim() !== '' ? Number(input) : input;
	return Number.isSafeInteger(value) ? (value as number) : -1;
}
