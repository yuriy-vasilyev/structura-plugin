import { test, expect, expectSpaMounted, SPA_PAGE } from "./support/fixtures";

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
 * tier picker renders) and the PATCH are stubbed AT THE NETWORK EDGE. Everything
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
  });

  test("renders the tier options and saves the chosen tier", async ({ page, crashes }) => {
    // Capture the PATCH body the SPA submits on save.
    let patchBody: string | null = null;
    await page.route(
      new RegExp(`structura/v1/scheduler/campaign/${CAMPAIGN_ID}$`),
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

    // Open Advanced Settings → the AI Engine block lives inside it.
    await page.getByRole("button", { name: /Advanced Settings/i }).click();

    // The text tier dropdown opens on the stored tier — "Top (Gemini 3.1 Pro)",
    // labeled from the real bundled catalog.
    const textTier = page.getByRole("button", { name: /Top \(Gemini 3\.1 Pro\)/ });
    await expect(textTier).toBeVisible();
    await textTier.click();

    // Both tiers are offered; pick Standard (mid → Gemini 3.5 Flash).
    await expect(page.getByRole("option", { name: /Standard \(Gemini 3\.5 Flash\)/ })).toBeVisible();
    await page.getByRole("option", { name: /Standard \(Gemini 3\.5 Flash\)/ }).click();

    // Save → the campaign persists the chosen TIER (not a bare model id).
    const patched = page.waitForResponse((r) =>
      new RegExp(`scheduler/campaign/${CAMPAIGN_ID}$`).test(r.url()),
    );
    await page.getByRole("button", { name: /save|update/i }).first().click();
    await patched;

    expect(patchBody).toContain('"text_tier":"mid"');
  });
});
