import * as api from "@/lib/api";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";

export const GET = authed(({ db, userId, req }) => api.listEntries(db, userId, new URL(req.url)));

export const POST = authed(async ({ db, userId, req }) =>
  api.createEntry(db, userId, await readJson(req)),
);
