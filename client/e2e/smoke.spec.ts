import { test, expectSpaMounted, SPA_PAGE } from "./support/fixtures";

/**
 * wp-admin plugin SPA smoke net.
 *
 * Loads the plugin's admin page and each of its in-app (HashRouter) routes
 * inside a real WordPress wp-admin, and asserts the SPA mounted and did not
 * crash. This is the net for the "wp-admin went blank during a client demo"
 * class — the SPA runs embedded in WordPress, so only a real wp-admin page
 * exercises the enqueue + mount path the unit tests can't.
 *
 * Runs against a local ddev WordPress with the built plugin assets; see
 * README.md. Cloud-backed data may be empty/erroring without a connected
 * license — that renders a handled state, not a crash (see the guard).
 */

// In-app HashRouter routes (App.tsx). Each loads as `?page=structura#/<route>`.
const HASH_ROUTES = [
  "/", // dashboard
  "/campaigns",
  "/campaigns/new",
  "/generate",
  "/personas",
  "/ai-engine",
  "/visuals",
  "/site/info",
  "/site/competitors",
  "/site/settings",
  "/settings",
  "/account",
  "/notices",
];

test.describe("wp-admin plugin SPA mounts without crashing", () => {
  for (const hash of HASH_ROUTES) {
    test(`route #${hash}`, async ({ page, crashes }) => {
      await page.goto(`${SPA_PAGE}#${hash}`, { waitUntil: "domcontentloaded" });
      await expectSpaMounted(page, crashes);
    });
  }
});
