import * as api from "@/lib/api";
import { authed } from "@/lib/route";

export const GET = authed(({ db, userId }) => api.getTimer(db, userId));
