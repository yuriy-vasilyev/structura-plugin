import { test, expect, expectSpaMounted, SPA_PAGE } from "./support/fixtures";

/**
 * Onboarding wizard does not resurrect after it's been dismissed.
 *
 * Browser-real regression for the recurring "wizard keeps reappearing" bug
 * (2026-07-20, 3rd occurrence). The old suppressor was a localStorage flag
 * keyed by the activation id, which drifts on workspace re-provision, so the
 * wizard came back. The fix moves the "done" decision to a plugin wp_option
 * (`structura_onboarding_dismissed`) set on Finish/Exit and read by the gate.
 *
 * This exercises the full seam that no jsdom test spans: Exit → POST
 * /onboarding/dismiss → wp_option written → localized into structuraConfig on
 * the next load → the client gate honours it. The dismiss route is
 * plugin-local (no cloud), so it works on a cloud-less local WP and for the
 * anonymous tier — exactly the case that had no server signal before.
 */

test.describe("onboarding dismissal is durable", () => {
  test("exiting the wizard stops it auto-reopening after a reload", async ({
    page,
    crashes,
  }) => {
    // Open the wizard directly (auto-redirect only fires from "/", so this is
    // deterministic regardless of the install's fresh-nudge state).
    await page.goto(`${SPA_PAGE}#/onboarding`, {
      waitUntil: "domcontentloaded",
    });
    const exit = page.getByRole("link", { name: /Exit/i });
    await expect(exit).toBeVisible();

    // Exit fires the durable dismissal; it MUST land server-side before we
    // reload, or the reloaded structuraConfig won't carry the flag yet.
    const dismissed = page.waitForResponse(
      (r) =>
        /structura\/v1\/onboarding\/dismiss/.test(r.url()) &&
        r.request().method() === "POST",
    );
    await exit.click();
    await dismissed;

    // Fresh load of the dashboard root — the gate reads the localized option.
    await page.goto(`${SPA_PAGE}#/`, { waitUntil: "domcontentloaded" });
    await expectSpaMounted(page, crashes);

    // Give the auto-redirect its chance to (not) fire, then assert we stayed
    // on the dashboard and the wizard chrome is absent.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText("Setup wizard")).toHaveCount(0);
  });
});
