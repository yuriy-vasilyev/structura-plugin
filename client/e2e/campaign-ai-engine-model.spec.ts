import type { Route } from "@playwright/test";

import { test, expect, expectSpaMounted, SPA_PAGE } from "./support/fixtures";
import { MODEL_NAME } from "../src/test/modelNames";

/**
 * Campaign AI Engine section in the wp-admin SPA (browser-real), after the
 * owner decision of 2026-11-25 (specs/byok-ai-guidance.md §2.2): no plan
 * picks a model or a tier, and none sees one named. The read-only model
 * names that replaced the Top / Standard dropdown that morning went the same
 * day: an own-key campaign's rows are Provider and Fallback. A save carries
 * no model and no tier even for a campaign that stored Top before. The
 * served catalog relay answers, so a section that read names from it again
 * would show them.
 *
 * Replaces `model-tier-picker.spec.ts` (the tier dropdown it drove is gone).
 *
 * A campaign + its cloud model catalog can't be produced on a cloud-less local
 * WP, so the campaign fetch, the served model catalog relay, the license
 * (→ BYOK), a connected Gemini key in the settings read (→ the "AI Engine"
 * group renders) and the PATCH are stubbed AT THE NETWORK EDGE. Everything
 * between — the edit page, the AI-Engine section and the real
 * `flattenCampaign` on save — runs for real.
 *
 * NOTE: this suite runs pre-release against ddev WP (not in the merge gate).
 */

// The served catalog relay (`GET /structura/v1/models`): one text and one
// image model per provider since 2026-11-25.
const SERVED_MODELS = {
  text: [{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini" }],
  image: [{ id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", provider: "gemini" }],
  defaults: { gemini: { text: "gemini-3.8-flash", fast: "gemini-3.5-flash", image: "gemini-3.1-flash-image" } },
};

const CAMPAIGN_ID = "camp-e2e-tier";

// cloud_to_wp-shaped campaign (what /scheduler/campaigns returns), BYOK, as an
// older plugin saved it: a stored Top tier and its models, which the cloud
// ignores since 2026-11-25.
const BYOK_CAMPAIGN = {
  id: CAMPAIGN_ID,
  status: "active",
  identity: {
    name: "Model name e2e",
    objective: "A sufficiently long objective for the campaign edit form to load.",
    campaignMode: "traffic_magnet",
  },
  intelligence: {
    textProvider: "gemini",
    imageProvider: "gemini",
    textModel: "gemini-3.1-pro-preview",
    imageModel: "gemini-3-pro-image",
    textTier: "top",
    imageTier: "top",
    fallbackTextProvider: null,
    fallbackImageProvider: null,
    personaId: "random",
    language: "default",
    postLength: 1200,
    replaceLongDashes: true,
    disableEmojis: true,
    seoRules: {},
  },
  structure: {
    enabledBlocks: ["core/paragraph"],
    featuredImage: true,
    bodyImages: false,
    disclosure: { enabled: false, text: "" },
    referralLinks: [],
    postStatus: "publish",
  },
  taxonomy: {
    categories: { mode: "auto", list: [] },
    tags: { mode: "auto", list: [] },
  },
  schedule: { cron: "0 9 * * 1", endCondition: { type: "infinite", value: null } },
  authority: { domains: [], discoveredAt: null },
  keywords: { bank: [], discoveredAt: null },
  stats: { postsPublished: 0, postsCreated: 0, nextRun: "Not Scheduled" },
};

test.describe("campaign AI engine: no model picked or named", () => {
  test.beforeEach(async ({ page }) => {
    // BYOK license so the AI-Engine section renders its provider rows
    // (managed plans show none).
    await page.route(/structura\/v1\/license\/cloud-status/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "byok", status: "active" }),
      }),
    );
    // Campaign list (the edit route resolves the campaign from here).
    await page.route(/structura\/v1\/scheduler\/campaigns\b/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([BYOK_CAMPAIGN]),
      }),
    );
    // A connected Gemini key. On an own-key plan the edit page renders its
    // "AI Engine" group only for connected providers, and a local site has
    // no key behind the cloud, so the real settings read is patched here.
    await page.route(/structura\/v1\/settings(?:$|[?&])/, async (route: Route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      const settings = await response.json();
      await route.fulfill({
        response,
        json: {
          ...settings,
          ai: {
            ...(settings.ai ?? {}),
            providers: {
              ...(settings.ai?.providers ?? {}),
              gemini: {
                ...(settings.ai?.providers?.gemini ?? {}),
                connected: true,
                masked_key: "AIza…e2e1",
                capabilities: ["text", "image"],
              },
            },
            defaults: { text_provider: "gemini", image_provider: "gemini" },
            has_text: true,
            has_image: true,
          },
        },
      });
    });
    // The served model catalog the plugin relays.
    await page.route(/structura\/v1\/models(?:$|[?&])/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SERVED_MODELS) }),
    );
  });

  // The settings route fetches the real response; a fetch still in flight
  // when the test ends failed the next spec once (2026-11-25).
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("names no model and saves no model or tier", async ({ page, crashes }) => {
    // Capture the PATCH body the SPA submits on save. api-fetch appends
    // `?_locale=user`, so the pattern allows a query string.
    let patchBody: string | null = null;
    await page.route(
      new RegExp(`structura/v1/scheduler/campaign/${CAMPAIGN_ID}(?:$|\\?)`),
      (route) => {
        if (route.request().method() === "POST" || route.request().method() === "PUT") {
          patchBody = route.request().postData();
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, campaign: { campaignId: CAMPAIGN_ID } }),
          });
        }
        return route.continue();
      },
    );

    await page.goto(`${SPA_PAGE}#/campaigns/${CAMPAIGN_ID}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expectSpaMounted(page, crashes);

    // Open Advanced Settings, then its collapsed "AI Engine" group.
    await page.getByRole("button", { name: /Advanced Settings/i }).click();
    await page.getByRole("button", { name: /^AI Engine$/ }).click();

    // Provider and Fallback per row; no Model cell, no name, no tier dropdown.
    await expect(page.getByText("Provider", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Model", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Top|Standard) \(/ })).toHaveCount(0);
    await page.waitForTimeout(500);
    const lines = (await page.locator("#structura-root").innerText())
      .split("\n")
      .filter((line) => MODEL_NAME.test(line));
    expect(lines, "the campaign edit page names a model").toEqual([]);

    // Save → no model and no tier on the wire, though the campaign stored Top.
    const patched = page.waitForResponse((r) =>
      new RegExp(`scheduler/campaign/${CAMPAIGN_ID}(?:$|\\?)`).test(r.url()),
    );
    await page.getByRole("button", { name: "Save Changes" }).click();
    await patched;

    expect(patchBody).not.toBeNull();
    for (const key of ["text_tier", "image_tier", "text_model", "image_model"]) {
      expect(patchBody).not.toContain(`"${key}"`);
    }
    expect(patchBody).toContain('"text_provider":"gemini"');
  });
});
