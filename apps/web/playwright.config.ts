import { defineConfig, devices } from "@playwright/test";

/**
 * E2E for the authenticated web app. Expects:
 *  - web on BASE_URL (default http://localhost:3102) with API_INTERNAL_URL pointing to an API
 *    whose WEB_PUBLIC_URL is the same origin (CSRF Origin check);
 *  - Mailpit API on MAILPIT_URL (default http://127.0.0.1:8025).
 * Set E2E_WEB_SERVER=1 to let Playwright start `next dev` itself.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3102";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 240_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: process.env.PW_OUTPUT_DIR ?? "test-results",
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.E2E_WEB_SERVER
    ? {
        command: "pnpm exec next dev -p 3102",
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
        env: { NEXT_DIST_DIR: ".next/app-3102", API_INTERNAL_URL: process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4102" },
      }
    : undefined,
});
