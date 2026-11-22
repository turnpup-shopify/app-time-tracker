import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as api from "@/lib/api";
import * as svc from "@/lib/service";
import { getRunningTimer, startTimer, stopTimer } from "@/lib/timer";
import { localDayRange } from "@/lib/time";
import { makeDb, makeUser, TWO_PM } from "./helpers";

let db: Db;
let user: Awaited<ReturnType<typeof makeUser>>;
const at = (min: number, sec = 0) => new Date(TWO_PM.getTime() + min * 60_000 + sec * 1000);

beforeEach(async () => {
  db = await makeDb();
  user = await makeUser(db);
});

describe("T05 timer survives a closed tab", () => {
  it("is still running 10 minutes later with the same start time", async () => {
    const { timer } = await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, at(0));
    // A new page load just asks the server for the running timer.
    const later = await getRunningTimer(db, user.userId);
    expect(later?.id).toBe(timer.id);
    expect(later?.endAt).toBeNull();
    expect(later?.startAt).toEqual(at(0));

    const res = await api.stopTimer(db, user.userId, at(10));
    const body = await res.json();
    expect(body.status).toBe("logged");
    expect(new Date(body.entry.endAt)).toEqual(at(10));
  });

  it("shows up in the day's entries while it runs", async () => {
    await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, at(0));
    const { from, to } = localDayRange(TWO_PM);
    const list = await svc.listEntries(db, user.userId, from, to);
    expect(list).toHaveLength(1);
    expect(list[0].endAt).toBeNull();
    expect(list[0].source).toBe("timer");
  });
});

describe("T06 starting a second timer", () => {
  it("stops and logs the first, then starts the second", async () => {
    const health = user.byName("Health").id;
    const work = user.byName("Work FD").id;
    const first = await startTimer(db, user.userId, { bucketId: health }, at(0));
    const second = await startTimer(db, user.userId, { bucketId: work }, at(25));

    expect(second.stopped.status).toBe("logged");
    if (second.stopped.status !== "logged") throw new Error();
    expect(second.stopped.entry.id).toBe(first.timer.id);
    expect(second.stopped.entry.endAt).toEqual(at(25));

    const running = await getRunningTimer(db, user.userId);
    expect(running?.id).toBe(second.timer.id);
    expect(running?.bucketId).toBe(work);
  });

  it("two starts at the same moment leave exactly one timer running", async () => {
    const health = user.byName("Health").id;
    await Promise.all([
      startTimer(db, user.userId, { bucketId: health }, at(0)),
      startTimer(db, user.userId, { bucketId: health }, at(0)),
    ]);
    const { from, to } = localDayRange(TWO_PM);
    const running = (await svc.listEntries(db, user.userId, from, to)).filter((e) => !e.endAt);
    expect(running).toHaveLength(1);
  });

  it("a repeated client id returns the same timer", async () => {
    const clientId = "3a0f6f4e-7e7a-4c51-9a8e-6f6c5d8b0a11";
    const a = await startTimer(db, user.userId, { bucketId: user.byName("Health").id, clientId }, at(0));
    const b = await startTimer(db, user.userId, { bucketId: user.byName("Health").id, clientId }, at(5));
    expect(b.timer.id).toBe(a.timer.id);
    expect(b.stopped.status).toBe("none");
  });
});

describe("T07 short timers", () => {
  it("stopping after 20 seconds logs nothing", async () => {
    await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, at(0));
    const res = await api.stopTimer(db, user.userId, at(0, 20));
    expect((await res.json()).status).toBe("discarded");
    const { from, to } = localDayRange(TWO_PM);
    expect(await svc.listEntries(db, user.userId, from, to)).toHaveLength(0);
    expect(await getRunningTimer(db, user.userId)).toBeNull();
  });

  it("exactly 1 minute is kept", async () => {
    await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, at(0));
    const r = await stopTimer(db, user.userId, at(1));
    expect(r.status).toBe("logged");
  });
});

describe("timer edges", () => {
  it("stop with nothing running is a no op", async () => {
    expect((await stopTimer(db, user.userId, at(0))).status).toBe("none");
  });

  it("a timer left running over 24 hours is capped at 24 hours", async () => {
    await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, at(0));
    const r = await stopTimer(db, user.userId, at(30 * 60));
    expect(r.status).toBe("logged");
    if (r.status !== "logged") throw new Error();
    expect(r.capped).toBe(true);
    expect(r.entry.endAt!.getTime() - r.entry.startAt.getTime()).toBe(24 * 3600_000);
  });

  it("a second user's timer is separate", async () => {
    const other = await makeUser(db, "other");
    await startTimer(db, user.userId, { bucketId: user.byName("Health").id }, at(0));
    expect(await getRunningTimer(db, other.userId)).toBeNull();
    expect((await stopTimer(db, other.userId, at(10))).status).toBe("none");
    expect(await getRunningTimer(db, user.userId)).not.toBeNull();
    const res = await api.startTimer(db, other.userId, { bucketId: user.byName("Health").id }, at(0));
    expect(res.status).toBe(404);
  });

  it("start rejects a bad bucket id with 400", async () => {
    expect((await api.startTimer(db, user.userId, { bucketId: "nope" })).status).toBe(400);
  });
});
