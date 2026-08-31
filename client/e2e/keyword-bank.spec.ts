import { test, expect, SPA_PAGE, expectSpaMounted } from "./support/fixtures";

/**
 * Ranked keyword bank on the campaign editor's Keywords tab, inside a real
 * wp-admin (design handoff `marketing/design_handoff_keyword_bank`).
 *
 * Live QA on 2026-08-28 reported the Edit → Keywords rows "stuck at partial
 * opacity" and un-hoverable for 60 s. It did not reproduce (rows finish their
 * staggered entrance fade within ~1 s and hover resolves in <1 s), but the
 * shape of the report — a remount loop restarting the entrance animation —
 * is exactly what `EditCampaignPage`'s `key={dataUpdatedAt}` provider would
 * produce if the campaign query ever started refetching in a loop. This pins
 * the steady state: the list mounts ONCE, every row settles at opacity 1,
 * and the hover-reveal actions work.
 *
 * Needs a campaign to exist on the connected license (the local ddev site
 * talks to the production cloud under its test license); skips when the
 * campaigns list is empty so the suite stays green on a bare install.
 */
test.describe("campaign editor — Keywords tab (ranked bank)", () => {
  test("rows mount once, settle fully visible and reveal actions on hover", async ({
    page,
    crashes,
  }) => {
    await page.goto(`${SPA_PAGE}#/campaigns`, { waitUntil: "domcontentloaded" });
    await expectSpaMounted(page, crashes);

    // Campaign cards navigate via onClick (no <a href>) — clicking the
    // status badge bubbles to the card. Wait for the cloud-backed list.
    const badge = page.getByText(/^(Active|Paused|Completed)$/i).first();
    const hasCampaign = await badge
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasCampaign, "no campaign on the connected license");
    await badge.click();
    await page.waitForURL(/#\/campaigns\/[^/]+$/, { timeout: 20_000 });
    const id = page.url().split("#/campaigns/")[1];

    await page.goto(`${SPA_PAGE}#/campaigns/${id}/edit`, { waitUntil: "domcontentloaded" });
    // Count keyword-bank unmounts from the moment the tab opens.
    await page.evaluate(() => {
      const w = window as unknown as { __kbDetached: number };
      w.__kbDetached = 0;
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of Array.from(r.removedNodes)) {
            const el = n as Element;
            if (el.matches?.("[data-keyword-bank]") || el.querySelector?.("[data-keyword-bank]")) {
              w.__kbDetached++;
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole("button", { name: /Keywords/ }).first().click();

    const list = page.getByRole("list", { name: "Keyword bank, in publish order" });
    await expect(list).toBeVisible({ timeout: 20_000 });
    const rows = list.getByRole("listitem");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Every row finishes its entrance fade — none is left translucent.
    await expect
      .poll(
        () =>
          list.evaluate((ul) =>
            Array.from(ul.querySelectorAll("li")).every(
              (li) => getComputedStyle(li).opacity === "1"
            )
          ),
        { timeout: 5_000 }
      )
      .toBe(true);

    // Hover reveals the actions on the first row (pointer device).
    const first = rows.first();
    await first.hover({ timeout: 5_000 });
    await expect(first.locator("[data-actions]")).toHaveCSS("opacity", "1", { timeout: 2_000 });
    await expect(first.getByRole("button", { name: /^Remove / })).toBeVisible();

    // The list did not remount while we looked at it.
    await page.waitForTimeout(1_500);
    expect(
      await page.evaluate(() => (window as unknown as { __kbDetached: number }).__kbDetached)
    ).toBe(0);

    await expectSpaMounted(page, crashes);
  });
});
