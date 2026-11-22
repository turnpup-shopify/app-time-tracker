import { expect, test, type Page } from "@playwright/test";

/** Clears today's entries and any running timer. */
async function reset(page: Page) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
  const { entries } = await (await page.request.get(`/api/entries?from=${from}&to=${to}`)).json();
  for (const e of entries) await page.request.delete(`/api/entries/${e.id}`);
  await page.evaluate(() => localStorage.clear());
}

async function openTimer(page: Page) {
  await page.goto("/timer");
  await reset(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
}

async function start(page: Page, bucket: string) {
  await page.getByRole("radio", { name: bucket }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("timer-clock")).toBeVisible();
}

test("T05 the timer keeps running after the tab closes", async ({ page, context }) => {
  await openTimer(page);
  await start(page, "Health");
  const startedAt = await page.getByTestId("timer-clock").getAttribute("data-start");
  await page.close();

  await new Promise((r) => setTimeout(r, 2500));
  const again = await context.newPage();
  await again.goto("/timer");
  const clock = again.getByTestId("timer-clock");
  await expect(clock).toBeVisible();
  expect(await clock.getAttribute("data-start")).toBe(startedAt);
  // At least 2 seconds have passed since it started.
  await expect(clock).toHaveText(/^0:0[2-9]$|^0:[1-5]\d$/);

  // Today shows it as running too.
  await again.goto("/");
  await expect(again.getByTestId("running-pill")).toContainText("Health");
  await expect(again.getByTestId("timeline-row")).toContainText("to now");
});

test("T06 starting another bucket stops the first", async ({ page }) => {
  await openTimer(page);
  await start(page, "Health");
  await page.getByRole("button", { name: "Work FD" }).click();
  await expect(page.getByRole("status")).toContainText("Work FD started.");
  await expect(page.getByTestId("timer-clock")).toBeVisible();
  await expect(page.locator("section").getByText("Work FD").first()).toBeVisible();

  const { timer } = await (await page.request.get("/api/timer")).json();
  const { buckets } = await (await page.request.get("/api/buckets")).json();
  expect(buckets.find((b: { id: string }) => b.id === timer.bucketId).name).toBe("Work FD");
});

test("T07 stopping under a minute logs nothing", async ({ page }) => {
  await openTimer(page);
  await start(page, "Health");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("status")).toHaveText(/Under 1 minute, so nothing was logged\./);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Nothing logged yet today.")).toBeVisible();
});

test("T08 entries logged offline sync once when back online", async ({ page, context }) => {
  await page.goto("/");
  await reset(page);
  await page.reload();
  await expect(page.getByTestId("day-total")).toHaveText("0m");

  await context.setOffline(true);
  for (const [name, chip] of [
    ["Health", "15m"],
    ["Work FD", "30m"],
  ]) {
    await page.getByTestId(`bucket-${name}`).getByRole("button", { name: new RegExp(name) }).click();
    await page.getByTestId(`bucket-${name}`).getByRole("button", { name: chip, exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved offline");
  }
  await expect(page.getByTestId("offline-badge")).toHaveCount(2);
  await expect(page.getByTestId("day-total")).toHaveText("45m");

  await context.setOffline(false);
  await expect(page.getByRole("status")).toContainText("2 offline entries synced", { timeout: 20_000 });
  await expect(page.getByTestId("offline-badge")).toHaveCount(0);

  // Reconnect twice more. Still exactly two entries on the server.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.reload();
  await expect(page.getByTestId("timeline-row")).toHaveCount(2);
});

test("an offline entry can be undone before it syncs", async ({ page, context }) => {
  await page.goto("/");
  await reset(page);
  await page.reload();
  await expect(page.getByTestId("day-total")).toHaveText("0m");

  await context.setOffline(true);
  await page.getByTestId("bucket-Health").getByRole("button", { name: /Health/ }).click();
  await page.getByTestId("bucket-Health").getByRole("button", { name: "1h", exact: true }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("offline-badge")).toHaveCount(0);
  await context.setOffline(false);

  await page.reload();
  await expect(page.getByText("Nothing logged yet today.")).toBeVisible();
});
