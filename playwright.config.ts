import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E runs against the dev server with the fixture provider and the dev
 * magic-link endpoint (both refused in production by env validation).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  use: {
    baseURL,
    // A stored "rejected" consent keeps the cookie banner out of the way;
    // consent.spec.ts starts from an empty state instead.
    storageState: "tests/e2e/fixtures/consent-rejected.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(a11y|consent)\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        // Enables the cookie banner; the host is a dead local port so nothing leaves the machine.
        env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_e2e", NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:9" },
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
