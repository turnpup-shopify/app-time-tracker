import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as api from "@/lib/api";
import * as svc from "@/lib/service";
import { localDayRange, quickLogRange } from "@/lib/time";
import { GET as cronSync } from "@/app/api/cron/sync/route";
import { GET as cronBackup } from "@/app/api/cron/backup/route";
import { makeDb, makeUser, TWO_PM } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await makeDb();
});

describe("T21 a second Google user", () => {
  it("sees only their own buckets and entries", async () => {
    const alex = await makeUser(db, "alex");
    const other = await makeUser(db, "other");
    expect(other.userId).not.toBe(alex.userId);

    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const { entry } = await svc.createEntry(
      db,
      alex.userId,
      { bucketId: alex.byName("Health").id, startAt, endAt, note: "private" },
      TWO_PM,
    );

    // Other user gets their own five buckets, not Alex's.
    const otherBuckets = await svc.listBuckets(db, other.userId);
    expect(otherBuckets).toHaveLength(5);
    expect(otherBuckets.every((b) => b.userId === other.userId)).toBe(true);

    // Alex's entry never shows in the other user's list.
    const { from, to } = localDayRange(TWO_PM);
    const url = new URL(`http://x/api/entries?from=${from.toISOString()}&to=${to.toISOString()}`);
    const list = await (await api.listEntries(db, other.userId, url)).json();
    expect(list.entries).toEqual([]);

    // And they can't edit, delete, or restore it by id.
    expect((await api.updateEntry(db, other.userId, entry.id, { note: "x" })).status).toBe(404);
    expect((await api.deleteEntry(db, other.userId, entry.id)).status).toBe(404);
    expect((await api.restoreEntry(db, other.userId, entry.id)).status).toBe(404);

    // Nor log into Alex's bucket, nor touch it.
    const res = await api.createEntry(
      db,
      other.userId,
      {
        bucketId: alex.byName("Health").id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
      TWO_PM,
    );
    expect(res.status).toBe(404);
    expect((await api.deleteBucket(db, other.userId, alex.byName("Health").id)).status).toBe(404);
    expect(
      (await api.updateBucket(db, other.userId, alex.byName("Health").id, { name: "x" })).status,
    ).toBe(404);
  });

  it("each user can reuse client ids without clashing", async () => {
    const a = await makeUser(db, "a");
    const b = await makeUser(db, "b");
    const clientId = "0b8b6a49-5d0f-4b8e-bd1b-2b0f7c2a1e00";
    const { startAt, endAt } = quickLogRange(15, TWO_PM);
    const ra = await svc.createEntry(
      db,
      a.userId,
      { bucketId: a.byName("Health").id, startAt, endAt, clientId },
      TWO_PM,
    );
    const rb = await svc.createEntry(
      db,
      b.userId,
      { bucketId: b.byName("Health").id, startAt, endAt, clientId },
      TWO_PM,
    );
    expect(ra.created && rb.created).toBe(true);
    expect(rb.entry.userId).toBe(b.userId);
  });
});

describe("T22 cron routes", () => {
  const prev = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = prev;
  });

  it("returns 401 without the secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await cronSync(new Request("http://x/api/cron/sync"))).status).toBe(401);
    expect((await cronBackup(new Request("http://x/api/cron/backup"))).status).toBe(401);
  });

  it("returns 401 with a wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const req = new Request("http://x/api/cron/sync", {
      headers: { authorization: "Bearer nope" },
    });
    expect((await cronSync(req)).status).toBe(401);
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://x/api/cron/sync", {
      headers: { authorization: "Bearer undefined" },
    });
    expect((await cronSync(req)).status).toBe(401);
  });

  it("returns 200 with the right secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const req = new Request("http://x/api/cron/sync", {
      headers: { authorization: "Bearer s3cret" },
    });
    expect((await cronSync(req)).status).toBe(200);
  });
});

describe("T23 validation", () => {
  it.each([
    [0, "An entry must be at least 1 minute long"],
    [1500, "An entry can be at most 24 hours long"],
  ])("rejects an entry of %i minutes with 400", async (minutes, message) => {
    const u = await makeUser(db);
    const res = await api.createEntry(
      db,
      u.userId,
      {
        bucketId: u.byName("Health").id,
        startAt: new Date(TWO_PM.getTime() - minutes * 60_000).toISOString(),
        endAt: TWO_PM.toISOString(),
      },
      TWO_PM,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
  });

  it("rejects a start more than 1 day in the future", async () => {
    const u = await makeUser(db);
    const start = new Date(TWO_PM.getTime() + 25 * 3600_000);
    const res = await api.createEntry(
      db,
      u.userId,
      {
        bucketId: u.byName("Health").id,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
      },
      TWO_PM,
    );
    expect(res.status).toBe(400);
  });

  it("rejects bad ids, bad dates, and missing fields with 400", async () => {
    const u = await makeUser(db);
    expect((await api.createEntry(db, u.userId, {})).status).toBe(400);
    expect(
      (
        await api.createEntry(db, u.userId, {
          bucketId: "nope",
          startAt: "yesterday",
          endAt: "today",
        })
      ).status,
    ).toBe(400);
    expect((await api.deleteEntry(db, u.userId, "not-a-uuid")).status).toBe(400);
  });

  it("a 24 hour entry is the longest allowed", async () => {
    const u = await makeUser(db);
    const res = await api.createEntry(
      db,
      u.userId,
      {
        bucketId: u.byName("Health").id,
        startAt: new Date(TWO_PM.getTime() - 1440 * 60_000).toISOString(),
        endAt: TWO_PM.toISOString(),
      },
      TWO_PM,
    );
    expect(res.status).toBe(201);
  });
});
