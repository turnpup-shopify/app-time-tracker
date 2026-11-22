import "server-only";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { ensureUser } from "./service";

/**
 * Test login for local E2E runs only. Needs E2E_TEST_USER set, is ignored on
 * Vercel, and is ignored in production builds.
 */
export function testUserEnabled(): boolean {
  return (
    !!process.env.E2E_TEST_USER &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL
  );
}

/** The signed in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  if (testUserEnabled()) {
    const db = await getDb();
    return ensureUser(db, { sub: `e2e:${process.env.E2E_TEST_USER}`, name: "Test User" });
  }
  const session = await auth();
  return session?.user?.id ?? null;
}
