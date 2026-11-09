import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, Route } from "@playwright/test";
import { test, expect, SPA_PAGE, expectSpaMounted } from "./support/fixtures";

/**
 * Visuals page: the visual signature picker in a real wp-admin
 * (specs/visual-signatures.md §8; visual-signatures handoff §13). The
 * license, the preset list, the thin suggest pass and the preview are routed
 * to fixtures, so any connected local site shows the same page; a save is
 * answered without writing, and its body is checked instead. Screenshots
 * land in client/test-results/visuals-signatures/, light and dark, desktop
 * and 390px.
 */

const SHOT_DIR = join(process.cwd(), "test-results", "visuals-signatures");
const DESKTOP = { width: 1440, height: 2400 };
const PHONE = { width: 390, height: 3200 };

const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made, like your seasonal planting guides.",
  palette: ["#2F6B4F", "#C8553D", "#A3C585", "#F2E8CF", "#1F2A24"],
};

type Plan = "byok" | "free";

/** Routes the license reads to `plan` (active), and answers the plan sync without writing. */
async function license(page: Page, plan: Plan) {
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
          is_pro: plan !== "free",
          is_licensed: true,
          plan,
          license_key: "ST-E2E1-VISU-ALS0",
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
        plan,
        status: "active",
        activationStatus: "valid",
        message: "",
        entitlements: {},
        graceperiods: {},
      }),
    })
  );
  await page.route(/structura\/v1\/analytics\/usage/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, plan, cycleUsage: { kind: "none", reason: "e2e" } }),
    })
  );
}

/**
 * Routes the preset list to one bound preset built from `over`, the thin
 * pass to {@link SUGGESTION}, and a preset save to a success that writes
 * nothing. Returns the bodies the page saved.
 */
async function visuals(page: Page, over: Record<string, unknown> = {}) {
  const saves: Array<Record<string, unknown>> = [];
  const preset = {
    presetId: "p-e2e",
    workspaceId: "ws-e2e",
    label: "Northfield default",
    globalArtDirection: "Soft daylight photographs of real gardens.",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    aiLabel: false,
    signature: { kind: "curated", id: "editorial-reportage", version: 1 },
    palette: SUGGESTION.palette,
    createdBy: "e2e",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    boundActivationCount: 1,
    ...over,
  };
  await page.route(/structura\/v1\/visual-presets(?:$|[?&/])/, async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, boundPresetId: "p-e2e", presets: [preset] }),
      });
    }
    saves.push(request.postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, preset }),
    });
  });
  await page.route(/structura\/v1\/visual-signature\/suggest/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestion: SUGGESTION, homepageRead: true }),
    })
  );
  return saves;
}

async function openVisuals(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto(`${SPA_PAGE}#/visuals`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("radiogroup", { name: "Signature" })).toBeVisible({ timeout: 20_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true });
}

/** Asserts no sideways scroll, then captures light and dark at the current size. */
async function shots(page: Page, name: string) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
  await shot(page, `${name}-light`);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(600);
  await shot(page, `${name}-dark`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(600);
}

const radio = (page: Page, name: RegExp) => page.getByRole("radio", { name });

test.describe("Visuals — visual signatures", () => {
  test("paid: picking a card checks it, In use stays on the saved one, Save sends the signature", async ({
    page,
    crashes,
  }) => {
    await license(page, "byok");
    const saves = await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await expect(radio(page, /^Editorial reportage/)).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, /^Paper cut/)).toHaveAccessibleDescription(/Our pick for your brand/);
    await shots(page, "paid-desktop");

    await radio(page, /^Paper cut/).click();
    await expect(radio(page, /^Paper cut/)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
    await expect(radio(page, /^Editorial reportage/)).toHaveAccessibleDescription(/In use/);

    // Arrow keys move the selection among the cards.
    await page.keyboard.press("ArrowRight");
    await expect(radio(page, /^Ink and fill/)).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, /^Ink and fill/)).toBeFocused();

    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect((saves[0].content as Record<string, unknown>).signature).toEqual({
      kind: "curated",
      id: "ink-and-fill",
      version: 1,
    });

    await page.setViewportSize(PHONE);
    await shots(page, "paid-phone");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("free: the library and Your own lock with Upgrade plan links; the house card stays open", async ({
    page,
    crashes,
  }) => {
    await license(page, "free");
    await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await expect(radio(page, /^Editorial reportage/)).toBeEnabled();
    for (const name of [/^Still life studio/, /^Paper cut/, /^Ink and fill/, /^Miniature world/, /^Isometric glass/]) {
      await expect(radio(page, name)).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: /^Your own/ })).toBeDisabled();
    const upgrades = page.getByRole("link", { name: /Upgrade plan/ });
    await expect(upgrades).toHaveCount(7);
    const href = new URL((await upgrades.first().getAttribute("href")) ?? "");
    expect(href.hostname).toBe("www.structurawp.com");
    expect(href.searchParams.get("intent")).toBe("unlock_visuals");
    await expect(page.getByRole("button", { name: /Preview with my colours/ })).toBeDisabled();

    await shots(page, "free-desktop");
    await page.setViewportSize(PHONE);
    await shots(page, "free-phone");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("Free prompt reveals its textarea and saves the text without a signature", async ({ page, crashes }) => {
    await license(page, "byok");
    const saves = await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveCount(0);
    await page.getByRole("button", { name: /^Free prompt/ }).click();
    const prompt = page.getByRole("textbox", { name: "Your prompt" });
    await expect(prompt).toBeFocused();
    await expect(prompt).toHaveValue("Soft daylight photographs of real gardens.");

    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0].content).toMatchObject({
      global_art_direction: "Soft daylight photographs of real gardens.",
      signature: null,
    });
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("builder: an empty Name blocks the save; a chip toggles its phrase", async ({ page, crashes }) => {
    await license(page, "byok");
    const saves = await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await page.getByRole("button", { name: /^Your own/ }).click();
    await expect(page.getByRole("heading", { name: "Your own signature" })).toBeFocused();

    const chip = page.getByRole("button", { name: "Add “Soft window light” to Technique" });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Technique" })).toHaveValue("Soft window light");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("textbox", { name: "Technique" })).toHaveValue("");

    await page.getByRole("textbox", { name: "Name" }).fill("");
    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect(page.getByText("Name this signature to save it.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    expect(saves).toHaveLength(0);

    await shots(page, "builder-desktop");
    await page.setViewportSize(PHONE);
    await shots(page, "builder-phone");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("palette: six colours disable Add, with the cap note", async ({ page, crashes }) => {
    await license(page, "byok");
    await visuals(page, { palette: [...SUGGESTION.palette, "#123456"] });
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    const list = page.getByRole("list", { name: "Brand colours" });
    await expect(list.getByRole("button", { name: /^Edit colour/ })).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Add a colour" })).toBeDisabled();
    await expect(page.getByText("Up to six colours. Remove one to add another.")).toBeVisible();

    // Removing one frees a slot.
    await page.getByRole("button", { name: "Edit colour #123456" }).click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Add a colour" })).toBeEnabled();
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
