/**
 * Shared admin-notice dismiss handler — wp.org review 2026-08-27 ("Use
 * wp_enqueue commands").
 *
 * Every Structura wp-admin notice used to carry its own inline <script>
 * for the dismiss round-trip. They now emit data attributes and rely on
 * the enqueued `assets-static/admin-notices.js`. jsdom can't prove that
 * script is actually enqueued, loaded, and wired to the real markup —
 * this spec does, using whichever Structura notice the ddev site happens
 * to show (on ddev the "cloud can't reach this site" notice is always
 * present because the cloud can't call back into a local URL).
 *
 * Flow: notice visible → click its bespoke dismiss trigger → notice
 * removed immediately (optimistic) → reload → still gone (the admin-ajax
 * POST persisted the per-user dismissal).
 */

import { test, expect } from "./support/fixtures";

test("a Structura notice dismisses through the enqueued shared handler and stays dismissed", async ({
  page,
}) => {
  await page.goto("/wp-admin/index.php", { waitUntil: "domcontentloaded" });

  const notice = page.locator("[data-structura-dismiss-action]").first();
  const count = await notice.count();
  test.skip(count === 0, "no Structura admin notice is showing on this site right now");

  // The shared handler must be on the page — enqueued, not inlined.
  await expect(page.locator('script[src*="assets-static/admin-notices.js"]')).toHaveCount(1);
  await expect(page.locator("script:not([src])", { hasText: "structura-attn__close" })).toHaveCount(0);

  const action = await notice.getAttribute("data-structura-dismiss-action");
  expect(action).toBeTruthy();

  const dismissPost = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().includes("admin-ajax.php") &&
      (req.postData() ?? "").includes(action as string),
  );

  const trigger = notice.locator("[data-structura-dismiss-trigger], .notice-dismiss").first();
  await trigger.click();

  await dismissPost;
  await expect(notice).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-structura-dismiss-action="${action}"]`)).toHaveCount(0);
});
