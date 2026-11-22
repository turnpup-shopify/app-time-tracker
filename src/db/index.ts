import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

/**
 * Returns the app database.
 * DATABASE_URL "pglite:<dir>" runs an embedded Postgres for local dev and E2E tests.
 * Anything else is treated as a Neon connection string.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__db) globalForDb.__db = connect();
  return globalForDb.__db;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = url.slice("pglite:".length) || undefined;
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    return db as unknown as Db;
  }

  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  return drizzle(neon(url), { schema }) as unknown as Db;
}
