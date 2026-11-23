import { expect, test, type Page } from "@playwright/test";

/** Deletes every entry for today and unarchives buckets so each test starts clean. */
async function reset(page: Page) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
  const res = await page.request.get(`/api/entries?from=${from}&to=${to}`);
  const { entries } = await res.json();
  for (const e of entries) await page.request.delete(`/api/entries/${e.id}`);
}

async function open(page: Page) {
  await page.goto("/");
  await reset(page);
  await page.reload();
  await expect(page.getByTestId("day-total")).toHaveText("0m");
}

const card = (page: Page, name: string) => page.getByTestId(`bucket-${name}`);
const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

test("T01 quick log updates ring, total, timeline, and shows a toast", async ({ page }) => {
  await open(page);
  await card(page, "Health").getByRole("button", { name: /Health/ }).click();
  const before = new Date();
  await card(page, "Health").getByRole("button", { name: "30m", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("Nice. 30m of Health logged.");
  await expect(page.getByTestId("day-total")).toHaveText("30m");
  await expect(page.getByTestId("day-upto")).toHaveText("up to 8:30 AM");
  const row = page.getByTestId("timeline-row");
  await expect(row).toHaveCount(1);

  const end = new Date(before);
  end.setSeconds(0, 0);
  const start = new Date(end.getTime() - 30 * 60_000);
  await expect(row).toContainText(`${fmt(start)} to ${fmt(end)}`);
});

test("T02 a fast double tap creates exactly one entry", async ({ page }) => {
  await open(page);
  await card(page, "Work FD").getByRole("button", { name: /Work FD/ }).click();
  const chip = card(page, "Work FD").getByRole("button", { name: "15m", exact: true });
  await chip.dblclick();
  await expect(page.getByRole("status")).toContainText("15m of Work FD logged");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("timeline-row")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("timeline-row")).toHaveCount(1);
});

test("T03 undo removes the entry from the UI and the server", async ({ page }) => {
  await open(page);
  await card(page, "Health").getByRole("button", { name: /Health/ }).click();
  await card(page, "Health").getByRole("button", { name: "1h", exact: true }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("day-total")).toHaveText("0m");
  await page.reload();
  await expect(page.getByText("Nothing logged yet today.")).toBeVisible();
});

test("T04 backdate with Ended at 1h ago", async ({ page }) => {
  await open(page);
  await card(page, "Non-computer").getByRole("button", { name: /Non-computer/ }).click();
  await page.getByRole("button", { name: "1h ago" }).click();
  const before = new Date();
  await card(page, "Non-computer").getByRole("button", { name: "1h", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1h of Non-computer logged");

  const end = new Date(before.getTime() - 60 * 60_000);
  end.setSeconds(0, 0);
  const start = new Date(end.getTime() - 60 * 60_000);
  await expect(page.getByTestId("timeline-row")).toContainText(`${fmt(start)} to ${fmt(end)}`);
});

test("edit an entry's bucket from the timeline", async ({ page }) => {
  await open(page);
  await card(page, "Health").getByRole("button", { name: /Health/ }).click();
  await card(page, "Health").getByRole("button", { name: "15m", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.getByTestId("timeline-row").click();
  const dialog = page.getByRole("dialog", { name: "Edit entry" });
  await dialog.getByRole("button", { name: "Hobbies Computer" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("timeline-row")).toContainText("Hobbies Computer");
});

test("T18 deleting a bucket with entries is blocked", async ({ page }) => {
  await open(page);
  await card(page, "Health").getByRole("button", { name: /Health/ }).click();
  await card(page, "Health").getByRole("button", { name: "15m", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.goto("/settings");
  page.on("dialog", (d) => d.accept());
  await page.getByTestId("edit-bucket-Health").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("bucket-notice")).toHaveText(
    '"Health" has 1 entry. Archive it or move its entries first.',
  );
  await expect(page.getByTestId("edit-bucket-Health")).toBeVisible();
});

test("T22 cron route rejects calls without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/sync")).status()).toBe(401);
  expect(
    (await request.get("/api/cron/sync", { headers: { authorization: "Bearer e2e-cron" } })).status(),
  ).toBe(200);
});
