/**
 * Visuals page: the visual signature picker, builder, palette and preview
 * (specs/visual-signatures.md §7, §8; visual-signatures handoff §2, §3).
 *
 * The page runs with the real signature hooks, builder, palette field and
 * preview against a real query cache; `apiFetch` (the network edge) answers
 * the thin pass, the preview and the builder's draft. The preset list and
 * save mutations are stubbed at the settings barrel, as the page's other
 * suites do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  license: { plan: "byok", isPaidLicense: true } as Record<string, unknown>,
  presets: undefined as
    | { boundPresetId: string | null; presets: Array<Record<string, unknown>> }
    | undefined,
  create: vi.fn(),
  update: vi.fn(),
  fork: vi.fn(),
}));

vi.mock("@wordpress/api-fetch", () => ({ default: mocks.apiFetch }));

vi.mock("@/features/settings", () => ({
  useLicense: () => mocks.license,
  useDefaultProviders: () => ({
    defaultImageProvider: "gemini",
    defaultTextProvider: "gemini",
    isCloud: false,
  }),
  usePublicSiteProfile: () => ({
    data: {
      name: "Northfield Garden",
      publicUrl: "https://northfield.test",
      homeUrl: "https://northfield.test",
    },
  }),
  useVisualPresetMutations: () => ({
    create: mocks.create,
    update: mocks.update,
    fork: mocks.fork,
    remove: vi.fn(),
    bind: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isForking: false,
    isRemoving: false,
    isBinding: false,
  }),
  useVisualPresetsQuery: () => ({ data: mocks.presets, isLoading: false }),
  useVisualQuery: () => ({ data: undefined }),
}));

vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => "unknown",
}));

import { VisualsPage } from "../VisualsPage";

const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made, like your seasonal planting guides.",
  palette: ["#2F6B4F", "#C8553D", "#A3C585"],
};

let suggestAnswer: unknown = { suggestion: SUGGESTION, homepageRead: true };
let previewAnswer: Promise<unknown> = Promise.resolve({
  success: true,
  imageUrl: "https://cdn.test/preview.webp",
  concept: "A seed packet on a potting bench",
});
let usageAnswer: unknown = {
  success: true,
  plan: "byok",
  cycleUsage: { kind: "none", reason: "x" },
};

function routeApiFetch({ path }: { path: string }) {
  if (path === "/structura/v1/visual-signature/suggest") {
    return suggestAnswer instanceof Error
      ? Promise.reject(suggestAnswer)
      : Promise.resolve(suggestAnswer);
  }
  if (path === "/structura/v1/visual-signature/preview") return previewAnswer;
  if (path.startsWith("/structura/v1/analytics/usage")) return Promise.resolve(usageAnswer);
  return Promise.resolve({});
}

function preset(over: Record<string, unknown> = {}) {
  return {
    presetId: "p1",
    workspaceId: "w1",
    label: "Default",
    globalArtDirection: "My own words about the look",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    aiLabel: false,
    boundActivationCount: 1,
    createdBy: "u",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

function bindPreset(over: Record<string, unknown> = {}) {
  mocks.presets = { boundPresetId: "p1", presets: [preset(over)] };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <VisualsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const save = () => screen.getByRole("button", { name: /Save Changes/ });
const suggestCalls = () =>
  mocks.apiFetch.mock.calls.filter(
    ([arg]) => arg?.path === "/structura/v1/visual-signature/suggest"
  );
const lastUpdateContent = () =>
  (mocks.update.mock.calls.at(-1)?.[0] as { content: Record<string, unknown> }).content;

beforeEach(() => {
  mocks.apiFetch.mockReset().mockImplementation(routeApiFetch);
  mocks.license = { plan: "byok", isPaidLicense: true };
  mocks.create.mockReset().mockResolvedValue({});
  mocks.update.mockReset().mockResolvedValue({});
  mocks.fork.mockReset().mockResolvedValue({ preset: { presetId: "p-fork" } });
  suggestAnswer = { suggestion: SUGGESTION, homepageRead: true };
  previewAnswer = Promise.resolve({
    success: true,
    imageUrl: "https://cdn.test/preview.webp",
    concept: "A seed packet on a potting bench",
  });
  usageAnswer = { success: true, plan: "byok", cycleUsage: { kind: "none", reason: "x" } };
  bindPreset({ signature: { kind: "curated", id: "editorial-reportage", version: 1 } });
});

describe("Visuals page — picker", () => {
  it("drops the medium cards and the art-direction box; shows the library under Signature", async () => {
    renderPage();
    const group = screen.getByRole("radiogroup", { name: "Signature" });
    expect(within(group).getAllByRole("radio")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /^Illustration/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Global Art Direction/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Suggest Image Style/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Preset name" })).toHaveValue("Default");
    await waitFor(() => expect(suggestCalls()).toHaveLength(1));
  });

  it("picking a card checks it and shows Unsaved changes; In use stays on the saved one until Save", async () => {
    renderPage();
    expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    fireEvent.click(radio(/^Ink and fill/));

    expect(radio(/^Ink and fill/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Unsaved changes").closest('[role="status"]')).not.toBeNull();
    expect(radio(/^Editorial reportage/)).toHaveAccessibleDescription(/In use/);
    expect(radio(/^Ink and fill/)).not.toHaveAccessibleDescription(/In use/);

    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastUpdateContent().signature).toEqual({
      kind: "curated",
      id: "ink-and-fill",
      version: 1,
    });
    // The free text stays on the preset for a later switch back.
    expect(lastUpdateContent().global_art_direction).toBe("My own words about the look");
  });

  it("re-picking the saved card clears Unsaved changes", () => {
    renderPage();
    fireEvent.click(radio(/^Ink and fill/));
    fireEvent.click(radio(/^Editorial reportage/));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("marks the thin pass's pick in place with its reason, running the pass once", async () => {
    renderPage();
    await waitFor(() =>
      expect(radio(/^Paper cut/)).toHaveAccessibleDescription(/Our pick for your brand/)
    );
    expect(radio(/^Paper cut/)).toHaveAccessibleDescription(/Warm and hand-made/);
    // Fixed order on the page: the pick is not moved first, nor preselected
    // over the saved choice.
    expect(screen.getAllByRole("radio")[0]).toHaveAccessibleName(/^Editorial reportage/);
    expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radio(/^Ink and fill/));
    expect(suggestCalls()).toHaveLength(1);
  });

  it("shows the pick stored on the activation and runs no pass", async () => {
    mocks.presets = {
      ...mocks.presets!,
      visualSuggestion: { ...SUGGESTION, pick: "miniature-world", at: "2026-11-09T14:00:00.000Z" },
    } as typeof mocks.presets;
    renderPage();
    expect(radio(/^Miniature world/)).toHaveAccessibleDescription(/Our pick for your brand/);
    expect(radio(/^Miniature world/)).toHaveAccessibleDescription(/Warm and hand-made/);
    await act(async () => {
      await Promise.resolve();
    });
    expect(suggestCalls()).toHaveLength(0);
  });

  it("Re-scan still runs the pass when a pick is stored", async () => {
    bindPreset({
      signature: { kind: "curated", id: "editorial-reportage", version: 1 },
      palette: ["#111111"],
    });
    mocks.presets = {
      ...mocks.presets!,
      visualSuggestion: { ...SUGGESTION, palette: ["#000000"], at: "2026-11-09T14:00:00.000Z" },
    } as typeof mocks.presets;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan site/ }));
    await waitFor(() => expect(screen.getByText("#C8553D")).toBeInTheDocument());
    expect(suggestCalls()).toHaveLength(1);
  });

  it("a gated save puts the picker back on the saved choice (spec §7)", async () => {
    mocks.update.mockRejectedValue({
      code: "cloud_error",
      message: "x",
      data: { status: 403, code: "plan_gated" },
    });
    renderPage();
    fireEvent.click(radio(/^Miniature world/));
    fireEvent.click(save());
    await waitFor(() =>
      expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true")
    );
    expect(radio(/^Miniature world/)).toHaveAttribute("aria-checked", "false");
  });

  it("free plan: the library and Your own lock with Upgrade plan links, the house card stays open", () => {
    mocks.license = { plan: "free", isPaidLicense: false };
    renderPage();
    expect(radio(/^Editorial reportage/)).toBeEnabled();
    expect(radio(/^Paper cut/)).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Your own/ })).toBeDisabled();
    const links = screen.getAllByRole("link", { name: /Upgrade plan/ });
    // Five library cards, Your own, and the preview.
    expect(links).toHaveLength(7);
    for (const link of links) expect(link.getAttribute("href")).toContain("intent=unlock_visuals");
    expect(screen.getByRole("button", { name: /Preview with my colors/ })).toBeDisabled();
  });

  it("free plan with a library style saved before a downgrade keeps it selectable and saves it unchanged", async () => {
    mocks.license = { plan: "free", isPaidLicense: false };
    bindPreset({ signature: { kind: "curated", id: "paper-cut", version: 1 } });
    renderPage();
    expect(radio(/^Paper cut/)).toBeEnabled();
    expect(radio(/^Paper cut/)).toHaveAccessibleDescription(/Kept from your previous plan/);

    fireEvent.change(screen.getByRole("textbox", { name: "Preset name" }), {
      target: { value: "Renamed" },
    });
    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastUpdateContent().signature).toEqual({ kind: "curated", id: "paper-cut", version: 1 });
  });
});

describe("Visuals page — free prompt", () => {
  it("a preset without a signature is the free prompt: in use, textarea under the grid", () => {
    bindPreset({ signature: undefined });
    renderPage();
    const free = screen.getByRole("button", { name: /^Free prompt/ });
    expect(free).toHaveAttribute("aria-pressed", "true");
    expect(free).toHaveAccessibleDescription(/In use/);
    expect(screen.getByRole("textbox", { name: "Your prompt" })).toHaveValue(
      "My own words about the look"
    );
    // The free prompt has no Suggest button (handoff decision 7).
    expect(screen.queryByRole("button", { name: /Suggest/ })).toBeNull();
  });

  it("the textarea shows only while Free prompt is picked, and takes focus when it opens", async () => {
    renderPage();
    expect(screen.queryByRole("textbox", { name: "Your prompt" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Free prompt/ }));
    const prompt = screen.getByRole("textbox", { name: "Your prompt" });
    await waitFor(() => expect(prompt).toHaveFocus());
    fireEvent.click(radio(/^Paper cut/));
    expect(screen.queryByRole("textbox", { name: "Your prompt" })).toBeNull();
  });

  it("switching to the free prompt saves the text and clears the signature", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Free prompt/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your prompt" }), {
      target: { value: "Ink washes" },
    });
    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastUpdateContent()).toMatchObject({
      global_art_direction: "Ink washes",
      signature: null,
    });
  });
});

describe("Visuals page — Your own", () => {
  const openBuilder = async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Your own/ }));
    const heading = await screen.findByRole("heading", { name: "Your own signature" });
    return heading;
  };

  it("opens the builder in place of the grid, named after the site, with focus on its heading", async () => {
    renderPage();
    const heading = await openBuilder();
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole("radiogroup", { name: "Signature" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Northfield Garden");
    // Palette and Preview stay below the builder.
    expect(screen.getByRole("heading", { name: "Brand palette" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
  });

  it("Save with an empty Name shows its error, focuses it, and sends nothing", async () => {
    renderPage();
    await openBuilder();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  " } });
    fireEvent.click(save());
    expect(await screen.findByText("Name this signature to save it.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("Save with an empty field flags it and sends nothing, since the cloud refuses empty fields", async () => {
    renderPage();
    await openBuilder();
    fireEvent.click(save());
    expect(await screen.findAllByText("Fill this in to save the signature.")).toHaveLength(4);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Technique" })).toHaveFocus());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("All signatures keeps the draft: the Your own card shows its name, checked, with Unsaved changes", async () => {
    renderPage();
    await openBuilder();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Northfield sketchbook" },
    });
    fireEvent.click(screen.getByRole("button", { name: /All signatures/ }));

    const card = radio(/^Northfield sketchbook/);
    expect(card).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(card).toHaveFocus());
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue(
      "Northfield sketchbook"
    );
  });

  it("saves a complete custom signature with its medium", async () => {
    renderPage();
    await openBuilder();
    fireEvent.click(screen.getByRole("radio", { name: "Illustration" }));
    for (const [label, value] of [
      ["Technique", "Black ink linework"],
      ["Motifs", "Plants and leaves"],
      ["Composition", "One hero object, centred"],
      ["Avoid", "Text and lettering"],
    ]) {
      fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value } });
    }
    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastUpdateContent().signature).toEqual({
      kind: "custom",
      name: "Northfield Garden",
      medium: "illustration",
      technique: "Black ink linework",
      motifs: "Plants and leaves",
      composition: "One hero object, centred",
      avoid: "Text and lettering",
    });
  });

  it("a saved custom signature loads as the Your own card, in use", () => {
    bindPreset({
      signature: {
        kind: "custom",
        name: "Sketchbook",
        medium: "3d_render",
        technique: "t",
        motifs: "m",
        composition: "c",
        avoid: "a",
      },
    });
    renderPage();
    const card = radio(/^Sketchbook Your own style, in 3D render\./);
    expect(card).toHaveAttribute("aria-checked", "true");
    expect(card).toHaveAccessibleDescription(/In use/);
  });
});

describe("Visuals page — palette", () => {
  it("Re-scan replaces the palette, which the next save sends", async () => {
    bindPreset({
      signature: { kind: "curated", id: "editorial-reportage", version: 1 },
      palette: ["#111111"],
    });
    renderPage();
    await waitFor(() => expect(suggestCalls()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Re-scan site/ }));
    await waitFor(() => expect(screen.getByText("#C8553D")).toBeInTheDocument());
    expect(suggestCalls()).toHaveLength(2);

    fireEvent.click(save());
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastUpdateContent().palette).toEqual(SUGGESTION.palette);
  });

  it("an empty palette offers Scan my site; a scan without colours says so", async () => {
    suggestAnswer = { suggestion: null, homepageRead: false, reason: "ai_unavailable" };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Scan my site/ }));
    expect(
      await screen.findByText("Couldn’t read your site’s colors right now. Try again in a moment.")
    ).toBeInTheDocument();
  });
});

describe("Visuals page — unbound site", () => {
  it("paid: preselects the pick in the scraped palette, and Save creates and binds it", async () => {
    mocks.presets = { boundPresetId: null, presets: [] };
    renderPage();
    await waitFor(() => expect(radio(/^Paper cut/)).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("#2F6B4F")).toBeInTheDocument();
    // Nothing is in use yet.
    expect(screen.queryByText("In use")).toBeNull();

    fireEvent.click(save());
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    const args = mocks.create.mock.calls[0][0] as {
      content: Record<string, unknown>;
      bind_to_activation: boolean;
    };
    expect(args.bind_to_activation).toBe(true);
    expect(args.content.signature).toEqual({ kind: "curated", id: "paper-cut", version: 1 });
    expect(args.content.palette).toEqual(SUGGESTION.palette);
  });

  it("free: keeps the house signature, the pick shown locked", async () => {
    mocks.license = { plan: "free", isPaidLicense: false };
    mocks.presets = { boundPresetId: null, presets: [] };
    renderPage();
    await waitFor(() =>
      expect(radio(/^Paper cut/)).toHaveAccessibleDescription(/Our pick for your brand/)
    );
    expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Paper cut/)).toBeDisabled();

    fireEvent.click(save());
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(
      (mocks.create.mock.calls[0][0] as { content: Record<string, unknown> }).content.signature
    ).toEqual({
      kind: "curated",
      id: "editorial-reportage",
      version: 1,
    });
  });
});

describe("Visuals page — preview", () => {
  const previewCalls = () =>
    mocks.apiFetch.mock.calls.filter(
      ([arg]) => arg?.path === "/structura/v1/visual-signature/preview"
    );

  it("renders the unsaved pick in the palette", async () => {
    bindPreset({
      signature: { kind: "curated", id: "editorial-reportage", version: 1 },
      palette: ["#2F6B4F"],
    });
    renderPage();
    fireEvent.click(radio(/^Isometric glass/));
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    expect(
      await screen.findByRole("img", { name: "A seed packet on a potting bench" })
    ).toBeInTheDocument();
    expect(previewCalls()[0][0].data).toEqual({
      signature: { kind: "curated", id: "isometric-glass", version: 1 },
      palette: ["#2F6B4F"],
    });
  });

  it("previews the free prompt with its medium", async () => {
    bindPreset({ signature: undefined, medium: "illustration" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0][0].data).toEqual({
      signature: null,
      global_art_direction: "My own words about the look",
      medium: "illustration",
      palette: [],
    });
  });

  it("an incomplete custom draft opens the builder with its errors instead of rendering", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Your own/ }));
    await screen.findByRole("heading", { name: "Your own signature" });
    fireEvent.click(screen.getByRole("button", { name: /Preview with my colors/ }));
    expect(await screen.findAllByText("Fill this in to save the signature.")).toHaveLength(4);
    expect(previewCalls()).toHaveLength(0);
  });

  it("is disabled with the reset date once a managed plan's images are used up", async () => {
    mocks.license = { plan: "cloud", isPaidLicense: true, hasUsableLicense: true };
    usageAnswer = {
      success: true,
      plan: "cloud",
      cycleUsage: {
        kind: "managed",
        cycleMonth: "2026-11",
        cycleResetsAt: Date.UTC(2026, 11, 1),
        daysLeftInCycle: 22,
        workspace: {
          tokensUsed: 0,
          tokensIncluded: 0,
          imagesUsed: 90,
          imagesIncluded: 90,
          utilizationPercent: 100,
        },
        activations: [],
      },
    };
    renderPage();
    expect(
      await screen.findByText(/No images left this month\. Your allowance resets on/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preview with my colors/ })).toBeDisabled();
  });
});

describe("Visuals page — other presets", () => {
  // 2026-11-09: the class read `mt-1!line-clamp-2`, one unknown token, so
  // long art directions were never clamped.
  it("clamps a library preset's art direction to two lines", () => {
    mocks.presets = {
      boundPresetId: "p1",
      presets: [
        preset(),
        preset({ presetId: "p2", label: "Other", globalArtDirection: "Second preset words" }),
      ],
    };
    renderPage();
    const line = screen.getByText("Second preset words");
    expect(line.className.split(/\s+/)).toContain("line-clamp-2");
  });

  it("names a library preset's signature instead of its unused free text", () => {
    mocks.presets = {
      boundPresetId: "p1",
      presets: [
        preset(),
        preset({
          presetId: "p2",
          label: "Other",
          globalArtDirection: "",
          signature: { kind: "curated", id: "miniature-world", version: 1 },
        }),
      ],
    };
    renderPage();
    const item = screen.getByText("Other").closest("li")!;
    expect(within(item).getByText("Miniature world")).toBeInTheDocument();
    expect(within(item).queryByText("(no art direction)")).toBeNull();
  });
});

describe("Visuals page — act hygiene", () => {
  it("settles without stray updates", async () => {
    renderPage();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("radiogroup", { name: "Signature" })).toBeInTheDocument();
  });
});
