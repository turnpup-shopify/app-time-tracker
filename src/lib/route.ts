import "server-only";
import { getDb, type Db } from "@/db";
import { errorJson, handle } from "./http";
import { currentUserId } from "./session";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler so it only runs for a signed in user. */
export function authed<P = Record<string, never>>(
  fn: (args: { db: Db; userId: string; req: Request; params: P }) => Promise<Response>,
) {
  return (req: Request, ctx: Ctx<P>) =>
    handle(async () => {
      const userId = await currentUserId();
      if (!userId) return errorJson(401, "Please sign in");
      const db = await getDb();
      return fn({ db, userId, req, params: await ctx.params });
    });
}
