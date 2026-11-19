import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, Route } from "@playwright/test";
import { test, expect, SPA_PAGE, expectSpaMounted } from "./support/fixtures";

/**
 * Visuals page: the recurring character in a real wp-admin
 * (specs/visual-signatures.md §13; handoff handoffs/recurring-character/README.md).
 * The license, the preset list, the thin pass and every character route are
 * routed to fixtures, so no character call leaves the browser and any
 * connected local site shows the same page; the image shrink runs in the real
 * browser. Screenshots land in client/test-results/visuals-character/, light
 * and dark, desktop and 390px.
 */

const SHOT_DIR = join(process.cwd(), "test-results", "visuals-character");
const DESKTOP = { width: 1440, height: 2600 };
const PHONE = { width: 390, height: 3600 };
/** A dialog covers the viewport only, so dialogs are shot at a real screen size. */
const DIALOG_DESKTOP = { width: 1440, height: 900 };
const DIALOG_PHONE = { width: 390, height: 844 };

const INK = { kind: "curated", id: "ink-and-fill", version: 1 };
const PALETTE = ["#7A3E5A", "#E0A93B", "#F3E9DF", "#2B2B33", "#C97B63"];

/** A 64×48 PNG drawn in the page, as a stand-in for an uploaded photo. */
async function pngStandIn(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#7a3e5a";
    context.fillRect(0, 0, 64, 48);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}

/** Routes the license reads to a paid plan, as the signatures spec does. */
async function paidLicense(page: Page) {
  await page.route(/structura\/v1\/license\/sync/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
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
          plan: "byok",
          license_key: "ST-E2E1-CHAR-ACTR",
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
        plan: "byok",
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
      body: JSON.stringify({
        success: true,
        plan: "byok",
        cycleUsage: { kind: "none", reason: "e2e" },
      }),
    })
  );
  await page.route(/structura\/v1\/visual-signature\/suggest/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestion: null, homepageRead: false }),
    })
  );
}

interface CharacterRoutes {
  /** Bodies of the preset saves. */
  saves: Array<Record<string, unknown>>;
  /** `METHOD /suffix` of every character route the page called. */
  calls: string[];
}

/**
 * Routes the preset list to one bound preset built from `over`, every
 * character route to an answer that writes nothing, and a preset save to a
 * success. The upload answers with the stand-in image as the signed URL.
 */
async function visuals(page: Page, over: Record<string, unknown> = {}): Promise<CharacterRoutes> {
  const routes: CharacterRoutes = { saves: [], calls: [] };
  const image = `data:image/png;base64,${(await pngStandIn(page)).toString("base64")}`;
  const preset = {
    presetId: "p-e2e",
    workspaceId: "ws-e2e",
    label: "Lena look",
    globalArtDirection: "",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    aiLabel: false,
    signature: { kind: "curated", id: "editorial-reportage", version: 1 },
    palette: PALETTE,
    createdBy: "e2e",
    createdAt: "2026-11-18T00:00:00Z",
    updatedAt: "2026-11-18T00:00:00Z",
    boundActivationCount: 1,
    ...over,
  };
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(/structura\/v1\/visual-presets(?:$|[?&/])/, async (route: Route) => {
    const request = route.request();
    const path =
      new URL(request.url()).searchParams.get("rest_route") ?? new URL(request.url()).pathname;
    const character = /\/visual-presets\/p-e2e\/character(.*)$/.exec(path);
    if (character) {
      const suffix = character[1] ?? "";
      // apiFetch sends DELETE as POST with an override header (its httpV1 middleware).
      const method = request.headers()["x-http-method-override"] ?? request.method();
      routes.calls.push(`${method} ${suffix}`);
      if (suffix === "/images")
        return json(route, { success: true, draft: { kind: "person", images: [{ url: image }] } });
      if (suffix === "/description")
        return json(route, {
          success: true,
          description: "A woman with a dark bob and red glasses.",
        });
      if (suffix === "/sheet") {
        return json(route, {
          success: true,
          draft: {
            kind: "person",
            images: [{ url: image }],
            sheet: { url: image, signature: INK },
          },
        });
      }
      if (suffix === "/sheet/approve") {
        return json(route, {
          success: true,
          draft: {
            kind: "person",
            images: [{ url: image }],
            sheet: { url: image, signature: INK, approvedAt: "2026-11-18T10:00:00Z" },
          },
        });
      }
      return json(route, { success: true, ok: true });
    }
    if (request.method() === "GET") {
      return json(route, {
        success: true,
        boundPresetId: "p-e2e",
        presets: [preset],
        characterAvailable: true,
      });
    }
    routes.saves.push(request.postDataJSON() as Record<string, unknown>);
    return json(route, { success: true, preset });
  });
  return routes;
}

async function openVisuals(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto(`${SPA_PAGE}#/visuals`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("radiogroup", { name: "Who appears in your images?" })).toBeVisible({
    timeout: 20_000,
  });
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true });
}

/**
 * The open dialog. HeadlessUI puts `role="dialog"` on a wrapper with no size
 * of its own (its layers are `position: fixed`), which Playwright reports as
 * hidden, so tests assert on what the panel shows instead.
 */
const openDialog = (page: Page) => page.getByRole("dialog");

/** Waits until the dialog panel's enter or switch transition has ended. */
const dialogSettled = (page: Page) =>
  expect(page.locator("[id^=headlessui-dialog-panel]")).not.toHaveAttribute(
    "data-transition",
    /.*/
  );

/** The open dialog at `size`, light and dark, as a user's screen shows it. */
async function dialogShots(page: Page, name: string, size: { width: number; height: number }) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.setViewportSize(size);
  await dialogSettled(page);
  await page.screenshot({ path: join(SHOT_DIR, `${name}-light.png`) });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOT_DIR, `${name}-dark.png`) });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(600);
}

/** Asserts no sideways scroll, then captures light and dark at the current size. */
async function shots(page: Page, name: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(0);
  await shot(page, `${name}-light`);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(600);
  await shot(page, `${name}-dark`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(600);
}

test.describe("Visuals — recurring character", () => {
  test("Person: filtered grid, upload shrunk in the browser, sheet drawn and approved, Save sends the character", async ({
    page,
    crashes,
  }) => {
    await paidLicense(page);
    const routes = await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);
    await shots(page, "nobody-desktop");

    await page.getByRole("radio", { name: /^Person/ }).click();
    const grid = page.getByRole("radiogroup", { name: "Signature" });
    await expect(grid.getByRole("radio")).toHaveCount(3);
    await expect(page.getByRole("button", { name: /^Free prompt/ })).toHaveCount(0);
    await shots(page, "person-intake-desktop");
    await page.setViewportSize(PHONE);
    await shots(page, "person-intake-phone");
    await page.setViewportSize(DESKTOP);

    // A real decode and shrink: a 4000 px image goes out at 1536 px.
    const big = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 4000;
      canvas.height = 3000;
      canvas.getContext("2d")!.fillRect(0, 0, 4000, 3000);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8)
      );
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const uploads: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /character\/images/.test(request.url())) {
        uploads.push((request.postDataJSON() as { data_uri: string }).data_uri);
      }
    });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "lena-front.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(big),
      });
    await expect(page.getByRole("button", { name: "Remove image 1" })).toBeVisible();
    expect(uploads).toHaveLength(1);
    const width = await page.evaluate(async (uri) => {
      const bitmap = await createImageBitmap(await (await fetch(uri)).blob());
      return Math.max(bitmap.width, bitmap.height);
    }, uploads[0]!);
    expect(width).toBe(1536);
    await expect(page.getByRole("textbox", { name: /^Description/ })).toHaveValue(
      "A woman with a dark bob and red glasses."
    );

    await grid.getByRole("radio", { name: /^Ink and fill/ }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Lena");
    await page.getByRole("checkbox", { name: /This is me/ }).click();
    await page.getByRole("button", { name: /^Draw character sheet/ }).click();
    await expect(page.getByRole("heading", { name: "Does this look like Lena?" })).toBeVisible();
    await shots(page, "sheet-desktop");
    await page.setViewportSize(PHONE);
    await shots(page, "sheet-phone");
    await page.setViewportSize(DESKTOP);

    await page.getByRole("button", { name: "View the character sheet larger" }).click();
    const dialog = openDialog(page);
    await expect(
      dialog.getByRole("heading", { name: "Character sheet · Ink and fill" })
    ).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("heading", { name: "Your image 1 of 1" })).toBeVisible();
    await dialogShots(page, "zoom-desktop", DIALOG_DESKTOP);
    await dialogShots(page, "zoom-phone", DIALOG_PHONE);
    await page.setViewportSize(DESKTOP);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("button", { name: "Replace Lena" })).toBeFocused();
    await shots(page, "card-desktop");

    // Another style asks for a new sheet; "Keep" puts the sheet's style back.
    await grid.getByRole("radio", { name: /^Paper cut/ }).click();
    await expect(
      page.getByRole("button", { name: "Draw Lena in Paper cut · 1 image" })
    ).toBeVisible();
    await expect(page.getByText("New sheet needed")).toBeVisible();
    // The notice grows in (rows 0fr to 1fr) before it is shot.
    await page.waitForTimeout(400);
    await shots(page, "new-sheet-desktop");
    await page.getByRole("button", { name: "Keep Ink and fill" }).click();
    await expect(grid.getByRole("radio", { name: /^Ink and fill/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect.poll(() => routes.saves.length).toBe(1);
    expect(routes.saves[0]!.content).toMatchObject({
      signature: INK,
      appearance: "person",
      character: { name: "Lena", reference: "sheet", outfit: "same", confirmed: true },
    });
    expect(routes.calls).toEqual([
      "POST /images",
      "POST /description",
      "POST /sheet",
      "POST /sheet/approve",
    ]);

    await page.setViewportSize(PHONE);
    await shots(page, "card-phone");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("Remove: confirmation, then Nobody at once without a save", async ({ page, crashes }) => {
    await paidLicense(page);
    const routes = await visuals(page, {
      signature: INK,
      appearance: "person",
      boundActivationCount: 3,
      character: {
        kind: "person",
        name: "Lena",
        description: "A woman with a dark bob.",
        reference: "asIs",
        images: [{ url: null }],
      },
    });
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await page.getByRole("button", { name: "Remove Lena" }).click();
    const dialog = openDialog(page);
    await expect(
      dialog.getByText("Lena is removed from all 3 sites that use this preset.")
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep Lena" })).toBeFocused();
    await dialogShots(page, "remove-desktop", DIALOG_DESKTOP);
    await dialogShots(page, "remove-phone", DIALOG_PHONE);
    await page.setViewportSize(DESKTOP);

    await dialog.getByRole("button", { name: /^Remove Lena$/ }).click();
    await expect(page.getByRole("radio", { name: /^Nobody/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(page.getByText("Lena was removed.")).toBeVisible();
    expect(routes.calls).toEqual(["DELETE "]);
    expect(routes.saves).toHaveLength(0);
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
