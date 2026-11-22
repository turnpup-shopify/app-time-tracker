import * as api from "@/lib/api";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";

export const PATCH = authed<{ id: string }>(async ({ db, userId, req, params }) =>
  api.updateBucket(db, userId, params.id, await readJson(req)),
);

export const DELETE = authed<{ id: string }>(({ db, userId, params }) =>
  api.deleteBucket(db, userId, params.id),
);
