/**
 * VisualsPage unlicensed-state test — Phase 1.8a.
 *
 * Pre-1.8a, when a `none`-tier user opened the Visuals page, the
 * cloud-gated `useVisualPresetsQuery` was disabled (correctly) but
 * the page's `if (isLoadingPresets || !draft) return <PageLoader/>`
 * guard never lifted: with the query disabled, `presetsData` stayed
 * undefined, the draft-init `useEffect` early-returned on
 * `!presetsData`, and `draft` stayed null forever. Result: a stuck
 * "Calibrating Optics…" spinner.
 *
 * The fix is a dedicated `!isLicensed` branch that renders an inline
 * `UnlicensedTeaser` *before* the loader guard runs. This test pins
 * the behavior so a future refactor can't silently revert to the
 * stuck-spinner state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const { licenseMock, presetsQueryMock, updateMock, createMock, forkMock, suggestMock, cloudMock } = vi.hoisted(() => ({
  cloudMock: { isCloud: true },
  licenseMock: vi.fn(() => ({ plan: "none", isPaidLicense: false })),
  presetsQueryMock: vi.fn(() => ({ data: undefined as unknown, isLoading: false })),
  updateMock: vi.fn(),
  createMock: vi.fn(),
  forkMock: vi.fn(),
  suggestMock: vi.fn(),
}));

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) =>
    text.replace(/%s|%d/g, () => String(args.shift() ?? "")),
}));

vi.mock("@/features/settings", () => ({
  // `isCloud` keeps SuggestStrategySection's ProviderPill out of the tree.
  useDefaultProviders: () => ({
    defaultImageProvider: "openai",
    defaultTextProvider: "openai",
    isCloud: cloudMock.isCloud,
    isProviderIncomplete: () => false,
  }),
  // Phase 1.8: VisualsPage's permanent unlicensed teaser fires on
  // `plan === "none"` (post-PR7b) — covers anonymous shadow
  // workspaces, pre-bootstrap installs, and the legacy
  // disconnected case. The 1.8a `!isLicensed` gate was a strict
  // superset; this is the narrower discriminator.
  useLicense: licenseMock,
  useVisualPresetMutations: () => ({
    create: createMock,
    update: updateMock,
    fork: forkMock,
    remove: vi.fn(),
    bind: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isForking: false,
    isRemoving: false,
    isBinding: false,
  }),
  // The two queries below should never render their result on the
  // unlicensed branch — gating is enforced inside the hooks
  // themselves. Returning empty stubs is enough for the page to
  // type-check at render time.
  useVisualPresetsQuery: presetsQueryMock,
  useVisualQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: suggestMock, isSuggesting: false }),
}));

// Video-styling gate (video-visuals handoff §1) — the real hook reads the
// channel catalog query, which needs a QueryClient this harness doesn't
// mount. "unknown" = render neither section nor teaser, the correct state
// for an unlicensed install anyway.
vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => "unknown",
}));

vi.mock("@/components/Layout/PageTitle", () => ({
  PageTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}));

vi.mock("@/components/Layout/PageSubtitle", () => ({
  PageDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("@structura/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@structura/ui")>("@structura/ui");
  return {
    ...actual,
    PageLoader: ({ label }: { label: string }) => (
      <div data-testid="page-loader">{label}</div>
    ),
  };
});

import { VisualsPage } from "../VisualsPage";

describe("VisualsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    licenseMock.mockReturnValue({ plan: "none", isPaidLicense: false });
    presetsQueryMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("renders the unlicensed teaser when plan === 'none'", () => {
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>,
    );

    // Headline copy from the inline `UnlicensedTeaser` component.
    expect(
      screen.getByText("Style Every Image Consistently"),
    ).toBeInTheDocument();

    // CTA buttons live inside the teaser and link out to the customer
    // portal + pricing page.
    expect(screen.getByText("Get Free License")).toBeInTheDocument();
    expect(screen.getByText("View Pricing")).toBeInTheDocument();
  });

  it("does NOT render the calibrating-optics loader on the none-tier branch", () => {
    // Pre-1.8a regression: the page rendered the loader forever on
    // `none`-tier installs because the gated `useVisualPresetsQuery`
    // never resolved and `draft` never initialized. The unlicensed
    // teaser branch must short-circuit *before* the loader.
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("page-loader")).not.toBeInTheDocument();
    expect(screen.queryByText("Calibrating Optics…")).not.toBeInTheDocument();
  });
});

/**
 * Image medium cards (restored 2026-10-05). The image prompt reads the
 * preset's medium on every generated image, so the medium is a saved
 * setting again: a card picker on every plan, persisted with the preset,
 * and the medium "Suggest Image Style" drafts in. It used to be settable
 * only from the Suggest dropdown, so Free could not change it at all.
 */
describe("VisualsPage image medium cards", () => {
  const boundPreset = {
    presetId: "preset-bound",
    label: "Bound Preset",
    globalArtDirection: "STYLE: my own words",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "illustration",
    boundActivationCount: 1,
  };
  const presetsData = () => ({ presets: [{ ...boundPreset }], boundPresetId: "preset-bound" });
  const card = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });
  const renderPage = () =>
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    licenseMock.mockReturnValue({ plan: "byok", isPaidLicense: true });
    presetsQueryMock.mockReturnValue({ data: presetsData(), isLoading: false });
    updateMock.mockResolvedValue({});
    suggestMock.mockResolvedValue({ prompt: "STYLE: drafted" });
  });

  it("renders three cards with the bound preset's medium pressed", () => {
    renderPage();

    expect(card("Photography")).toHaveAttribute("aria-pressed", "false");
    expect(card("Illustration")).toHaveAttribute("aria-pressed", "true");
    expect(card("3D render")).toHaveAttribute("aria-pressed", "false");
  });

  it("picking a card marks the draft dirty without suggesting, and Save persists it", async () => {
    const view = renderPage();

    fireEvent.click(card("3D render"));

    expect(card("3D render")).toHaveAttribute("aria-pressed", "true");
    expect(card("Illustration")).toHaveAttribute("aria-pressed", "false");
    expect(suggestMock).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("STYLE: my own words")).toBeInTheDocument();

    // Dirty: a background refetch (fresh object) must not reset the pick.
    presetsQueryMock.mockReturnValue({ data: presetsData(), isLoading: false });
    view.rerender(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>
    );
    expect(card("3D render")).toHaveAttribute("aria-pressed", "true");

    const save = screen.getByRole("button", { name: "Save Changes" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [args] = updateMock.mock.calls[0] as [
      { preset_id: string; content: Record<string, unknown> },
    ];
    expect(args.preset_id).toBe("preset-bound");
    expect(args.content.medium).toBe("3d_render");
    expect(args.content.global_art_direction).toBe("STYLE: my own words");
  });

  it("'Generate Image Style' is a plain button that drafts in the selected medium", async () => {
    renderPage();

    fireEvent.click(card("Photography"));
    fireEvent.click(screen.getByRole("button", { name: /Suggest Image Style/ }));
    const cta = screen.getByRole("button", { name: /Generate Image Style/ });
    // A plain action, not a menu trigger.
    expect(cta).not.toHaveAttribute("aria-expanded");
    fireEvent.click(cta);

    await waitFor(() => expect(suggestMock).toHaveBeenCalled());
    const [mode, options] = suggestMock.mock.calls[0] as [string, { medium: string }];
    expect(mode).toBe("visual");
    expect(options.medium).toBe("photography");
    await waitFor(() => expect(screen.getByDisplayValue("STYLE: drafted")).toBeInTheDocument());
    expect(card("Photography")).toHaveAttribute("aria-pressed", "true");
  });

  it("the medium dropdown and the read-only medium badge are gone", () => {
    renderPage();

    // Each medium label renders once: on its card, not again in a badge.
    for (const label of ["Photography", "Illustration", "3D render"]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    fireEvent.click(screen.getByRole("button", { name: /Suggest Image Style/ }));
    fireEvent.click(screen.getByRole("button", { name: /Generate Image Style/ }));
    // No menu opened: still exactly one button per medium.
    expect(
      screen.getAllByRole("button", { name: /^(Photography|Illustration|3D render)/ })
    ).toHaveLength(3);
  });

  // Magic suggest on every plan (2026-10-06, specs/open-providers.md §8):
  // until then the panel was disabled with a "Pro" chip on Free.
  it("a Free install gets a working Suggest Image Style that drafts in the picked medium", async () => {
    licenseMock.mockReturnValue({ plan: "free", isPaidLicense: false });
    renderPage();

    const toggle = screen.getByRole("button", { name: /Suggest Image Style/ });
    expect(toggle).toBeEnabled();
    expect(toggle).not.toHaveTextContent("Pro");
    fireEvent.click(card("3D render"));
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /Generate Image Style/ }));

    await waitFor(() =>
      expect(suggestMock).toHaveBeenCalledWith("visual", expect.objectContaining({ medium: "3d_render" })),
    );
  });

  it("a Free install can change and save the medium", async () => {
    licenseMock.mockReturnValue({ plan: "free", isPaidLicense: false });
    renderPage();

    expect(card("Photography")).toBeEnabled();
    fireEvent.click(card("Photography"));
    expect(card("Photography")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [args] = updateMock.mock.calls[0] as [{ content: Record<string, unknown> }];
    expect(args.content.medium).toBe("photography");
    expect(suggestMock).not.toHaveBeenCalled();
  });
});

/**
 * AI label card (specs/ai-image-label.md §7, 2026-10-05): a switch on the
 * bound preset, sent to the plugin as `content.ai_label` (the field
 * `sanitize_visual_content` accepts). Every plan: no Pro badge, never
 * disabled by plan.
 */
describe("VisualsPage AI label card", () => {
  const preset = (over: Record<string, unknown> = {}) => ({
    presetId: "preset-bound",
    label: "Bound Preset",
    globalArtDirection: "STYLE",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    boundActivationCount: 1,
    ...over,
  });
  const setPresets = (over: Record<string, unknown> = {}, boundPresetId: string | null = "preset-bound") =>
    presetsQueryMock.mockReturnValue({
      data: { presets: [preset(over)], boundPresetId },
      isLoading: false,
    });
  const aiSwitch = () => screen.getByRole("switch", { name: "Label images as AI-generated" });
  const renderPage = () =>
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    licenseMock.mockReturnValue({ plan: "byok", isPaidLicense: true });
    updateMock.mockResolvedValue({});
    createMock.mockResolvedValue({});
  });

  it.each([
    ["free", false],
    ["byok", true],
  ])("%s: renders after Format Encoding with an enabled switch and no Pro badge", (plan, paid) => {
    licenseMock.mockReturnValue({ plan, isPaidLicense: paid });
    setPresets();
    renderPage();

    const heading = screen.getByRole("heading", { name: "AI label" });
    const encoding = screen.getByRole("heading", { name: "Format Encoding" });
    expect(encoding.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const card = heading.closest(".p-6\\!") as HTMLElement;
    expect(card).not.toBeNull();
    expect(aiSwitch()).toBeEnabled();
    expect(card.textContent).not.toContain("Pro");
    expect(card.className).not.toContain("pointer-events-none");
    expect(card).toHaveTextContent(
      "Adds the EU “AI generated” badge to the corner of every image we create with this preset. EU rules ask publishers to mark realistic AI images."
    );
    expect(card).toHaveTextContent(
      "Images that already exist are not changed. Regenerating an image applies the current setting."
    );
    const badges = within(card).getAllByRole("img", { name: "EU “AI generated” badge" });
    expect(badges).toHaveLength(2);
    expect(badges[0].getAttribute("class")).toContain("dark:hidden");
    expect(badges[1].getAttribute("class")).toContain("dark:block");
    // wp-admin's own unlayered `.hidden` would hide it in dark mode too.
    expect(badges[1].getAttribute("class")).toContain("s-hidden");
    expect(badges[1].getAttribute("class")).not.toMatch(/(^|\s)hidden(\s|$)/);
    const learnMore = within(card).getByRole("link", { name: /Learn more/ });
    expect(learnMore).toHaveAttribute(
      "href",
      "https://docs.structurawp.com/en/using/generated-posts/visuals#ai-label"
    );
    expect(learnMore).toHaveAttribute("target", "_blank");
    expect(learnMore).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    [true, "true"],
    [false, "false"],
    [undefined, "false"],
  ])("hydrates aiLabel=%s as aria-checked=%s", (aiLabel, checked) => {
    setPresets(aiLabel === undefined ? {} : { aiLabel });
    renderPage();
    expect(aiSwitch()).toHaveAttribute("aria-checked", checked);
  });

  it("toggling on and saving sends content.ai_label: true", async () => {
    setPresets({ aiLabel: false });
    renderPage();

    fireEvent.click(aiSwitch());
    expect(aiSwitch()).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [args] = updateMock.mock.calls[0] as [{ preset_id: string; content: Record<string, unknown> }];
    expect(args.preset_id).toBe("preset-bound");
    expect(args.content.ai_label).toBe(true);
    expect(args.content).not.toHaveProperty("aiLabel");
  });

  it("toggling off and saving sends content.ai_label: false", async () => {
    setPresets({ aiLabel: true });
    renderPage();

    fireEvent.click(aiSwitch());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [args] = updateMock.mock.calls[0] as [{ content: Record<string, unknown> }];
    expect(args.content.ai_label).toBe(false);
  });

  it("is keyboard operable", () => {
    setPresets();
    renderPage();
    aiSwitch().focus();
    expect(aiSwitch()).toHaveFocus();
    fireEvent.keyUp(aiSwitch(), { key: " " });
    expect(aiSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("an unbound site creates its preset with the switch's value", async () => {
    setPresets({}, null);
    renderPage();

    expect(aiSwitch()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(aiSwitch());
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [args] = createMock.mock.calls[0] as [{ content: Record<string, unknown> }];
    expect(args.content.ai_label).toBe(true);
  });

  it("'Save as new for this site only' carries the switch onto the fork", async () => {
    setPresets({ aiLabel: false, boundActivationCount: 3 });
    forkMock.mockResolvedValue({ preset: { presetId: "preset-fork" } });
    renderPage();

    fireEvent.click(aiSwitch());
    fireEvent.click(screen.getByRole("button", { name: /Save as new for this site only/ }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [args] = updateMock.mock.calls[0] as [{ preset_id: string; content: Record<string, unknown> }];
    expect(args.preset_id).toBe("preset-fork");
    expect(args.content.ai_label).toBe(true);
  });
});

describe("VisualsPage OpenAI aspect-ratio hint by plan (2026-10-06)", () => {
  // Managed plans pick no image provider: Structura binds the image model,
  // so the "switch the image provider to Gemini" hint has nothing to act on.
  const HINT = /OpenAI image models don't support 16:9 natively/;
  const renderPage = () =>
    render(
      <MemoryRouter>
        <VisualsPage />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    presetsQueryMock.mockReturnValue({
      data: {
        presets: [
          {
            presetId: "preset-bound",
            label: "Bound Preset",
            globalArtDirection: "STYLE: my own words",
            aspectRatio: "16:9",
            format: "webp",
            optimizeOnUpload: true,
            medium: "photography",
            boundActivationCount: 1,
          },
        ],
        boundPresetId: "preset-bound",
      },
      isLoading: false,
    });
  });

  afterEach(() => {
    cloudMock.isCloud = true;
  });

  it("managed: no OpenAI hint at 16:9 whatever the stored image provider", () => {
    cloudMock.isCloud = true;
    licenseMock.mockReturnValue({ plan: "cloud_pro", isPaidLicense: true });
    renderPage();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("own key on OpenAI: the hint stays at 16:9", () => {
    cloudMock.isCloud = false;
    licenseMock.mockReturnValue({ plan: "byok", isPaidLicense: true });
    renderPage();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});
