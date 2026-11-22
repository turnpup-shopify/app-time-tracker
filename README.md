# Time Tracker

Phone first time tracker. Log a block of time in two taps and see where every day went.

The full spec lives in the "Time Tracker App Spec" doc. Phases 1 and 2 are done. Core logging, then glass UI and motion.

## What ships in Phase 1

- Google sign in with Auth.js. Every user gets their own five default buckets
- Today screen. Day ring, bucket cards, 15m / 30m / 1h / 2h chips, "Ended at" backdating, optional note
- Undo toast for 6 seconds after every log and every delete
- Today timeline. Tap to edit, swipe left to delete
- Settings. Rename, recolor, regroup, reorder, archive, add, and delete buckets
- Postgres schema for all four tables, with the calendar and rules tables ready for Phase 5
- Cron routes guarded by `CRON_SECRET` (the sync and backup work lands in Phases 5 and 6)

Timer, Reports, and Calendar show a "ships in phase N" card for now.

## Phase 2. Glass UI and motion

- Frosted glass cards over three color blobs that drift over 40 seconds
- Day ring slices grow in. A colored dot flies from the chip into the ring. The total rolls up
- Card and chip press with a spring back. Every motion is under 400ms
- Haptic tap on log where the phone supports it
- Light theme follows the phone setting. Dark is the default
- Reduced motion turns off scale, fly, and drift. Only fades remain
- Installable. Web app manifest, app icons, and Apple touch icon

## Tests

| Spec ID | Where |
| --- | --- |
| T01 to T04 | `tests/unit/entries.test.ts` and `tests/e2e/today.spec.ts` |
| T18 | `tests/unit/buckets.test.ts` and `tests/e2e/today.spec.ts` |
| T21, T23 | `tests/unit/security.test.ts` |
| T22 | `tests/unit/security.test.ts` and `tests/e2e/today.spec.ts` |
| T24, T25 | `tests/e2e/design.spec.ts` |

Unit and API tests run against a real Postgres (PGlite, in memory) with the real migrations.
E2E runs on an iPhone 14 viewport and desktop Chrome.

```bash
npm test        # Vitest
npm run e2e     # Playwright. Starts its own dev server and database
```

## Run it locally with no accounts

```bash
DATABASE_URL=pglite:./.pglite/dev E2E_TEST_USER=me AUTH_SECRET=dev npm run dev
```

`E2E_TEST_USER` skips Google sign in. It only works in `next dev`, and never on Vercel.

## Deploy to Vercel

1. Import the repo in Vercel
2. Storage tab. Add **Neon** from the Marketplace. It sets `DATABASE_URL`
3. Google Cloud Console. Create an OAuth client (Web). Add the redirect URI
   `https://<your-domain>/api/auth/callback/google`
4. Set env vars `AUTH_SECRET` (`npx auth secret`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `CRON_SECRET`
5. Deploy. The `vercel-build` script runs the database migrations, then builds

See `.env.example` for every variable.
