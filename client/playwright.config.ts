import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the wp-admin plugin SPA (`client/`).
 *
 * Unlike the portal/www suites, this drives the SPA where it actually
 * runs: inside WordPress wp-admin, served by a local **ddev** site with the
 * built plugin assets. There is no webServer here — the tests point at the
 * running ddev WordPress (default `http://structura-core.ddev.site`). Bring
 * it up first with `ddev start`; see `client/e2e/README.md`.
 *
 * Auth is a real wp-admin login performed once in `global-setup.ts`, saved
 * to a storageState file the tests reuse.
 */
const WP_BASE_URL = process.env.WP_BASE_URL ?? "http://structura-core.ddev.site";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WP_BASE_URL,
    // ddev serves https with a locally-trusted cert; http is simpler and
    // matches WP's configured siteurl. Tolerate cert issues either way.
    ignoreHTTPSErrors: true,
    storageState: "e2e/.auth/state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
