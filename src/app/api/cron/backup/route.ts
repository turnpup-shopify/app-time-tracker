import { isCronAuthorized } from "@/lib/cron";
import { errorJson, json } from "@/lib/http";

// Nightly Blob backup lands in phase 6. The route and its secret check ship now.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return errorJson(401, "Unauthorized");
  return json({ ok: true, backedUp: false });
}
