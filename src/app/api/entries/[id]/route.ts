import * as api from "@/lib/api";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";

export const PATCH = authed<{ id: string }>(async ({ db, userId, req, params }) =>
  api.updateEntry(db, userId, params.id, await readJson(req)),
);

export const DELETE = authed<{ id: string }>(({ db, userId, params }) =>
  api.deleteEntry(db, userId, params.id),
);
