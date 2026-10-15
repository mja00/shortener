export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
	return db
		.prepare(sql)
		.bind(...params)
		.run();
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
	const { results } = await db
		.prepare(sql)
		.bind(...params)
		.all<T>();
	return results;
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
	return db
		.prepare(sql)
		.bind(...params)
		.first<T>();
}

export function nowISO(): string {
	return new Date().toISOString();
}

// Rows migrated from Postgres hold naive timestamps ("2022-03-18 02:03:29.948202")
// that JS would read as local time, and that don't sort against ISO strings. NaN if unparseable.
export function parseStoredTimestamp(value: string): number {
	const iso = value.includes('T') ? value : value.replace(' ', 'T');
	const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
	return Date.parse(hasZone ? iso : `${iso}Z`);
}
