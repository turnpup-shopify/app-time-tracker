import * as api from "@/lib/api";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";

export const GET = authed(({ db, userId }) => api.listBuckets(db, userId));

export const POST = authed(async ({ db, userId, req }) =>
  api.createBucket(db, userId, await readJson(req)),
);
