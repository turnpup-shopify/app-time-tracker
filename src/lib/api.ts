/**
 * Request handlers with the auth step already done. Route files stay thin and
 * tests call these directly with a database and user id.
 */
import type { Db } from "@/db";
import { handle, json } from "./http";
import * as svc from "./service";
import * as timer from "./timer";
import {
  bucketCreateSchema,
  bucketPatchSchema,
  entryCreateSchema,
  entryPatchSchema,
  rangeSchema,
  timerStartSchema,
} from "./validation";
import { z } from "zod";

const idSchema = z.uuid({ message: "Invalid id" });

export const listEntries = (db: Db, userId: string, url: URL) =>
  handle(async () => {
    const { from, to } = rangeSchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    return json({ entries: await svc.listEntries(db, userId, from, to) });
  });

export const createEntry = (db: Db, userId: string, body: unknown, now = new Date()) =>
  handle(async () => {
    const input = entryCreateSchema.parse(body);
    const { entry, created } = await svc.createEntry(db, userId, input, now);
    return json({ entry }, created ? 201 : 200);
  });

export const updateEntry = (db: Db, userId: string, id: string, body: unknown) =>
  handle(async () => {
    const patch = entryPatchSchema.parse(body);
    return json({ entry: await svc.updateEntry(db, userId, idSchema.parse(id), patch) });
  });

export const deleteEntry = (db: Db, userId: string, id: string) =>
  handle(async () => json({ entry: await svc.deleteEntry(db, userId, idSchema.parse(id)) }));

export const restoreEntry = (db: Db, userId: string, id: string) =>
  handle(async () => json({ entry: await svc.restoreEntry(db, userId, idSchema.parse(id)) }));

export const listBuckets = (db: Db, userId: string) =>
  handle(async () => json({ buckets: await svc.listBuckets(db, userId) }));

export const createBucket = (db: Db, userId: string, body: unknown) =>
  handle(async () =>
    json({ bucket: await svc.createBucket(db, userId, bucketCreateSchema.parse(body)) }, 201),
  );

export const updateBucket = (db: Db, userId: string, id: string, body: unknown) =>
  handle(async () =>
    json({
      bucket: await svc.updateBucket(db, userId, idSchema.parse(id), bucketPatchSchema.parse(body)),
    }),
  );

export const deleteBucket = (db: Db, userId: string, id: string) =>
  handle(async () => {
    await svc.deleteBucket(db, userId, idSchema.parse(id));
    return json({ ok: true });
  });

export const getTimer = (db: Db, userId: string) =>
  handle(async () => json({ timer: await timer.getRunningTimer(db, userId) }));

export const startTimer = (db: Db, userId: string, body: unknown, now = new Date()) =>
  handle(async () => {
    const input = timerStartSchema.parse(body);
    return json(await timer.startTimer(db, userId, input, now), 201);
  });

export const stopTimer = (db: Db, userId: string, now = new Date()) =>
  handle(async () => json(await timer.stopTimer(db, userId, now)));
