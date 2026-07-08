import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Log into wp-admin once and persist the session so every spec starts
 * authenticated. WordPress auth is cookie-based, so a Playwright storageState
 * captures it cleanly.
 *
 * Credentials default to the dedicated `structura_e2e` admin created for
 * local testing; override via WP_ADMIN_USER / WP_ADMIN_PASS / WP_BASE_URL.
 * To (re)create the user in ddev:
 *   ddev wp user create structura_e2e e2e@structura.test \
 *     --role=administrator --user_pass='e2e-Passw0rd!'
 */
export default async function globalSetup(): Promise<void> {
  const baseURL =
    process.env.WP_BASE_URL ?? "http://structura-core.ddev.site";
  const user = process.env.WP_ADMIN_USER ?? "structura_e2e";
  const pass = process.env.WP_ADMIN_PASS ?? "e2e-Passw0rd!";

  const browser = await chromium.launch();
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(`${baseURL}/wp-login.php`, { waitUntil: "domcontentloaded" });
  await page.fill("#user_login", user);
  await page.fill("#user_pass", pass);
  await page.click("#wp-submit");
  // A successful login lands on wp-admin; a bad one re-renders wp-login with
  // #login_error — fail loudly rather than saving an anonymous session.
  await page.waitForURL(/\/wp-admin\/?/, { timeout: 30_000 });

  await page
    .context()
    .storageState({ path: path.resolve(__dirname, ".auth/state.json") });
  await browser.close();
}
