export function normalizeExpiration(value: unknown): string | null | 'invalid' {
	if (value === null || value === undefined) {
		return null;
	}
	if (value === '') {
		return null;
	}

	if (typeof value === 'number' && Number.isFinite(value)) {
		const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
		const date = new Date(ms);
		if (Number.isNaN(date.getTime())) {
			return 'invalid';
		}
		return date.toISOString();
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') {
			return null;
		}

		if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed);
			const ms = Math.abs(num) < 1e12 ? num * 1000 : num;
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) {
				return 'invalid';
			}
			return date.toISOString();
		}

		const date = new Date(trimmed);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString();
		}
		return 'invalid';
	}

	return 'invalid';
}

export function normalizeAlias(input: string | undefined | null): string {
	if (!input) {
		return '';
	}
	return input.trim().replaceAll(' ', '-');
}
