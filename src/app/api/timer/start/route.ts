import * as api from "@/lib/api";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";

export const POST = authed(async ({ db, userId, req }) =>
  api.startTimer(db, userId, await readJson(req)),
);
