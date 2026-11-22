import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number, h = 0, m = 0) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, h, m);
};

async function reset(page: Page) {
  const from = daysAgo(40).toISOString();
  const to = daysAgo(-2).toISOString();
  const { entries } = await (await page.request.get(`/api/entries?from=${from}&to=${to}`)).json();
  for (const e of entries) await page.request.delete(`/api/entries/${e.id}`);
}

async function seed(page: Page, rows: [string, Date, Date][]) {
  const { buckets } = await (await page.request.get("/api/buckets")).json();
  for (const [name, s, e] of rows) {
    const bucketId = buckets.find((b: { name: string }) => b.name === name).id;
    const res = await page.request.post("/api/entries", {
      data: { bucketId, startAt: s.toISOString(), endAt: e.toISOString() },
    });
    expect(res.ok()).toBe(true);
  }
}

const ready = (page: Page) => page.locator('[data-testid="report-body"][data-ready="true"]');

test.beforeEach(async ({ page }) => {
  await page.goto("/reports");
  await reset(page);
});

test("T19 a 2 hour gap shows as Untracked and fills in one tap", async ({ page }) => {
  await seed(page, [
    ["Work FD", daysAgo(1, 9), daysAgo(1, 10)],
    ["Health", daysAgo(1, 12), daysAgo(1, 13)],
  ]);
  await page.goto(`/reports?view=day&date=${ymd(daysAgo(1))}`);
  await expect(ready(page)).toBeVisible();
  await expect(page.getByTestId("report-total")).toHaveText("2h");

  const gap = page.getByTestId("untracked");
  await expect(gap).toHaveCount(1);
  await expect(gap).toContainText("Untracked 2h");
  await gap.click();
  await page.getByRole("dialog", { name: "Fill untracked time" }).getByRole("button", { name: "Hobbies Computer" }).click();

  await expect(page.getByTestId("report-total")).toHaveText("4h");
  await expect(page.getByTestId("untracked")).toHaveCount(0);
});

test("T09 an entry across midnight counts on both days", async ({ page }) => {
  await seed(page, [["Health", daysAgo(2, 23, 30), daysAgo(1, 0, 30)]]);
  await page.goto(`/reports?view=day&date=${ymd(daysAgo(2))}`);
  await expect(ready(page)).toBeVisible();
  await expect(page.getByTestId("report-total")).toHaveText("30m");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByTestId("report-title")).toHaveText("Yesterday");
  await expect(page.getByTestId("report-total")).toHaveText("30m");
});

test("T20 swiping to the previous day shows it in under 300ms on 4G", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Network throttling uses Chrome DevTools");
  await seed(page, [
    ["Work FD", daysAgo(2, 9), daysAgo(2, 11)],
    ["Health", daysAgo(3, 7), daysAgo(3, 8)],
  ]);

  // Slow 4G profile from Chrome DevTools. 150ms round trip, about 1.6 Mbps down.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  await page.goto(`/reports?view=day&date=${ymd(daysAgo(1))}`);
  await expect(ready(page)).toBeVisible({ timeout: 15_000 });
  // Let the neighbor prefetch finish, as it would while you read the day.
  await page.waitForLoadState("networkidle");

  for (const back of [2, 3]) {
    const target = `day:${ymd(daysAgo(back))}`;
    const ms = await page.evaluate(async (target) => {
      const section = document.querySelector("section")!;
      const t0 = performance.now();
      const opts = { bubbles: true, pointerType: "touch", isPrimary: true } as const;
      section.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: 80, clientY: 400 }));
      section.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: 300, clientY: 405 }));
      return new Promise<number>((resolve) => {
        const check = () => {
          const body = document.querySelector('[data-testid="report-body"]');
          if (body?.getAttribute("data-key") === target && body.getAttribute("data-ready") === "true") {
            resolve(performance.now() - t0);
          } else requestAnimationFrame(check);
        };
        check();
      });
    }, target);
    expect(ms).toBeLessThan(300);
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByTestId("report-total")).toHaveText("1h");
});

test("week view totals, and tapping a bar opens that day", async ({ page }) => {
  await seed(page, [
    ["Work FD", daysAgo(1, 9), daysAgo(1, 12)],
    ["Health", daysAgo(1, 13), daysAgo(1, 14)],
  ]);
  await page.goto(`/reports?view=week&date=${ymd(daysAgo(1))}`);
  await expect(ready(page)).toBeVisible();
  await expect(page.getByTestId("range-table")).toContainText("Work FD");
  await expect(page.getByTestId("range-table")).toContainText("up 3h vs last week");

  const label = daysAgo(1).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  await page.getByRole("button", { name: new RegExp(`^${label}\\. 4h\\. Open day`) }).click();
  await expect(page.getByRole("tab", { name: "day" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("report-total")).toHaveText("4h");
});

test("CSV export has one row per entry", async ({ page }) => {
  await seed(page, [["Health", daysAgo(1, 9), daysAgo(1, 9, 45)]]);
  const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const res = await page.request.get(
    `/api/export/csv?from=${ymd(daysAgo(7))}&to=${ymd(daysAgo(0))}&tz=${encodeURIComponent(tz)}`,
  );
  const lines = (await res.text()).trim().split("\r\n");
  expect(lines).toEqual(["date,start,end,minutes,bucket,source,note", `${ymd(daysAgo(1))},09:00,09:45,45,Health,manual,`]);

  await page.goto("/settings");
  await expect(page.getByTestId("download-csv")).toHaveAttribute("href", /\/api\/export\/csv\?from=/);
});

for (const scheme of ["dark", "light"] as const) {
  test.describe(`reports accessibility, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test("day, week, and month with data have zero serious issues", async ({ page }) => {
      await seed(page, [
        ["Work FD", daysAgo(1, 9), daysAgo(1, 10)],
        ["Health", daysAgo(1, 9, 30), daysAgo(1, 13)],
      ]);
      for (const view of ["day", "week", "month"]) {
        await page.goto(`/reports?view=${view}&date=${ymd(daysAgo(1))}`);
        await expect(ready(page)).toBeVisible();
        await page.waitForTimeout(300);
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        const bad = r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${view} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
        expect(bad).toEqual([]);
      }
    });
  });
}
