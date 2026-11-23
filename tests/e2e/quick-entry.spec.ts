import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/");
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
  const { entries } = await (await page.request.get(`/api/entries?from=${from}&to=${to}`)).json();
  for (const e of entries) await page.request.delete(`/api/entries/${e.id}`);
  await page.reload();
  await expect(page.getByTestId("day-total")).toHaveText("0m");
}

const search = (page: Page) => page.getByRole("searchbox", { name: /Search buckets/ });

test("the cursor starts in the search box", async ({ page }) => {
  await open(page);
  await expect(search(page)).toBeFocused();
});

test("typing a bucket and a duration then Enter logs it", async ({ page }) => {
  await open(page);
  await search(page).fill("health 45m");
  await expect(page.getByTestId("search-hint")).toHaveText("Enter logs 45m to Health. Or tap any bucket.");
  await search(page).press("Enter");

  await expect(page.getByRole("status")).toContainText("Nice. 45m of Health logged.");
  await expect(page.getByTestId("day-total")).toHaveText("45m");
  await expect(search(page)).toHaveValue("");
  await expect(search(page)).toBeFocused();
});

test("a duration alone, then tapping any bucket, logs it", async ({ page }) => {
  await open(page);
  await search(page).fill("1h 15m");
  await page.getByRole("button", { name: "Log 1h 15m to Work FD" }).click();
  await expect(page.getByRole("status")).toContainText("1h 15m of Work FD logged");
  await expect(page.getByTestId("timeline-row")).toHaveCount(1);
});

test("search filters buckets, and Enter without a duration opens the top match", async ({ page }) => {
  await open(page);
  await search(page).fill("hob");
  await expect(page.locator('[data-testid^="bucket-"]')).toHaveCount(1);
  await expect(page.getByTestId("bucket-Hobbies Computer")).toBeVisible();
  await search(page).press("Enter");
  await expect(page.getByLabel("Custom duration for Hobbies Computer")).toBeVisible();

  await search(page).fill("zzz");
  await expect(page.getByTestId("search-hint")).toHaveText('No bucket matches "zzz"');
  await search(page).press("Escape");
  await expect(page.locator('[data-testid^="bucket-"]')).toHaveCount(5);
});

test("an open card takes a custom duration", async ({ page }) => {
  await open(page);
  await page.getByTestId("bucket-Health").getByRole("button", { name: /Health/ }).click();
  const box = page.getByLabel("Custom duration for Health");

  await box.fill("abc");
  await page.getByTestId("bucket-Health").getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByTestId("bucket-Health").getByRole("alert")).toHaveText("Try 45m, 1h 15m, or 1:15. Up to 24h.");

  await box.fill("1:20");
  await box.press("Enter");
  await expect(page.getByRole("status")).toContainText("1h 20m of Health logged");
  await expect(page.getByTestId("day-total")).toHaveText("1h 20m");
});
