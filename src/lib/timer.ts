import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { entries, type Entry } from "@/db/schema";
import { badRequest } from "./errors";
import { getBucket } from "./service";
import { MAX_ENTRY_MS, MIN_ENTRY_MS } from "./validation";

export type StopResult =
  | { status: "logged"; entry: Entry; capped: boolean }
  | { status: "discarded"; entry: Entry }
  | { status: "none" };

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === "object" && cur && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** The user's running timer, or null. A running timer is an entry with no end time. */
export async function getRunningTimer(db: Db, userId: string): Promise<Entry | null> {
  const [e] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), isNull(entries.endAt), isNull(entries.deletedAt)));
  return e ?? null;
}

/**
 * Stops the running timer.
 * Under 1 minute it is thrown away. Over 24 hours it is capped at 24 hours,
 * because a timer left running overnight is almost always a mistake.
 */
export async function stopTimer(db: Db, userId: string, now = new Date()): Promise<StopResult> {
  const running = await getRunningTimer(db, userId);
  if (!running) return { status: "none" };

  const elapsed = now.getTime() - running.startAt.getTime();
  if (elapsed < MIN_ENTRY_MS) {
    const [gone] = await db
      .delete(entries)
      .where(and(eq(entries.id, running.id), isNull(entries.endAt)))
      .returning();
    return gone ? { status: "discarded", entry: gone } : { status: "none" };
  }

  const capped = elapsed > MAX_ENTRY_MS;
  const endAt = capped ? new Date(running.startAt.getTime() + MAX_ENTRY_MS) : now;
  const [entry] = await db
    .update(entries)
    .set({ endAt, updatedAt: now })
    // Only if still running, so two stops at once log it once.
    .where(and(eq(entries.id, running.id), isNull(entries.endAt)))
    .returning();
  return entry ? { status: "logged", entry, capped } : { status: "none" };
}

/** Starts a timer. Any running timer is stopped first. A repeated client id returns the same timer. */
export async function startTimer(
  db: Db,
  userId: string,
  input: { bucketId: string; clientId?: string },
  now = new Date(),
): Promise<{ timer: Entry; stopped: StopResult }> {
  const bucket = await getBucket(db, userId, input.bucketId);
  if (bucket.archivedAt) throw badRequest(`"${bucket.name}" is archived`);

  if (input.clientId) {
    const [same] = await db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, userId), eq(entries.clientId, input.clientId)));
    if (same) return { timer: same, stopped: { status: "none" } };
  }

  const stopped = await stopTimer(db, userId, now);
  const values = {
    userId,
    bucketId: input.bucketId,
    startAt: now,
    endAt: null,
    source: "timer" as const,
    clientId: input.clientId ?? null,
  };

  try {
    const [timer] = await db.insert(entries).values(values).returning();
    return { timer, stopped };
  } catch (e) {
    // Another start won the race. Return the timer that is running now.
    if (!isUniqueViolation(e)) throw e;
    const running = await getRunningTimer(db, userId);
    if (!running) throw e;
    return { timer: running, stopped };
  }
}
