import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as api from "@/lib/api";
import { csvField } from "@/lib/export";
import { dayReport, findGaps, findOverlaps, rangeReport } from "@/lib/reports";
import * as svc from "@/lib/service";
import { startTimer } from "@/lib/timer";
import { makeDb, makeUser } from "./helpers";

const TZ = "America/Chicago";
let db: Db;
let user: Awaited<ReturnType<typeof makeUser>>;
const NOW = new Date("2026-11-25T18:00:00Z");

beforeEach(async () => {
  db = await makeDb();
  user = await makeUser(db);
});

/** Logs an entry between two UTC instants. */
const log = (bucket: string, start: string, end: string, note?: string) =>
  svc.createEntry(
    db,
    user.userId,
    { bucketId: user.byName(bucket).id, startAt: new Date(start), endAt: new Date(end), note },
    NOW,
  );

describe("T09 midnight", () => {
  it("an entry from 11:30 PM to 12:30 AM puts 30m on each day", async () => {
    // Nov 20 11:30 PM CST is 05:30Z on Nov 21.
    await log("Health", "2026-11-21T05:30:00Z", "2026-11-21T06:30:00Z");
    const d1 = await dayReport(db, user.userId, "2026-11-20", TZ, NOW);
    const d2 = await dayReport(db, user.userId, "2026-11-21", TZ, NOW);
    expect(d1.total).toBe(30);
    expect(d2.total).toBe(30);

    const week = await rangeReport(db, user.userId, "2026-11-20", "2026-11-21", TZ, NOW);
    expect(week.days.map((d) => d.total)).toEqual([30, 30]);
  });
});

describe("T10 DST", () => {
  it("an entry across the November change counts real elapsed minutes", async () => {
    // Nov 1 2026, 12:30 AM CDT (05:30Z) to 2:30 AM CST (08:30Z). The clock says 2h. It was 3h.
    await log("Health", "2026-11-01T05:30:00Z", "2026-11-01T08:30:00Z");
    const r = await dayReport(db, user.userId, "2026-11-01", TZ, NOW);
    expect(r.total).toBe(180);
    expect(r.dayMinutes).toBe(25 * 60);
  });

  it("the spring forward day is 23 hours long", async () => {
    const r = await dayReport(db, user.userId, "2026-03-08", TZ, NOW);
    expect(r.dayMinutes).toBe(23 * 60);
  });

  it("day boundaries follow local midnight on both sides of the change", async () => {
    // Oct 31 11:00 PM CDT (04:00Z Nov 1) to Nov 1 1:00 AM CDT (06:00Z).
    await log("Work FD", "2026-11-01T04:00:00Z", "2026-11-01T06:00:00Z");
    const r = await rangeReport(db, user.userId, "2026-10-31", "2026-11-01", TZ, NOW);
    expect(r.days.map((d) => d.total)).toEqual([60, 60]);
  });
});

describe("T19 gaps", () => {
  it("a 2 hour gap shows as Untracked", async () => {
    // 9 to 10 AM and 12 to 1 PM CST on Nov 23.
    await log("Work FD", "2026-11-23T15:00:00Z", "2026-11-23T16:00:00Z");
    await log("Health", "2026-11-23T18:00:00Z", "2026-11-23T19:00:00Z");
    const r = await dayReport(db, user.userId, "2026-11-23", TZ, NOW);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].minutes).toBe(120);
    expect(r.gaps[0].startAt).toEqual(new Date("2026-11-23T16:00:00Z"));
    expect(r.gaps[0].endAt).toEqual(new Date("2026-11-23T18:00:00Z"));
  });

  it("gaps of 30 minutes or less are ignored", () => {
    const e = (s: string, f: string) => ({ startAt: new Date(s), endAt: new Date(f) });
    const gaps = findGaps(
      [e("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"), e("2026-01-01T11:30:00Z", "2026-01-01T12:00:00Z")],
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-02T00:00:00Z"),
      NOW,
    );
    expect(gaps).toEqual([]);
  });

  it("an entry inside a longer one does not create a false gap", () => {
    const e = (s: string, f: string) => ({ startAt: new Date(s), endAt: new Date(f) });
    const gaps = findGaps(
      [
        e("2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z"),
        e("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z"),
        e("2026-01-01T16:00:00Z", "2026-01-01T18:00:00Z"),
      ],
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-02T00:00:00Z"),
      NOW,
    );
    expect(gaps).toEqual([]);
  });
});

describe("day report", () => {
  it("sorts buckets by time and flags overlaps", async () => {
    const a = await log("Work FD", "2026-11-23T15:00:00Z", "2026-11-23T17:00:00Z");
    const b = await log("Health", "2026-11-23T16:30:00Z", "2026-11-23T17:00:00Z");
    await log("Hobbies Computer", "2026-11-23T20:00:00Z", "2026-11-23T20:15:00Z");
    const r = await dayReport(db, user.userId, "2026-11-23", TZ, NOW);
    expect(r.total).toBe(165);
    expect(r.buckets.map((x) => x.minutes)).toEqual([120, 30, 15]);
    expect(new Set(r.overlaps)).toEqual(new Set([a.entry.id, b.entry.id]));
  });

  it("counts a running timer up to now", async () => {
    await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, new Date("2026-11-25T17:00:00Z"));
    const r = await dayReport(db, user.userId, "2026-11-25", TZ, NOW);
    expect(r.total).toBe(60);
  });

  it("ignores deleted entries and other users", async () => {
    const { entry } = await log("Health", "2026-11-23T15:00:00Z", "2026-11-23T16:00:00Z");
    await svc.deleteEntry(db, user.userId, entry.id);
    const other = await makeUser(db, "other");
    await svc.createEntry(
      db,
      other.userId,
      {
        bucketId: other.byName("Health").id,
        startAt: new Date("2026-11-23T15:00:00Z"),
        endAt: new Date("2026-11-23T16:00:00Z"),
      },
      NOW,
    );
    const r = await dayReport(db, user.userId, "2026-11-23", TZ, NOW);
    expect(r.total).toBe(0);
    expect(r.entries).toEqual([]);
  });

  it("checks inputs", async () => {
    const url = (q: string) => new URL(`http://x/api/reports/day?${q}`);
    expect((await api.dayReport(db, user.userId, url(`date=2026-11-23&tz=${TZ}`), NOW)).status).toBe(200);
    expect((await api.dayReport(db, user.userId, url(`date=nov&tz=${TZ}`), NOW)).status).toBe(400);
    expect((await api.dayReport(db, user.userId, url(`date=2026-11-23&tz=Mars/Base`), NOW)).status).toBe(400);
    expect((await api.dayReport(db, user.userId, url(`date=2026-11-23`), NOW)).status).toBe(400);
  });
});

describe("week and month", () => {
  it("totals, daily average, and change vs the previous period", async () => {
    // This week. Health 1h on Mon and Wed. Last week Health 4h on one day.
    await log("Health", "2026-11-23T15:00:00Z", "2026-11-23T16:00:00Z");
    await log("Health", "2026-11-25T15:00:00Z", "2026-11-25T16:00:00Z");
    await log("Health", "2026-11-17T15:00:00Z", "2026-11-17T19:00:00Z");
    await log("Work FD", "2026-11-24T15:00:00Z", "2026-11-24T22:00:00Z");

    const r = await rangeReport(db, user.userId, "2026-11-23", "2026-11-29", TZ, NOW);
    expect(r.days).toHaveLength(7);
    expect(r.days[0]).toMatchObject({ date: "2026-11-23", total: 60 });
    expect(r.total).toBe(60 + 60 + 7 * 60);

    const health = r.buckets.find((b) => b.bucketId === user.byName("Health").id)!;
    expect(health).toMatchObject({ total: 120, previous: 240, change: -120, dailyAverage: 17 });
    const work = r.buckets.find((b) => b.bucketId === user.byName("Work FD").id)!;
    expect(work).toMatchObject({ total: 420, previous: 0, change: 420, dailyAverage: 60 });
  });

  it("rejects ranges that are backwards or too long", async () => {
    const url = (f: string, t: string) => new URL(`http://x/?from=${f}&to=${t}&tz=${TZ}`);
    expect((await api.rangeReport(db, user.userId, url("2026-11-29", "2026-11-23"))).status).toBe(400);
    expect((await api.rangeReport(db, user.userId, url("2026-01-01", "2026-12-31"))).status).toBe(400);
  });
});

describe("export", () => {
  it("CSV has the spec columns, local times, and escaped notes", async () => {
    await log("Health", "2026-11-23T15:00:00Z", "2026-11-23T15:45:00Z", 'Run, then "stretch"');
    const res = await api.exportCsv(
      db,
      user.userId,
      new URL(`http://x/?from=2026-11-23&to=2026-11-23&tz=${TZ}`),
    );
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toBe("date,start,end,minutes,bucket,source,note");
    expect(lines[1]).toBe('2026-11-23,09:00,09:45,45,Health,manual,"Run, then ""stretch"""');
  });

  it("CSV fields that look like formulas are neutralized", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(null)).toBe("");
    expect(csvField(42)).toBe("42");
  });

  it("JSON backup holds buckets and entries without user ids", async () => {
    await log("Health", "2026-11-23T15:00:00Z", "2026-11-23T15:45:00Z");
    const res = await api.exportJson(db, user.userId, NOW);
    const data = await res.json();
    expect(data.version).toBe(1);
    expect(data.buckets).toHaveLength(5);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].userId).toBeUndefined();
  });
});

describe("overlap helper", () => {
  it("adjacent entries do not overlap", () => {
    const set = findOverlaps(
      [
        { id: "a", startAt: new Date("2026-01-01T10:00:00Z"), endAt: new Date("2026-01-01T11:00:00Z") },
        { id: "b", startAt: new Date("2026-01-01T11:00:00Z"), endAt: new Date("2026-01-01T12:00:00Z") },
      ],
      NOW,
    );
    expect(set.size).toBe(0);
  });
});
