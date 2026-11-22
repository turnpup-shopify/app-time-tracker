import * as api from "@/lib/api";
import { authed } from "@/lib/route";

export const POST = authed(({ db, userId }) => api.stopTimer(db, userId));
