/**
 * Visuals page: one column, the brand palette above an Images | Video tab
 * strip (owner-approved reorganisation, 2026-11-21). Both panels stay
 * mounted, so one Save sends the edits of both and a switch resets nothing;
 * the tab lives in `?section=`, the param the Video channel's "Edit in
 * Visuals" link already sends; a Save refused for a field on the Images tab
 * while Video shows brings Images forward with focus on that field.
 *
 * The page, its sections and the real save mutations run on a real query
 * cache; `apiFetch` (the network edge) answers the thin pass, the usage read,
 * the preview and the preset writes, whose bodies the save tests assert. The
 * preset list, the license and the Video channel's catalog gate are stubbed
 * as the page's other suites stub them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router";

type Request = { path: string; method?: string; data?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  license: { plan: "cloud", isPaidLicense: true } as Record<string, unknown>,
  presets: undefined as Record<string, unknown> | undefined,
  eligibility: "eligible" as "eligible" | "locked" | "unknown",
}));

vi.mock("@wordpress/api-fetch", () => ({ default: mocks.apiFetch }));

vi.mock("@/features/settings", async () => {
  const presets = await vi.importActual<typeof import("@/features/settings/api/useVisualPresets")>(
    "@/features/settings/api/useVisualPresets"
  );
  return {
    useLicense: () => mocks.license,
    // `isCloud` keeps the suggest panel's provider pill out of the tree.
    useDefaultProviders: () => ({
      defaultImageProvider: "gemini",
      defaultTextProvider: "gemini",
      isCloud: true,
      isProviderIncomplete: () => false,
    }),
    usePublicSiteProfile: () => ({
      data: {
        name: "Northfield Garden",
        publicUrl: "https://northfield.test",
        homeUrl: "https://northfield.test",
      },
    }),
    // The real save mutations: what they send is asserted at `apiFetch`.
    useVisualPresetMutations: presets.useVisualPresetMutations,
    useVisualPresetsQuery: () => ({ data: mocks.presets, isLoading: false }),
    useVisualQuery: () => ({ data: undefined }),
  };
});

vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => mocks.eligibility,
}));

import { VisualsPage } from "../VisualsPage";

const PALETTE = ["#2F6B4F", "#C8553D", "#A3C585"];
const HOUSE = { kind: "curated", id: "editorial-reportage", version: 1 };
const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made, like your seasonal planting guides.",
  palette: PALETTE,
};

function preset(over: Record<string, unknown> = {}) {
  return {
    presetId: "p1",
    workspaceId: "w1",
    label: "Northfield default",
    globalArtDirection: "Soft daylight photographs of real gardens.",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    aiLabel: false,
    signature: HOUSE,
    palette: PALETTE,
    videoStyle: "kinetic",
    videoArtDirection: "FOOTAGE: real gardens",
    captionPlacement: "middle",
    boundActivationCount: 1,
    createdBy: "u",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

/** What a save of the untouched preset above sends, field for field. */
const UNTOUCHED_CONTENT = {
  global_art_direction: "Soft daylight photographs of real gardens.",
  aspect_ratio: "16:9",
  format: "webp",
  optimize_on_upload: true,
  medium: "photography",
  ai_label: false,
  video_style: "kinetic",
  video_art_direction: "FOOTAGE: real gardens",
  caption_placement: "middle",
  palette: PALETTE,
  signature: HOUSE,
};

function routeApiFetch(request: Request) {
  const { path, method } = request;
  if (path === "/structura/v1/visual-signature/suggest") {
    return Promise.resolve({ suggestion: SUGGESTION, homepageRead: true });
  }
  if (path === "/structura/v1/visual-signature/preview") {
    return Promise.resolve({
      success: true,
      imageUrl: "https://cdn.test/preview.webp",
      concept: "A seed packet on a potting bench",
    });
  }
  if (path.startsWith("/structura/v1/analytics/usage")) {
    return Promise.resolve({
      success: true,
      plan: "cloud",
      cycleUsage: { kind: "none", reason: "x" },
    });
  }
  if (path === "/structura/v1/visual-presets/p1/fork") {
    return Promise.resolve({
      success: true,
      preset: preset({ presetId: "p-fork" }),
      boundPresetId: "p-fork",
    });
  }
  if (path === "/structura/v1/visual-presets/bind") {
    return Promise.resolve({ success: true, boundPresetId: "p2" });
  }
  if (path.startsWith("/structura/v1/visual-presets/") && method === "POST") {
    return Promise.resolve({ success: true, preset: preset() });
  }
  return Promise.resolve({});
}

/** The preset writes the page sent, as `METHOD path` with their bodies. */
const writes = () =>
  mocks.apiFetch.mock.calls
    .map(([request]) => request as Request)
    .filter(
      (request) =>
        request.method === "POST" && request.path.startsWith("/structura/v1/visual-presets")
    );
const saves = () =>
  writes().filter((request) => request.path === "/structura/v1/visual-presets/p1");

/** Shows where the router is, so a test can read the URL the page wrote. */
function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <span data-testid="location">{location.pathname + location.search}</span>
      <span data-testid="navigation-type">{navigationType}</span>
    </>
  );
}

/** The header's Visuals link: a navigation to `/visuals` while the page stays open. */
function HeaderVisualsLink() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/visuals")}>
      Header Visuals link
    </button>
  );
}

function renderPage(entry = "/visuals") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <VisualsPage />
          <LocationProbe />
          <HeaderVisualsLink />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const tab = (name: "Images" | "Video") => screen.getByRole("tab", { name });
/**
 * A tab's panel, shown or hidden, through the tab's `aria-controls` (a
 * hidden element has no accessible name to find it by).
 */
const panel = (name: "Images" | "Video") => {
  const element = document.getElementById(tab(name).getAttribute("aria-controls") ?? "");
  if (!element) throw new Error(`The ${name} tab controls no panel.`);
  return element;
};
const openTab = (name: "Images" | "Video") => fireEvent.click(tab(name));
const save = () => screen.getByRole("button", { name: /Save Changes/ });
const location = () => screen.getByTestId("location").textContent;
const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;

/**
 * A browser never focuses an element that is not rendered, such as one in
 * the hidden tab panel; jsdom does. This puts the browser's rule back, so a
 * focus move that runs before its tab shows fails here as it would there.
 */
function focusLikeABrowser() {
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions
  ) {
    if (this.closest("[hidden]")) return;
    focus.call(this, options);
  });
}

beforeEach(() => {
  mocks.apiFetch.mockReset().mockImplementation(routeApiFetch);
  mocks.license = { plan: "cloud", isPaidLicense: true };
  mocks.eligibility = "eligible";
  mocks.presets = { boundPresetId: "p1", presets: [preset()] };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Visuals page — Images and Video tabs", () => {
  it("opens on Images; the Video panel is mounted but hidden", () => {
    renderPage();
    const strip = screen.getByRole("tablist", { name: "Visuals" });
    expect(
      within(strip)
        .getAllByRole("tab")
        .map((t) => t.textContent)
    ).toEqual(["Images", "Video"]);
    expect(tab("Images")).toHaveAttribute("aria-selected", "true");
    expect(tab("Video")).toHaveAttribute("aria-selected", "false");
    // Only the selected tab is in the tab order.
    expect(tab("Images")).toHaveAttribute("tabindex", "0");
    expect(tab("Video")).toHaveAttribute("tabindex", "-1");

    const images = screen.getByRole("tabpanel", { name: "Images" });
    expect(tab("Images")).toHaveAttribute("aria-controls", images.id);
    expect(within(images).getByRole("radiogroup", { name: "Signature" })).toBeVisible();

    const video = panel("Video");
    expect(tab("Video")).toHaveAttribute("aria-controls", video.id);
    expect(video).not.toBeVisible();
    expect(
      within(video).getByRole("radiogroup", { name: /Video style preset/, hidden: true })
    ).toBeInTheDocument();
  });

  it("Video shows the whole video block; Images brings the image settings back", () => {
    renderPage();
    openTab("Video");
    expect(tab("Video")).toHaveAttribute("aria-selected", "true");
    const video = screen.getByRole("tabpanel", { name: "Video" });
    expect(within(video).getByRole("heading", { name: "Video" })).toBeVisible();
    expect(within(video).getByRole("radiogroup", { name: /Video style preset/ })).toBeVisible();
    expect(within(video).getByRole("radio", { name: /kinetic/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(within(video).getByRole("textbox", { name: /Video art direction/i })).toHaveValue(
      "FOOTAGE: real gardens"
    );
    expect(within(video).getByRole("radiogroup", { name: /Caption placement/ })).toBeVisible();
    expect(within(video).getByRole("button", { name: /Suggest Video Style/ })).toBeVisible();
    expect(screen.queryByRole("radiogroup", { name: "Signature" })).toBeNull();
    expect(panel("Images")).not.toBeVisible();

    openTab("Images");
    expect(screen.getByRole("radiogroup", { name: "Signature" })).toBeVisible();
    expect(panel("Video")).not.toBeVisible();
  });

  it("the arrow keys, Home and End switch the tab from the keyboard", () => {
    renderPage();
    const strip = screen.getByRole("tablist", { name: "Visuals" });
    tab("Images").focus();
    fireEvent.keyDown(tab("Images"), { key: "ArrowRight" });
    expect(tab("Video")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Video" })).toBeVisible();
    fireEvent.keyDown(strip, { key: "Home" });
    expect(tab("Images")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(strip, { key: "End" });
    expect(tab("Video")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(strip, { key: "ArrowLeft" });
    expect(screen.getByRole("tabpanel", { name: "Images" })).toBeVisible();
  });

  it("one Save sends the edits made on both tabs", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /^Ink and fill/ }));
    openTab("Video");
    fireEvent.click(screen.getByRole("radio", { name: /^Top/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Video art direction/i }), {
      target: { value: "Slow pans over raised beds" },
    });
    fireEvent.click(save());

    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]!.data).toEqual({
      label: "Northfield default",
      content: {
        ...UNTOUCHED_CONTENT,
        signature: { kind: "curated", id: "ink-and-fill", version: 1 },
        caption_placement: "top",
        video_art_direction: "Slow pans over raised beds",
      },
    });
    // A save that passes leaves the tab where it was.
    expect(tab("Video")).toHaveAttribute("aria-selected", "true");
  });

  it("Unsaved changes covers both tabs and survives a switch; a switch alone changes nothing", () => {
    renderPage();
    const unsaved = () => screen.queryByText("Unsaved changes");
    openTab("Video");
    openTab("Images");
    expect(unsaved()).toBeNull();

    // A Video edit alone marks the page, seen from the Images tab.
    openTab("Video");
    fireEvent.click(screen.getByRole("radio", { name: /^Top/ }));
    openTab("Images");
    expect(unsaved()).toBeInTheDocument();

    // Undoing an Images edit leaves the Video one counted.
    fireEvent.click(screen.getByRole("radio", { name: /^Ink and fill/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Editorial reportage/ }));
    expect(unsaved()).toBeInTheDocument();

    openTab("Video");
    fireEvent.click(screen.getByRole("radio", { name: /^Middle/ }));
    expect(unsaved()).toBeNull();
  });

  it("a switch keeps the builder's draft and the last preview", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    expect(
      await screen.findByRole("img", { name: "A seed packet on a potting bench" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Your own/ }));
    await screen.findByRole("heading", { name: "Your own signature" });
    fireEvent.change(screen.getByRole("textbox", { name: "Technique" }), {
      target: { value: "Pencil hatching" },
    });

    openTab("Video");
    openTab("Images");

    expect(screen.getByRole("heading", { name: "Your own signature" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Technique" })).toHaveValue("Pencil hatching");
    expect(screen.getByRole("img", { name: "A seed packet on a potting bench" })).toBeVisible();
  });

  it("the brand palette sits above the tabs with Re-scan, and shows on both", () => {
    renderPage();
    const palette = screen.getByRole("region", { name: "Brand palette" });
    const strip = screen.getByRole("tablist", { name: "Visuals" });
    expect(palette.compareDocumentPosition(strip) & FOLLOWING).toBeTruthy();
    for (const name of ["Images", "Video"] as const) {
      openTab(name);
      expect(palette).toBeVisible();
      expect(within(palette).getByRole("button", { name: /Re-scan site/ })).toBeVisible();
      expect(panel(name)).not.toContainElement(palette);
    }
  });

  it("Switch preset stays on the preset card above the tabs and works from the Video tab", async () => {
    mocks.presets = {
      boundPresetId: "p1",
      presets: [
        preset(),
        preset({
          presetId: "p2",
          label: "Uniconfoto",
          boundActivationCount: 0,
          updatedAt: "2026-11-18T09:00:00.000Z",
        }),
      ],
    };
    renderPage();
    expect(
      screen
        .getByRole("button", { name: "Switch preset" })
        .compareDocumentPosition(screen.getByRole("tablist", { name: "Visuals" })) & FOLLOWING
    ).toBeTruthy();

    openTab("Video");
    fireEvent.click(screen.getByRole("button", { name: "Switch preset" }));
    const dialog = screen.getByRole("dialog", { name: "Switch preset" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Use here" }));
    await waitFor(() =>
      expect(writes()).toContainEqual(
        expect.objectContaining({
          path: "/structura/v1/visual-presets/bind",
          data: { preset_id: "p2" },
        })
      )
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Visuals page — Output, the last section of the Images tab", () => {
  const output = () => screen.getByRole("region", { name: "Output" });

  it("follows Preview inside the Images panel, with the always-on SEO note as one line", () => {
    renderPage();
    expect(screen.getByRole("tabpanel", { name: "Images" })).toContainElement(output());
    expect(
      screen.getByRole("region", { name: "Preview" }).compareDocumentPosition(output()) & FOLLOWING
    ).toBeTruthy();
    expect(output()).toHaveTextContent(
      "Every image gets alt text and an SEO-friendly filename automatically."
    );
    // The informational card and its badge are gone.
    expect(screen.queryByText("SEO Automation")).toBeNull();
    expect(screen.queryByText("Always on")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dimensions" })).toBeNull();
    // The section heading says Output, so the labels drop the prefix (2026-11-21).
    expect(within(output()).getByText("Dimensions", { exact: true })).toBeVisible();
    expect(within(output()).getByText("Format", { exact: true })).toBeVisible();
    expect(within(output()).queryByText(/Output Dimensions|Format Encoding/)).toBeNull();
    expect(within(output()).getByRole("button", { name: /^Dimensions/ })).toBeVisible();
    expect(within(output()).getByRole("button", { name: /^Format/ })).toBeVisible();
    expect(
      within(output()).getByRole("switch", { name: "Label images as AI-generated" })
    ).toBeVisible();
  });

  it("dimensions, format and the AI label save the same fields as before", async () => {
    renderPage();
    fireEvent.click(within(output()).getByRole("button", { name: /^Dimensions/ }));
    fireEvent.click(screen.getByRole("option", { name: "1:1 Square Format" }));
    fireEvent.click(within(output()).getByRole("button", { name: /^Format/ }));
    fireEvent.click(screen.getByRole("option", { name: "PNG (Lossless)" }));
    fireEvent.click(within(output()).getByRole("switch", { name: "Label images as AI-generated" }));
    fireEvent.click(save());

    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]!.data).toEqual({
      label: "Northfield default",
      content: { ...UNTOUCHED_CONTENT, aspect_ratio: "1:1", format: "png", ai_label: true },
    });
  });

  it("free plan: Format stays disabled behind Pro; dimensions and the AI label stay open", () => {
    mocks.license = { plan: "free", isPaidLicense: false };
    mocks.eligibility = "locked";
    renderPage();
    const format = within(output()).getByRole("button", { name: /^Format/ });
    expect(format).toBeDisabled();
    expect(within(output()).getByText("Pro")).toBeVisible();
    expect(within(output()).getByRole("button", { name: /^Dimensions/ })).toBeEnabled();
    expect(
      within(output()).getByRole("switch", { name: "Label images as AI-generated" })
    ).toBeEnabled();
  });
});

describe("Visuals page — the Video tab's plan gate", () => {
  it("a plan without video gets the upgrade teaser inside the Video tab, and none of the fields", () => {
    mocks.eligibility = "locked";
    renderPage();
    expect(within(panel("Video")).getByText("Video styling")).not.toBeVisible();

    openTab("Video");
    const video = screen.getByRole("tabpanel", { name: "Video" });
    expect(within(video).getByText("Video styling")).toBeVisible();
    expect(within(video).getByRole("link", { name: /Upgrade plan/ })).toHaveAttribute(
      "href",
      expect.stringContaining("intent=unlock_video")
    );
    expect(
      screen.queryByRole("radiogroup", { name: /Video style preset/, hidden: true })
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /Video art direction/i, hidden: true })
    ).toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: /Caption placement/, hidden: true })
    ).toBeNull();
  });

  it("while the gate is unknown there is no tab strip, only the image settings", () => {
    mocks.eligibility = "unknown";
    renderPage();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tabpanel", { hidden: true })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Signature" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Output" })).toBeVisible();
    expect(screen.queryByText("Video styling")).toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: /Video style preset/, hidden: true })
    ).toBeNull();
  });
});

describe("Visuals page — the tab in the URL", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    // jsdom has no layout, so no scrollIntoView.
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("Video writes ?section=video without a history entry; Images clears it", () => {
    renderPage();
    expect(location()).toBe("/visuals");
    openTab("Video");
    expect(location()).toBe("/visuals?section=video");
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
    openTab("Images");
    expect(location()).toBe("/visuals");
  });

  it("lands on Video from ?section=video, the Video channel's Edit in Visuals link, with the tabs scrolled into view and the panel ringed", async () => {
    renderPage("/visuals?section=video");
    expect(tab("Video")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Video" })).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(scrollIntoView.mock.contexts[0]).toContainElement(
      screen.getByRole("tablist", { name: "Visuals" })
    );
    await waitFor(() =>
      expect(screen.getByRole("tabpanel", { name: "Video" })).toHaveClass("ring-2")
    );
  });

  it("a tab click neither scrolls nor rings the panel", async () => {
    renderPage();
    openTab("Video");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole("tabpanel", { name: "Video" })).not.toHaveClass("ring-2");
  });

  it("the header's Visuals link brings Images back while the page stays open", () => {
    renderPage("/visuals?section=video");
    fireEvent.change(screen.getByRole("textbox", { name: /Video art direction/i }), {
      target: { value: "Kept" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Header Visuals link" }));
    expect(tab("Images")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Images" })).toBeVisible();
    // The page was not reloaded: the edit is still there.
    openTab("Video");
    expect(screen.getByRole("textbox", { name: /Video art direction/i })).toHaveValue("Kept");
  });
});

describe("Visuals page — a Save refused on the Images tab while Video shows", () => {
  beforeEach(() => focusLikeABrowser());

  it("brings Images forward with the builder's errors and focus on the first empty field", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Your own/ }));
    await screen.findByRole("heading", { name: "Your own signature" });
    openTab("Video");

    fireEvent.click(save());

    expect(tab("Images")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Images" })).toBeVisible();
    expect(location()).toBe("/visuals");
    expect(await screen.findAllByText("Fill this in to save the signature.")).toHaveLength(4);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Technique" })).toHaveFocus());
    expect(saves()).toHaveLength(0);
  });

  it("Save as new for this site only is refused the same way", async () => {
    mocks.presets = { boundPresetId: "p1", presets: [preset({ boundActivationCount: 3 })] };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Your own/ }));
    await screen.findByRole("heading", { name: "Your own signature" });
    openTab("Video");

    fireEvent.click(screen.getByRole("button", { name: /Save as new for this site only/ }));

    expect(tab("Images")).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Technique" })).toHaveFocus());
    expect(writes()).toHaveLength(0);
  });
});
