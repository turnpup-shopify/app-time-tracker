import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // Every test shares one test user.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "iphone-14", use: { ...devices["iPhone 14"], browserName: "chromium" } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `rm -rf .pglite/e2e && next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "pglite:./.pglite/e2e",
      E2E_TEST_USER: "e2e",
      AUTH_SECRET: "e2e-only-secret",
      CRON_SECRET: "e2e-cron",
    },
  },
});
