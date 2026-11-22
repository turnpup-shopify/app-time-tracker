import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { buckets, entries, rules } from "@/db/schema";
import { dayBounds } from "./reports";
import { listBuckets } from "./service";

/** Quotes a CSV field when it holds a comma, quote, or line break. Blocks spreadsheet formulas. */
export function csvField(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function localParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export const CSV_HEADER = ["date", "start", "end", "minutes", "bucket", "source", "note"];

/** CSV of entries that start between local `from` and the end of local `to`. Times are in `tz`. */
export async function entriesCsv(
  db: Db,
  userId: string,
  from: string,
  to: string,
  tz: string,
): Promise<string> {
  const [{ from: start }, { to: end }, bucketList] = await Promise.all([
    dayBounds(db, from, tz),
    dayBounds(db, to, tz),
    listBuckets(db, userId),
  ]);
  const names = new Map(bucketList.map((b) => [b.id, b.name]));
  const rows = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        isNull(entries.deletedAt),
        gte(entries.startAt, start),
        lt(entries.startAt, end),
      ),
    )
    .orderBy(asc(entries.startAt));

  const lines = [CSV_HEADER.join(",")];
  for (const e of rows) {
    const s = localParts(e.startAt, tz);
    const f = e.endAt ? localParts(e.endAt, tz) : null;
    const minutes = e.endAt ? Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60_000) : "";
    lines.push(
      [s.date, s.time, f ? f.time : "", minutes, names.get(e.bucketId) ?? "", e.source, e.note]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Everything the user owns, for a backup file. Calendar tokens are never included. */
export async function jsonBackup(db: Db, userId: string, now = new Date()) {
  const [b, e, r] = await Promise.all([
    db.select().from(buckets).where(eq(buckets.userId, userId)).orderBy(asc(buckets.sort)),
    db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, userId), isNull(entries.deletedAt)))
      .orderBy(asc(entries.startAt)),
    db.select().from(rules).where(eq(rules.userId, userId)).orderBy(asc(rules.sort)),
  ]);
  return {
    app: "time-tracker",
    version: 1,
    exportedAt: now.toISOString(),
    buckets: b.map(({ userId: _u, ...x }) => x),
    entries: e.map(({ userId: _u, ...x }) => x),
    rules: r.map(({ userId: _u, ...x }) => x),
  };
}
