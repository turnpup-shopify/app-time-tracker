import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SCREENS = ["/", "/timer", "/reports", "/settings"];

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`T24 accessibility, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const path of SCREENS) {
      test(`${path} has zero serious issues`, async ({ page }) => {
        await page.goto(path);
        await page.locator("main, section").first().waitFor();
        await expect(page.locator("[aria-busy]")).toHaveCount(0);
        // Let entry animations settle so contrast is measured on final colors.
        await page.waitForTimeout(400);
        expect(await axe(page)).toEqual([]);
      });
    }

    test("a running timer has zero serious issues", async ({ page }) => {
      await page.goto("/timer");
      await page.getByRole("radio", { name: "Health" }).click();
      await page.getByRole("button", { name: "Start" }).click();
      await page.getByTestId("timer-clock").waitFor();
      await page.waitForTimeout(400);
      expect(await axe(page)).toEqual([]);
      await page.goto("/");
      await page.getByTestId("running-pill").waitFor();
      await page.waitForTimeout(400);
      expect(await axe(page)).toEqual([]);
      await page.request.post("/api/timer/stop");
    });

    test("an open bucket card and the edit sheet have zero serious issues", async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("bucket-Health").getByRole("button", { name: /Health/ }).click();
      await page.waitForTimeout(300);
      expect(await axe(page)).toEqual([]);

      await page.getByTestId("bucket-Health").getByRole("button", { name: "15m", exact: true }).click();
      await page.getByTestId("timeline-row").first().click();
      await page.getByRole("dialog", { name: "Edit entry" }).waitFor();
      await page.waitForTimeout(400);
      expect(await axe(page)).toEqual([]);
    });
  });
}

/** Counts fly dots added to the page from now on. */
async function watchDots(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __dots: number };
    w.__dots = 0;
    new MutationObserver((muts) => {
      for (const m of muts)
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.classList.contains("fly-dot")) w.__dots++;
        });
    }).observe(document.body, { childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { __dots: number }).__dots);
}

async function logHealth(page: Page) {
  await page.getByTestId("bucket-Health").getByRole("button", { name: /Health/ }).click();
  await page.getByTestId("bucket-Health").getByRole("button", { name: "15m", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("15m of Health logged");
}

test("logging sends a dot into the ring when motion is allowed", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("day-total").waitFor();
  const dots = await watchDots(page);
  await logHealth(page);
  expect(await dots()).toBe(1);
});

test.describe("T25 reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no scale or fly animations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("day-total").waitFor();
    const dots = await watchDots(page);
    await logHealth(page);
    expect(await dots()).toBe(0);

    const styles = await page.evaluate(() => {
      const blob = document.querySelector(".bg-blobs span")!;
      const press = document.querySelector(".press")!;
      const card = document.querySelector('[data-testid="bucket-Health"]')!;
      return {
        blob: getComputedStyle(blob).animationName,
        pressTransition: getComputedStyle(press).transitionProperty,
        cardAnimation: getComputedStyle(card).animationName,
      };
    });
    expect(styles.blob).toBe("none");
    expect(styles.pressTransition).toBe("none");
    expect(["none", "fade-in"]).toContain(styles.cardAnimation);
  });
});

test("the app can be installed", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
