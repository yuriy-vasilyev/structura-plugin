import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page, Route } from "@playwright/test";
import { test, expect, SPA_PAGE, expectSpaMounted } from "./support/fixtures";

/**
 * Account & License in a real wp-admin (specs/in-portal-billing-design.md
 * §6; §7 item 4): the plan hero names the plan as the customer portal does,
 * shows this site's usage this month and links to the portal with the
 * site's context; while the heartbeat reports a failed payment, the
 * payment-attention variant leads with Fix payment.
 *
 * The heartbeat and usage reads are routed to fixtures, so the page shows a
 * Cloud 30 license on any connected local site, and the plan sync the
 * heartbeat can trigger is answered without writing. wp-admin preloads the
 * settings into the page, so the site's own masked key shows; screenshots
 * mask it. Desktop and 375px, light and dark (the `dark` class on the
 * document, as a dark wp-admin scheme sets it). Screenshots land in
 * client/test-results/account-billing/.
 */

const SHOT_DIR = join(process.cwd(), "test-results", "account-billing");
const DESKTOP = { width: 1280, height: 1400 };
const PHONE = { width: 375, height: 2200 };
/** 2026-11-01T00:00:00Z, when October's allowance resets. */
const NOV_1 = Date.UTC(2026, 10, 1);

/** Routes the settings, heartbeat and usage reads to a Cloud 30 license in `status`. */
async function cloudLicense(page: Page, status: "active" | "past_due") {
  // A heartbeat plan that differs from the stored one makes the SPA sync it.
  await page.route(/structura\/v1\/license\/sync/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) })
  );
  await page.route(/structura\/v1\/settings(?:$|[?&])/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({
      response,
      json: {
        ...settings,
        license: {
          ...(settings.license ?? {}),
          is_pro: true,
          is_licensed: true,
          plan: "cloud",
          license_key: "ST-E2E1-ACCT-BILL",
          max_campaigns: null,
          is_anonymous: false,
        },
      },
    });
  });
  await page.route(/structura\/v1\/license\/cloud-status/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: "cloud",
        status,
        activationStatus: "valid",
        message: "",
        maxCampaigns: null,
        entitlements: {},
        graceperiods: {},
        workspace: { id: "ws-e2e-billing", name: "Northstar Studio", activationsCount: 4 },
      }),
    })
  );
  await page.route(/structura\/v1\/analytics\/usage/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        plan: "cloud",
        renewalDate: NOV_1,
        limits: { maxTokens: 0, maxImages: 90, currentTokens: 0, currentImages: 51 },
        // The cloud sends no usage for a license that is not active.
        cycleUsage:
          status === "active"
            ? {
                kind: "managed",
                cycleMonth: "2026-10",
                cycleResetsAt: NOV_1,
                daysLeftInCycle: 11,
                unmetered: false,
                workspace: {
                  tokensUsed: 0,
                  tokensIncluded: 0,
                  imagesUsed: 51,
                  imagesIncluded: 90,
                  postsUsed: 24,
                  postsIncluded: 30,
                  utilizationPercent: 80,
                },
                // One row: the page reads it as this site's.
                activations: [
                  {
                    activationId: "act-e2e-billing",
                    label: "northstar.example",
                    disconnected: false,
                    tokensUsed: 0,
                    tokensIncluded: 0,
                    imagesUsed: 51,
                    imagesIncluded: 90,
                    postsUsed: 24,
                    postsIncluded: 30,
                    utilizationPercent: 80,
                  },
                ],
              }
            : { kind: "none", reason: `license status: ${status}` },
      }),
    })
  );
}

async function openAccount(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto(`${SPA_PAGE}#/account`, { waitUntil: "domcontentloaded" });
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: join(SHOT_DIR, `${name}.png`),
    fullPage: true,
    // The local site's own masked license key.
    mask: [page.locator("code").filter({ hasText: "***" })],
  });
}

/** Asserts no sideways scroll, then captures light and dark at the current size. */
async function shots(page: Page, name: string) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
  await shot(page, `${name}-light`);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  // Cards and badges transition their colours; capture once they settle.
  await page.waitForTimeout(600);
  await shot(page, `${name}-dark`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(600);
}

/** The customer portal link's query, as a plain object. */
async function portalQuery(page: Page, name: string) {
  const href = await page.getByRole("link", { name }).getAttribute("href");
  const url = new URL(href ?? "");
  expect(url.origin + url.pathname).toBe("https://app.structurawp.com/");
  return Object.fromEntries(url.searchParams);
}

/** The element's top edge, for the order the actions stack in on a phone. */
async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box, "laid out").not.toBeNull();
  return box!.y;
}

test.describe("Account & License — plan hero and payment attention", () => {
  test("Cloud: the plan, this site's usage and the customer portal links", async ({ page, crashes }) => {
    await cloudLicense(page, "active");
    await openAccount(page);
    await expectSpaMounted(page, crashes);

    await expect(page.getByRole("heading", { level: 2, name: "Cloud · 30 posts" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "24 of 30 posts delivered" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "51 of 90 images" })).toBeVisible();
    await expect(page.getByText("Resets Nov 1, 2026 · UTC")).toBeVisible();
    await expect(page.getByText("Your payment needs attention")).toHaveCount(0);

    const host = new URL(page.url()).hostname;
    expect(await portalQuery(page, "Change volume in customer portal")).toMatchObject({
      intent: "change_volume",
      source: "plugin",
      domain: host,
      plan: "cloud",
      workspaceId: "ws-e2e-billing",
    });
    expect(await portalQuery(page, "Manage account")).toMatchObject({ intent: "manage_account", plan: "cloud" });
    await expect(page.getByRole("link", { name: "Manage account" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Change volume in customer portal" })).toHaveAttribute("target", "_blank");

    // Keyboard: the portal links are reachable in order.
    await page.getByRole("link", { name: "Change volume in customer portal" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Manage account" })).toBeFocused();

    await shots(page, "cloud-desktop");
    await page.setViewportSize(PHONE);
    // The primary action stacks first.
    expect(await topOf(page.getByRole("link", { name: "Change volume in customer portal" }))).toBeLessThan(
      await topOf(page.getByRole("link", { name: "Manage account" }))
    );
    await shots(page, "cloud-phone");

    await expectSpaMounted(page, crashes);
    // A late settings refetch must not outlive the test.
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("payment attention: Fix payment leads, the plan shows the overdue payment", async ({ page, crashes }) => {
    await cloudLicense(page, "past_due");
    await openAccount(page);
    await expectSpaMounted(page, crashes);

    const banner = page.getByRole("status").filter({ hasText: "Your payment needs attention" });
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText(
      "We could not collect your latest payment. Update your payment method, then check the outstanding invoice."
    );
    // A button that opens the customer portal in a new tab; the portal is stubbed.
    await page.context().route("https://app.structurawp.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Customer portal</title>" })
    );
    const popup = page.waitForEvent("popup");
    await banner.getByRole("button", { name: "Fix payment in customer portal" }).click();
    const portal = new URL((await popup).url());
    expect(portal.origin + portal.pathname).toBe("https://app.structurawp.com/");
    expect(Object.fromEntries(portal.searchParams)).toMatchObject({
      intent: "fix_payment",
      source: "plugin",
      plan: "cloud",
      workspaceId: "ws-e2e-billing",
    });
    await expect(page.getByText("Payment overdue", { exact: true })).toBeVisible();
    await expect(page.getByText("This month's usage is not available right now.")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(
      page.getByText("Billing changes are made in the customer portal. You may need to sign in as the payer.")
    ).toBeVisible();

    await shots(page, "payment-desktop");
    await page.setViewportSize(PHONE);
    // Fix payment leads, then the hero's primary action, then Manage account.
    const fixTop = await topOf(banner.getByRole("button", { name: "Fix payment in customer portal" }));
    const volumeTop = await topOf(page.getByRole("link", { name: "Change volume in customer portal" }));
    expect(fixTop).toBeLessThan(volumeTop);
    expect(volumeTop).toBeLessThan(await topOf(page.getByRole("link", { name: "Manage account" })));
    await shots(page, "payment-phone");

    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
