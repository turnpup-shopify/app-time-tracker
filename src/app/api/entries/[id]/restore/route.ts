import * as api from "@/lib/api";
import { authed } from "@/lib/route";

export const POST = authed<{ id: string }>(({ db, userId, params }) =>
  api.restoreEntry(db, userId, params.id),
);
