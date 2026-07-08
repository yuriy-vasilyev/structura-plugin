import { test as base, expect, type Page } from "@playwright/test";

/**
 * wp-admin is a noisy host: core scripts, jQuery migrate, the heartbeat API,
 * and — without a connected Structura license in the local ddev — failing
 * cloud/REST calls all log to the console. None of those are the bug we care
 * about here. The signals that DO matter (the SPA never mounting, an uncaught
 * exception, or the React error boundary rendering) are checked separately,
 * so this list can be generous without weakening the guard.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /favicon/i,
  /jquery/i,
  /heartbeat/i,
  /admin-ajax/i,
  /wp-emoji/i,
  // Cloud proxy calls fail without a connected license on a local WP — the
  // SPA renders a handled connect/onboarding state, not a crash.
  /structura\/v1/i,
  /wp-json/i,
  /rest_route/i,
  /\b40[0-9]\b/,
  /\b50[0-9]\b/,
  /FirebaseError|cloud|license|activation/i,
];

type CrashLog = { consoleErrors: string[]; pageErrors: string[] };
type Fixtures = { crashes: CrashLog };

export const test = base.extend<Fixtures>({
  crashes: async ({ page }, use, testInfo) => {
    const log: CrashLog = { consoleErrors: [], pageErrors: [] };
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
      log.consoleErrors.push(text);
    });
    page.on("pageerror", (err) => {
      log.pageErrors.push(err.stack || err.message);
    });
    await use(log);
    if (log.consoleErrors.length || log.pageErrors.length) {
      await testInfo.attach("crash-log.json", {
        body: JSON.stringify(log, null, 2),
        contentType: "application/json",
      });
    }
  },
});

export { expect };

/** The wp-admin page slug the plugin SPA mounts on. */
export const SPA_PAGE = "/wp-admin/admin.php?page=structura";

/**
 * Assert the SPA actually mounted (its root has content — not the blank
 * white screen that greets a demo when the bundle throws on boot) and that
 * nothing crashed.
 */
export async function expectSpaMounted(
  page: Page,
  crashes: CrashLog
): Promise<void> {
  // React rendered something into #structura-root.
  await expect(page.locator("#structura-root")).not.toBeEmpty({
    timeout: 20_000,
  });
  await expect(
    page.getByTestId("app-error-boundary"),
    "the SPA error boundary rendered (app crashed)"
  ).toHaveCount(0);
  expect(crashes.pageErrors, "uncaught page exception(s)").toEqual([]);
  expect(crashes.consoleErrors, "unexpected console error(s)").toEqual([]);
}
