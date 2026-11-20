import type { Route } from "@playwright/test";
import { getRegistryModel } from "@structura/model-catalog";

import { test, expect, expectSpaMounted, SPA_PAGE } from "./support/fixtures";

// The tier labels the picker builds from the bundled catalog (`buildTierOptions`):
// "<Tier> (<model name>)". Read from the same catalog so a model refresh does
// not break the spec (2026-11-20: mid moved from Gemini 3.5 to 3.8 Flash).
const TOP_LABEL = `Top (${getRegistryModel("gemini", "text", "top")?.name})`;
const STANDARD_LABEL = `Standard (${getRegistryModel("gemini", "text", "mid")?.name})`;

/**
 * Campaign model-TIER picker in the wp-admin SPA (browser-real).
 *
 * The campaign edit AI-Engine section shows a top/mid quality-tier dropdown for
 * BYOK plans — the campaign stores the TIER (`text_tier`/`image_tier`) and the
 * cloud resolves the concrete model at generation time. The jsdom unit test
 * (`CampaignAiEngineSection.test.tsx`) pins the store logic; this spec pins that
 * the picker actually mounts and saves the chosen tier inside a real wp-admin —
 * the "went blank / dropdown does nothing during a demo" class the unit test
 * can't see.
 *
 * A campaign + its cloud model catalog can't be produced on a cloud-less local
 * WP, so the campaign fetch, the model catalog, the license (→ BYOK, so the
 * tier picker renders), a connected Gemini key in the settings read (→ the
 * "AI Engine" group renders) and the PATCH are stubbed AT THE NETWORK EDGE. Everything
 * between — the edit page, the AI-Engine section, the real `@structura/model-
 * catalog` tier options, and the real `flattenCampaign` on save — runs for real.
 *
 * NOTE: this suite runs pre-release against ddev WP (not in the merge gate).
 * If a label/selector below drifts, verify against the live SPA — the store
 * contract itself is also covered by the jsdom + web-portal e2e nets.
 */

const CAMPAIGN_ID = "camp-e2e-tier";

// cloud_to_wp-shaped campaign (what /scheduler/campaigns returns), BYOK, with a
// stored top tier so the picker opens on "Top (…)".
const BYOK_CAMPAIGN = {
  id: CAMPAIGN_ID,
  status: "active",
  identity: {
    name: "Tier picker e2e",
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

test.describe("campaign model tier picker", () => {
  test.beforeEach(async ({ page }) => {
    // BYOK license so the AI-Engine section renders the tier (model) selector
    // (managed plans show provider-only).
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
                text_model: "gemini-3.1-pro-preview",
                image_model: "gemini-3-pro-image",
              },
            },
            defaults: { text_provider: "gemini", image_provider: "gemini" },
            has_text: true,
            has_image: true,
          },
        },
      });
    });
  });

  test("renders the tier options and saves the chosen tier", async ({ page, crashes }) => {
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

    // The text tier dropdown opens on the stored tier, labeled from the real
    // bundled catalog.
    expect(TOP_LABEL).not.toContain("undefined");
    expect(STANDARD_LABEL).not.toContain("undefined");
    const textTier = page.getByRole("button", { name: TOP_LABEL });
    await expect(textTier).toBeVisible();
    await textTier.click();

    // Both tiers are offered; pick Standard (mid).
    await expect(page.getByRole("option", { name: TOP_LABEL })).toBeVisible();
    await expect(page.getByRole("option", { name: STANDARD_LABEL })).toBeVisible();
    await page.getByRole("option", { name: STANDARD_LABEL }).click();

    // Save → the campaign persists the chosen TIER (not a bare model id).
    const patched = page.waitForResponse((r) =>
      new RegExp(`scheduler/campaign/${CAMPAIGN_ID}(?:$|\\?)`).test(r.url()),
    );
    await page.getByRole("button", { name: "Save Changes" }).click();
    await patched;

    expect(patchBody).toContain('"text_tier":"mid"');
  });
});
