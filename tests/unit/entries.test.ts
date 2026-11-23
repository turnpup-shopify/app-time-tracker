import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as api from "@/lib/api";
import * as svc from "@/lib/service";
import { localDayRange, quickLogRange } from "@/lib/time";
import { makeDb, makeUser, TWO_PM } from "./helpers";

let db: Db;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  db = await makeDb();
  user = await makeUser(db);
});

const iso = (d: Date) => d.toISOString();

describe("T01 quick log", () => {
  it("Health 30m at 2:00 PM makes an entry from 1:30 to 2:00 PM", async () => {
    const health = user.byName("Health");
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const res = await api.createEntry(
      db,
      user.userId,
      { bucketId: health.id, startAt: iso(startAt), endAt: iso(endAt) },
      TWO_PM,
    );
    expect(res.status).toBe(201);
    const { entry } = await res.json();
    expect(new Date(entry.startAt)).toEqual(new Date(2026, 10, 20, 13, 30));
    expect(new Date(entry.endAt)).toEqual(TWO_PM);
    expect(entry.bucketId).toBe(health.id);
    expect(entry.source).toBe("manual");

    const { from, to } = localDayRange(TWO_PM);
    const list = await svc.listEntries(db, user.userId, from, to);
    expect(list).toHaveLength(1);
  });

  it("drops seconds so blocks line up on the minute", () => {
    const r = quickLogRange(15, new Date(2026, 0, 1, 9, 0, 42, 500));
    expect(r.endAt).toEqual(new Date(2026, 0, 1, 9, 0, 0));
    expect(r.startAt).toEqual(new Date(2026, 0, 1, 8, 45, 0));
  });
});

describe("T02 double tap", () => {
  it("the same client id twice creates exactly one entry", async () => {
    const bucketId = user.byName("Health").id;
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const body = {
      bucketId,
      startAt: iso(startAt),
      endAt: iso(endAt),
      clientId: "6f1c3f8e-2a52-4b5e-9a4e-0d7b2b7f9c11",
    };
    const [a, b] = await Promise.all([
      api.createEntry(db, user.userId, body, TWO_PM),
      api.createEntry(db, user.userId, body, TWO_PM),
    ]);
    const ids = [(await a.json()).entry.id, (await b.json()).entry.id];
    expect(ids[0]).toBe(ids[1]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);

    const { from, to } = localDayRange(TWO_PM);
    expect(await svc.listEntries(db, user.userId, from, to)).toHaveLength(1);
  });
});

describe("T03 undo", () => {
  it("a deleted entry disappears from lists and comes back on restore", async () => {
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const { entry } = await svc.createEntry(
      db,
      user.userId,
      { bucketId: user.byName("Health").id, startAt, endAt },
      TWO_PM,
    );
    const { from, to } = localDayRange(TWO_PM);

    const del = await api.deleteEntry(db, user.userId, entry.id);
    expect(del.status).toBe(200);
    expect(await svc.listEntries(db, user.userId, from, to)).toHaveLength(0);

    const res = await api.restoreEntry(db, user.userId, entry.id);
    expect(res.status).toBe(200);
    expect(await svc.listEntries(db, user.userId, from, to)).toHaveLength(1);
  });
});

describe("T04 backdate", () => {
  it("Ended at 1h ago with a 1h chip spans 2h ago to 1h ago", async () => {
    const endedAt = new Date(TWO_PM.getTime() - 60 * 60_000);
    const { startAt, endAt } = quickLogRange(60, endedAt);
    const res = await api.createEntry(
      db,
      user.userId,
      { bucketId: user.byName("Work FD").id, startAt: iso(startAt), endAt: iso(endAt) },
      TWO_PM,
    );
    const { entry } = await res.json();
    expect(new Date(entry.startAt)).toEqual(new Date(2026, 10, 20, 12, 0));
    expect(new Date(entry.endAt)).toEqual(new Date(2026, 10, 20, 13, 0));
  });
});

describe("editing", () => {
  it("changing the bucket by hand locks it", async () => {
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const { entry } = await svc.createEntry(
      db,
      user.userId,
      { bucketId: user.byName("Health").id, startAt, endAt },
      TWO_PM,
    );
    expect(entry.bucketLocked).toBe(false);
    const res = await api.updateEntry(db, user.userId, entry.id, {
      bucketId: user.byName("Hobbies Computer").id,
      note: "guitar",
    });
    const { entry: updated } = await res.json();
    expect(updated.bucketLocked).toBe(true);
    expect(updated.note).toBe("guitar");
  });

  it("an edit that makes the entry too short is rejected", async () => {
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const { entry } = await svc.createEntry(
      db,
      user.userId,
      { bucketId: user.byName("Health").id, startAt, endAt },
      TWO_PM,
    );
    const res = await api.updateEntry(db, user.userId, entry.id, { endAt: iso(startAt) });
    expect(res.status).toBe(400);
  });

  it("logging to an archived bucket is rejected", async () => {
    const health = user.byName("Health");
    await svc.updateBucket(db, user.userId, health.id, { archived: true });
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const res = await api.createEntry(
      db,
      user.userId,
      { bucketId: health.id, startAt: iso(startAt), endAt: iso(endAt) },
      TWO_PM,
    );
    expect(res.status).toBe(400);
  });

  it("lists include an entry that crosses into the day from the night before", async () => {
    const start = new Date(2026, 10, 19, 23, 30);
    const end = new Date(2026, 10, 20, 0, 30);
    await svc.createEntry(
      db,
      user.userId,
      { bucketId: user.byName("Health").id, startAt: start, endAt: end },
      TWO_PM,
    );
    const { from, to } = localDayRange(TWO_PM);
    expect(await svc.listEntries(db, user.userId, from, to)).toHaveLength(1);
  });
});

describe("up to label", () => {
  it("counts logged time forward from 8 AM", async () => {
    const { upToLabel } = await import("@/lib/time");
    expect(upToLabel(0, 8)).toBe("8:00 AM");
    expect(upToLabel(30, 8)).toBe("8:30 AM");
    expect(upToLabel(4 * 60, 8)).toBe("12:00 PM");
    expect(upToLabel(750, 8)).toBe("8:30 PM");
    expect(upToLabel(16 * 60, 8)).toBe("12:00 AM");
    expect(upToLabel(17 * 60 + 5, 8)).toBe("1:05 AM");
  });
});
