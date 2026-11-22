import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as api from "@/lib/api";
import * as svc from "@/lib/service";
import { quickLogRange } from "@/lib/time";
import { makeDb, makeUser, TWO_PM } from "./helpers";

let db: Db;
let user: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  db = await makeDb();
  user = await makeUser(db);
});

describe("default buckets", () => {
  it("a new user gets the five default buckets in order", () => {
    expect(user.buckets.map((b) => b.name)).toEqual([
      "Work FD",
      "Work Personal",
      "Health",
      "Non-computer",
      "Hobbies Computer",
    ]);
  });

  it("signing in again does not duplicate or reseed buckets", async () => {
    await svc.deleteBucket(db, user.userId, user.byName("Health").id);
    const again = await svc.ensureUser(db, { sub: "google-sub-1" });
    expect(again).toBe(user.userId);
    expect(await svc.listBuckets(db, user.userId)).toHaveLength(4);
  });
});

describe("T18 delete bucket with entries", () => {
  it("is blocked with a clear message", async () => {
    const health = user.byName("Health");
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    await svc.createEntry(db, user.userId, { bucketId: health.id, startAt, endAt }, TWO_PM);

    const res = await api.deleteBucket(db, user.userId, health.id);
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(error).toBe('"Health" has 1 entry. Archive it or move its entries first.');
    expect(await svc.listBuckets(db, user.userId)).toHaveLength(5);
  });

  it("works once its only entry was deleted", async () => {
    const health = user.byName("Health");
    const { startAt, endAt } = quickLogRange(30, TWO_PM);
    const { entry } = await svc.createEntry(
      db,
      user.userId,
      { bucketId: health.id, startAt, endAt },
      TWO_PM,
    );
    await svc.deleteEntry(db, user.userId, entry.id);
    const res = await api.deleteBucket(db, user.userId, health.id);
    expect(res.status).toBe(200);
  });

  it("archiving keeps the bucket and its history", async () => {
    const health = user.byName("Health");
    const res = await api.updateBucket(db, user.userId, health.id, { archived: true });
    const { bucket } = await res.json();
    expect(bucket.archivedAt).not.toBeNull();
    expect(await svc.listBuckets(db, user.userId)).toHaveLength(5);
  });
});

describe("bucket rules", () => {
  it("names are unique per user, ignoring case", async () => {
    const res = await api.createBucket(db, user.userId, {
      name: "health",
      color: "#123456",
      group: "life",
    });
    expect(res.status).toBe(409);
  });

  it("names are at most 24 characters", async () => {
    const res = await api.createBucket(db, user.userId, {
      name: "x".repeat(25),
      color: "#123456",
      group: "life",
    });
    expect(res.status).toBe(400);
  });

  it("renaming to an existing name is rejected", async () => {
    const res = await api.updateBucket(db, user.userId, user.byName("Health").id, {
      name: "Work FD",
    });
    expect(res.status).toBe(409);
  });
});
