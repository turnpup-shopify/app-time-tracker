import * as api from "@/lib/api";
import { authed } from "@/lib/route";

export const GET = authed(({ db, userId, req }) => api.dayReport(db, userId, new URL(req.url)));
