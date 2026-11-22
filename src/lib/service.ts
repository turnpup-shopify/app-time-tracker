import { and, asc, count, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { buckets, entries, users, type Bucket, type Entry } from "@/db/schema";
import { DEFAULT_BUCKETS } from "./defaults";
import { AppError, badRequest, conflict, notFound } from "./errors";
import { checkEntryTimes, type EntryCreateInput, type EntryPatchInput } from "./validation";

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === "object" && cur && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/* ---------------------------------- Users --------------------------------- */

/** Finds or creates the user for a Google account. New users get the default buckets. */
export async function ensureUser(
  db: Db,
  profile: { sub: string; email?: string | null; name?: string | null },
): Promise<string> {
  const inserted = await db
    .insert(users)
    .values({ googleSub: profile.sub, email: profile.email ?? null, name: profile.name ?? null })
    .onConflictDoNothing({ target: users.googleSub })
    .returning({ id: users.id });

  if (inserted[0]) {
    const userId = inserted[0].id;
    await db
      .insert(buckets)
      .values(DEFAULT_BUCKETS.map((b, i) => ({ ...b, userId, sort: i })))
      .onConflictDoNothing();
    return userId;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleSub, profile.sub));
  if (!existing) throw new AppError(500, "Could not load user");
  return existing.id;
}

/* --------------------------------- Buckets -------------------------------- */

export function listBuckets(db: Db, userId: string): Promise<Bucket[]> {
  return db
    .select()
    .from(buckets)
    .where(eq(buckets.userId, userId))
    .orderBy(asc(buckets.sort), asc(buckets.createdAt));
}

export async function getBucket(db: Db, userId: string, id: string): Promise<Bucket> {
  const [b] = await db
    .select()
    .from(buckets)
    .where(and(eq(buckets.id, id), eq(buckets.userId, userId)));
  if (!b) throw notFound("Bucket not found");
  return b;
}

export async function createBucket(
  db: Db,
  userId: string,
  input: { name: string; color: string; group: "work" | "life" },
): Promise<Bucket> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${buckets.sort}), -1)` })
    .from(buckets)
    .where(eq(buckets.userId, userId));
  try {
    const [b] = await db
      .insert(buckets)
      .values({ ...input, userId, sort: Number(max) + 1 })
      .returning();
    return b;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`You already have a bucket named "${input.name}"`);
    throw e;
  }
}

export async function updateBucket(
  db: Db,
  userId: string,
  id: string,
  patch: {
    name?: string;
    color?: string;
    group?: "work" | "life";
    sort?: number;
    archived?: boolean;
  },
): Promise<Bucket> {
  await getBucket(db, userId, id);
  const { archived, ...rest } = patch;
  const values: Partial<Bucket> = { ...rest };
  if (archived !== undefined) values.archivedAt = archived ? new Date() : null;
  try {
    const [b] = await db
      .update(buckets)
      .set(values)
      .where(and(eq(buckets.id, id), eq(buckets.userId, userId)))
      .returning();
    return b;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`You already have a bucket named "${patch.name}"`);
    throw e;
  }
}

/** Deletes a bucket. Blocked when it still has entries. */
export async function deleteBucket(db: Db, userId: string, id: string): Promise<void> {
  const b = await getBucket(db, userId, id);
  const [{ n }] = await db
    .select({ n: count() })
    .from(entries)
    .where(and(eq(entries.bucketId, id), isNull(entries.deletedAt)));
  if (n > 0) {
    throw conflict(
      `"${b.name}" has ${n} ${n === 1 ? "entry" : "entries"}. Archive it or move its entries first.`,
    );
  }
  // Soft deleted entries are past their undo window. Clear them so the bucket can go.
  await db.delete(entries).where(and(eq(entries.bucketId, id), isNotNull(entries.deletedAt)));
  await db.delete(buckets).where(and(eq(buckets.id, id), eq(buckets.userId, userId)));
}

/* --------------------------------- Entries -------------------------------- */

export function listEntries(db: Db, userId: string, from: Date, to: Date): Promise<Entry[]> {
  return db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        isNull(entries.deletedAt),
        lt(entries.startAt, to),
        or(isNull(entries.endAt), gt(entries.endAt, from)),
      ),
    )
    .orderBy(asc(entries.startAt));
}

async function getEntry(db: Db, userId: string, id: string): Promise<Entry> {
  const [e] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, userId)));
  if (!e) throw notFound("Entry not found");
  return e;
}

/**
 * Creates a manual entry. When `clientId` repeats, the first entry is returned
 * and nothing new is written, so retries never duplicate.
 */
export async function createEntry(
  db: Db,
  userId: string,
  input: EntryCreateInput,
  now = new Date(),
): Promise<{ entry: Entry; created: boolean }> {
  const msg = checkEntryTimes(input.startAt, input.endAt, now);
  if (msg) throw badRequest(msg);

  const bucket = await getBucket(db, userId, input.bucketId);
  if (bucket.archivedAt) throw badRequest(`"${bucket.name}" is archived`);

  const inserted = await db
    .insert(entries)
    .values({
      userId,
      bucketId: input.bucketId,
      startAt: input.startAt,
      endAt: input.endAt,
      note: input.note || null,
      clientId: input.clientId ?? null,
      source: "manual",
    })
    .onConflictDoNothing({ target: [entries.userId, entries.clientId] })
    .returning();

  if (inserted[0]) return { entry: inserted[0], created: true };

  const [existing] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.clientId, input.clientId!)));
  return { entry: existing, created: false };
}

export async function updateEntry(
  db: Db,
  userId: string,
  id: string,
  patch: EntryPatchInput,
  now = new Date(),
): Promise<Entry> {
  const current = await getEntry(db, userId, id);
  if (current.deletedAt) throw notFound("Entry not found");

  const startAt = patch.startAt ?? current.startAt;
  const endAt = patch.endAt ?? current.endAt;
  if (endAt) {
    const msg = checkEntryTimes(startAt, endAt, now);
    if (msg) throw badRequest(msg);
  }

  const values: Partial<Entry> = { updatedAt: now };
  if (patch.startAt) values.startAt = patch.startAt;
  if (patch.endAt) values.endAt = patch.endAt;
  if (patch.note !== undefined) values.note = patch.note || null;
  if (patch.bucketId && patch.bucketId !== current.bucketId) {
    await getBucket(db, userId, patch.bucketId);
    values.bucketId = patch.bucketId;
    // A hand picked bucket wins over calendar sync.
    values.bucketLocked = true;
  }

  const [e] = await db
    .update(entries)
    .set(values)
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning();
  return e;
}

export async function deleteEntry(db: Db, userId: string, id: string, now = new Date()) {
  await getEntry(db, userId, id);
  const [e] = await db
    .update(entries)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning();
  return e;
}

export async function restoreEntry(db: Db, userId: string, id: string, now = new Date()) {
  await getEntry(db, userId, id);
  const [e] = await db
    .update(entries)
    .set({ deletedAt: null, updatedAt: now })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning();
  return e;
}
