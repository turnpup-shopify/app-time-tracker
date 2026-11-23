import { expect, test } from "@playwright/test";

for (const path of ["/reports?view=day&date=2026-11-22", "/timer", "/settings"]) {
  test(`${path} has an obvious Back to Today button`, async ({ page }) => {
    await page.goto(path);
    const back = page.getByRole("link", { name: "Back to Today" });
    await expect(back).toBeVisible();
    // It sits near the top of the screen, above the page title.
    expect((await back.boundingBox())!.y).toBeLessThan(120);
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("day-upto")).toBeVisible();
  });
}
