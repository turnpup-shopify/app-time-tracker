import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import type { Entry } from "@/db/schema";
import { addDays, daysBetween } from "./dates";
import { badRequest } from "./errors";
import { listEntries } from "./service";

export const GAP_MIN = 30;

/** "YYYY-MM-DD" checks and helpers. Dates are calendar days in the user's time zone. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(d: string | null, name = "date"): string {
  if (!d || !DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))
    throw badRequest(`${name} must look like 2026-11-21`);
  return d;
}

export function assertTz(tz: string | null): string {
  if (!tz) throw badRequest("tz is required, for example America/Chicago");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    throw badRequest(`Unknown time zone "${tz}"`);
  }
}

export { addDays, daysBetween };

const rowsOf = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];

/** Start and end instants of a local day. A DST day can be 23 or 25 hours. */
export async function dayBounds(db: Db, date: string, tz: string) {
  const r = await db.execute(sql`
    select (${date}::date::timestamp at time zone ${tz}) as "from",
           ((${date}::date + 1)::timestamp at time zone ${tz}) as "to"`);
  const [row] = rowsOf<{ from: string | Date; to: string | Date }>(r);
  return { from: new Date(row.from), to: new Date(row.to) };
}

/**
 * Minutes per local day per bucket, computed in Postgres.
 * Entries that cross midnight are split between both days.
 * Running timers count up to `now`. Durations are real elapsed time, so DST is handled.
 */
export async function minutesByDay(
  db: Db,
  userId: string,
  from: string,
  to: string,
  tz: string,
  now: Date,
): Promise<Map<string, Map<string, number>>> {
  const nowIso = now.toISOString();
  const r = await db.execute(sql`
    with days as (
      select to_char(d, 'YYYY-MM-DD') as day,
             (d::date::timestamp at time zone ${tz}) as day_start,
             ((d::date + 1)::timestamp at time zone ${tz}) as day_end
      from generate_series(${from}::date, ${to}::date, interval '1 day') d
    )
    select days.day, e.bucket_id as "bucketId",
           sum(extract(epoch from (
             least(coalesce(e.end_at, ${nowIso}::timestamptz), days.day_end)
             - greatest(e.start_at, days.day_start)
           )) / 60)::float as minutes
    from days
    join entries e
      on e.user_id = ${userId}
     and e.deleted_at is null
     and e.start_at < days.day_end
     and coalesce(e.end_at, ${nowIso}::timestamptz) > days.day_start
    group by days.day, e.bucket_id`);

  const out = new Map<string, Map<string, number>>();
  for (const row of rowsOf<{ day: string; bucketId: string; minutes: number }>(r)) {
    const m = Math.round(Number(row.minutes));
    if (m <= 0) continue;
    if (!out.has(row.day)) out.set(row.day, new Map());
    out.get(row.day)!.set(row.bucketId, m);
  }
  return out;
}

export type Gap = { startAt: Date; endAt: Date; minutes: number };

/** Untracked stretches over GAP_MIN minutes between the first and last entry of the day. */
export function findGaps(
  entries: Pick<Entry, "startAt" | "endAt">[],
  from: Date,
  to: Date,
  now: Date,
): Gap[] {
  const spans = entries
    .map((e) => ({
      s: Math.max(e.startAt.getTime(), from.getTime()),
      e: Math.min((e.endAt ?? now).getTime(), to.getTime()),
    }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s);

  const gaps: Gap[] = [];
  let reach = spans[0]?.e ?? 0;
  for (const span of spans.slice(1)) {
    const minutes = Math.round((span.s - reach) / 60_000);
    if (minutes > GAP_MIN) {
      gaps.push({ startAt: new Date(reach), endAt: new Date(span.s), minutes });
    }
    reach = Math.max(reach, span.e);
  }
  return gaps;
}

/** Ids of entries that overlap another entry. */
export function findOverlaps(entries: Pick<Entry, "id" | "startAt" | "endAt">[], now: Date): Set<string> {
  const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const out = new Set<string>();
  let last: { id: string; end: number } | null = null;
  for (const e of sorted) {
    const end = (e.endAt ?? now).getTime();
    if (last && e.startAt.getTime() < last.end) {
      out.add(e.id);
      out.add(last.id);
    }
    if (!last || end > last.end) last = { id: e.id, end };
  }
  return out;
}

export async function dayReport(db: Db, userId: string, date: string, tz: string, now = new Date()) {
  const { from, to } = await dayBounds(db, date, tz);
  const [entries, byDay] = await Promise.all([
    listEntries(db, userId, from, to),
    minutesByDay(db, userId, date, date, tz, now),
  ]);
  const buckets = [...(byDay.get(date) ?? new Map()).entries()]
    .map(([bucketId, minutes]) => ({ bucketId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
  const total = buckets.reduce((s, b) => s + b.minutes, 0);
  return {
    date,
    tz,
    from,
    to,
    dayMinutes: Math.round((to.getTime() - from.getTime()) / 60_000),
    total,
    buckets,
    entries,
    gaps: findGaps(entries, from, to, now),
    overlaps: [...findOverlaps(entries, now)],
  };
}

/** Totals for a range of days, plus the same length of time just before it for comparison. */
export async function rangeReport(
  db: Db,
  userId: string,
  from: string,
  to: string,
  tz: string,
  now = new Date(),
) {
  const span = daysBetween(from, to) + 1;
  if (span < 1) throw badRequest("to must be on or after from");
  if (span > 62) throw badRequest("Range can be at most 62 days");
  const prevFrom = addDays(from, -span);
  const prevTo = addDays(from, -1);

  const [cur, prev] = await Promise.all([
    minutesByDay(db, userId, from, to, tz, now),
    minutesByDay(db, userId, prevFrom, prevTo, tz, now),
  ]);

  const days = Array.from({ length: span }, (_, i) => {
    const date = addDays(from, i);
    const m = cur.get(date) ?? new Map<string, number>();
    const buckets = Object.fromEntries(m);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    return { date, total, buckets };
  });

  const sum = (byDay: Map<string, Map<string, number>>) => {
    const t = new Map<string, number>();
    for (const m of byDay.values()) for (const [b, v] of m) t.set(b, (t.get(b) ?? 0) + v);
    return t;
  };
  const curTotals = sum(cur);
  const prevTotals = sum(prev);
  const ids = new Set([...curTotals.keys(), ...prevTotals.keys()]);

  const buckets = [...ids]
    .map((bucketId) => {
      const total = curTotals.get(bucketId) ?? 0;
      const previous = prevTotals.get(bucketId) ?? 0;
      return {
        bucketId,
        total,
        dailyAverage: Math.round(total / span),
        previous,
        change: total - previous,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    from,
    to,
    tz,
    days,
    buckets,
    total: days.reduce((s, d) => s + d.total, 0),
    previousTotal: [...prevTotals.values()].reduce((s, v) => s + v, 0),
  };
}
