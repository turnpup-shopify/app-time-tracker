import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { ensureUser, listBuckets } from "@/lib/service";

/** A fresh in-memory Postgres with the real migrations applied. */
export async function makeDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

export async function makeUser(db: Db, sub = "google-sub-1") {
  const userId = await ensureUser(db, { sub, email: `${sub}@example.com`, name: sub });
  const buckets = await listBuckets(db, userId);
  const byName = (name: string) => {
    const b = buckets.find((x) => x.name === name);
    if (!b) throw new Error(`No bucket ${name}`);
    return b;
  };
  return { userId, buckets, byName };
}

/** 2:00 PM local time on a fixed day. */
export const TWO_PM = new Date(2026, 10, 20, 14, 0, 0);
