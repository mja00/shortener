export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<void> {
  await db
    .prepare(sql)
    .bind(...params)
    .run();
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return results ?? [];
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return (
    (await db
      .prepare(sql)
      .bind(...params)
      .first<T>()) ?? null
  );
}

export function nowISO(): string {
  return new Date().toISOString();
}
