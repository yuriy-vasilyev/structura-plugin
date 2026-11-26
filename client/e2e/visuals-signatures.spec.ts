import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page, Route } from "@playwright/test";
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

type Plan = "byok" | "free" | "cloud";

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

/**
 * Routes the channel catalog's Video entry, which gates the Visuals page's
 * Video tab: installable, or locked behind a plan. A local site the cloud
 * cannot reach gets no usable catalog, so the page shows no tabs without this.
 */
async function videoGate(page: Page, gate: "eligible" | "locked") {
  await page.route(/structura\/v1\/channels\/catalog/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        plan: gate === "eligible" ? "cloud" : "byok",
        activeAddons: [],
        entries: [
          {
            id: "video",
            name: "Video",
            description: "Short videos from your posts.",
            category: "social",
            capabilities: [],
            authType: "none",
            iconUrl: "",
            gating: { requiredPlan: "cloud", requiredAddon: null },
            entitlement:
              gate === "eligible"
                ? { canInstall: true, blocker: null }
                : { canInstall: false, blocker: "upgrade_plan" },
          },
        ],
      }),
    })
  );
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
    await expect(page.getByRole("button", { name: /Preview with my colors/ })).toBeDisabled();

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

    await page.getByRole("textbox", { name: "Name", exact: true }).fill("");
    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect(page.getByText("Name this signature to save it.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeFocused();
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

    const list = page.getByRole("list", { name: "Brand colors" });
    await expect(list.getByRole("button", { name: /^Edit color/ })).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Add a color" })).toBeDisabled();
    await expect(page.getByText("Up to six colors. Remove one to add another.")).toBeVisible();

    // Removing one frees a slot.
    await page.getByRole("button", { name: "Edit color #123456" }).click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Add a color" })).toBeEnabled();
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

// 2026-11-21: one column, the palette above an Images | Video tab strip.
test.describe("Visuals — Images and Video tabs", () => {
  const tab = (page: Page, name: "Images" | "Video") => page.getByRole("tab", { name });

  /**
   * The strip is as wide as the panel under it, split into two equal halves.
   * One layout read, polled: the layout is still settling right after a resize.
   */
  async function expectFullWidthStrip(page: Page, panel: "Images" | "Video") {
    const fit = () =>
      page.evaluate((name) => {
        const strip = document.querySelector('[role="tablist"][aria-label="Visuals"]')!;
        const body = document.querySelector(`[role="tabpanel"][aria-label="${name}"]`)!;
        const [images, video] = [...strip.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
        const width = strip.getBoundingClientRect().width;
        return {
          spansPanel: Math.abs(width - body.getBoundingClientRect().width) <= 1,
          equalHalves: Math.abs(images.width - video.width) <= 1 && images.width + video.width > width * 0.9,
        };
      }, panel);
    await expect.poll(fit).toEqual({ spansPanel: true, equalHalves: true });
  }

  test("Images by default; Video holds the video block; one Save sends both tabs' edits", async ({
    page,
    crashes,
  }) => {
    await license(page, "cloud");
    await videoGate(page, "eligible");
    const saves = await visuals(page, {
      videoStyle: "bold",
      videoArtDirection: "Slow pans over raised beds.",
      captionPlacement: "bottom",
    });
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await expect(page.getByRole("tablist", { name: "Visuals" })).toBeVisible();
    await expect(tab(page, "Images")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Brand palette" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Output" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: /Video style preset/ })).toBeHidden();
    await expectFullWidthStrip(page, "Images");
    await shots(page, "tabs-images-desktop");

    await radio(page, /^Paper cut/).click();
    await tab(page, "Video").click();
    await expect(page).toHaveURL(/#\/visuals\?section=video$/);
    await expect(page.getByRole("radiogroup", { name: /Video style preset/ })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Signature" })).toBeHidden();
    await expect(page.getByRole("region", { name: "Brand palette" })).toBeVisible();
    await page.getByRole("radio", { name: /^Top/ }).click();
    await shots(page, "tabs-video-desktop");

    await page.getByRole("button", { name: /Save Changes/ }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0].content).toMatchObject({
      signature: { kind: "curated", id: "paper-cut", version: 1 },
      video_style: "bold",
      video_art_direction: "Slow pans over raised beds.",
      caption_placement: "top",
    });
    await expect(tab(page, "Video")).toHaveAttribute("aria-selected", "true");

    await page.setViewportSize(PHONE);
    await expectFullWidthStrip(page, "Video");
    await shots(page, "tabs-video-phone");
    await tab(page, "Images").click();
    await expect(page).toHaveURL(/#\/visuals$/);
    await shots(page, "tabs-images-phone");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("the Video channel's Edit in Visuals link lands on the Video tab and rings it", async ({
    page,
    crashes,
  }) => {
    await license(page, "cloud");
    await videoGate(page, "eligible");
    await visuals(page);
    await page.setViewportSize(DESKTOP);
    await page.goto(`${SPA_PAGE}#/visuals?section=video`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("radiogroup", { name: /Video style preset/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(tab(page, "Video")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Video" })).toHaveClass(/ring-2/);
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a Save refused for the builder while Video shows brings Images forward with focus on the field", async ({
    page,
    crashes,
  }) => {
    await license(page, "cloud");
    await videoGate(page, "eligible");
    const saves = await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await page.getByRole("button", { name: /^Your own/ }).click();
    await expect(page.getByRole("heading", { name: "Your own signature" })).toBeFocused();
    await tab(page, "Video").click();
    await page.getByRole("button", { name: /Save Changes/ }).click();

    await expect(tab(page, "Images")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("textbox", { name: "Technique" })).toBeFocused();
    await expect(page.getByText("Fill this in to save the signature.")).toHaveCount(4);
    expect(saves).toHaveLength(0);
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a plan without video gets the upgrade teaser in the Video tab", async ({ page, crashes }) => {
    await license(page, "byok");
    await videoGate(page, "locked");
    await visuals(page);
    await openVisuals(page);
    await expectSpaMounted(page, crashes);

    await tab(page, "Video").click();
    const video = page.getByRole("tabpanel", { name: "Video" });
    await expect(video.getByText("Video styling")).toBeVisible();
    await expect(video.getByRole("link", { name: /Upgrade plan/ })).toHaveAttribute(
      "href",
      /intent=unlock_video/
    );
    await expect(page.getByRole("radiogroup", { name: /Video style preset/ })).toHaveCount(0);
    await shots(page, "tabs-video-locked-desktop");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});

/**
 * WCAG contrast of `locator`'s text against what sits behind it: the
 * element's and its ancestors' background colors, translucent layers
 * composited down to the first opaque one. Canvas turns any CSS color
 * (oklch included) into sRGB bytes.
 */
async function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const over = (top: ReturnType<typeof rgba>, below: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + below.r * (1 - top.a),
      g: top.g * top.a + below.g * (1 - top.a),
      b: top.b * top.a + below.b * (1 - top.a),
    });
    const layers: ReturnType<typeof rgba>[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor);
      if (layer.a === 0) continue;
      layers.push(layer);
      if (layer.a === 1) break;
    }
    let bg = { r: 255, g: 255, b: 255 };
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  });
}

/** Relative luminance of `locator`'s own background color (0 black, 1 white). */
async function backgroundLuminance(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  });
}

/**
 * With the `dark` class on the document (the owner's site, 2026-11-21) the
 * wrapper kept wp-admin's light gray, so the dark banners turned into washed
 * boxes of pale text, and wp-admin's own colors for h1 and text fields won
 * over the dark ones (dark ink on a dark field).
 */
test.describe("Visuals — dark wp-admin", () => {
  test("the shell, the banners, the title and the fields read on a dark page", async ({ page, crashes }) => {
    await license(page, "cloud");
    await videoGate(page, "eligible");
    await visuals(page);
    // No preset bound to the site, so the page shows its warning.
    await page.route(/structura\/v1\/visual-presets(?:$|[?&/])/, (route: Route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, boundPresetId: null, presets: [] }),
          })
        : route.fallback()
    );
    // The cloud-unreachable banner reads a flag wp-admin prints inline.
    await page.addInitScript(() => {
      let config: unknown;
      Object.defineProperty(window, "structuraConfig", {
        configurable: true,
        get: () => config,
        set: (value: Record<string, unknown>) => {
          config = { ...value, cloud_unreachable: true };
        },
      });
    });
    await openVisuals(page);
    await expectSpaMounted(page, crashes);
    // Polled reads below: alerts and fields fade their colors in over 150 to 250 ms.
    await page.evaluate(() => document.documentElement.classList.add("dark"));

    await expect.poll(() => backgroundLuminance(page.locator(".structura-app-wrapper"))).toBeLessThan(0.05);
    const title = page.getByRole("heading", { level: 1, name: "Visuals" });
    await expect.poll(() => contrastOf(title)).toBeGreaterThan(7);

    const banner = page.getByRole("alert").filter({ hasText: "Structura Cloud can't reach this site" });
    await expect.poll(() => contrastOf(banner.getByRole("heading"))).toBeGreaterThan(7);
    await expect.poll(() => contrastOf(banner.locator("p").first())).toBeGreaterThan(4.5);
    await expect.poll(() => contrastOf(page.getByText("No visual preset bound to this site"))).toBeGreaterThan(4.5);

    const name = page.getByRole("textbox", { name: "Preset name" });
    await name.fill("Northfield default");
    await expect.poll(() => contrastOf(name)).toBeGreaterThan(7);

    await page.getByRole("tab", { name: "Video" }).click();
    const art = page.getByRole("textbox", { name: "Video Art Direction" });
    await art.fill("Slow pans over raised beds.");
    await expect.poll(() => contrastOf(art)).toBeGreaterThan(7);

    // The same shell on another page; a hash change keeps the class.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    const overview = page.getByRole("heading", { level: 1, name: "Overview" });
    await expect(overview).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => backgroundLuminance(page.locator(".structura-app-wrapper"))).toBeLessThan(0.05);
    await expect.poll(() => contrastOf(overview)).toBeGreaterThan(7);
    // Dashboard cards: wp-admin colors every h2 and h3, and the queue card
    // had no dark styles at all (white header on a dark card, 2026-11-25).
    const queue = page.getByRole("heading", { level: 3, name: "Active Generation Queue" });
    await expect.poll(() => contrastOf(queue)).toBeGreaterThan(7);
    await expect.poll(() => contrastOf(page.getByRole("heading", { level: 3, name: "Recently Architected" }))).toBeGreaterThan(7);
    await expect.poll(() => contrastOf(page.getByRole("heading", { level: 2 }).first())).toBeGreaterThan(7);
    await shot(page, "dashboard-dark");
    await expectSpaMounted(page, crashes);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
