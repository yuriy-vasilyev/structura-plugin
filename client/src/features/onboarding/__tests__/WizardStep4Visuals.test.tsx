/**
 * WizardStep4Visuals — the Visual signature step (specs/visual-signatures.md
 * §6, §8; visual-signatures handoff §3.8).
 *
 * Pins:
 *   1. The thin pass runs once when the step opens with no known answer; the
 *      pick sentence says it is still reading the site, with the house
 *      signature preselected, until it answers.
 *   2. Paid: the pick goes first and is preselected; free: it goes first but
 *      locked, and the house signature stays preselected. The pick sentence
 *      names the style(s) with the palette and the reason.
 *   3. A user's own pick, a persisted answer and a bound preset's saved choice
 *      are never overridden. A bound free prompt keeps its text.
 *   4. Continue is always enabled; no "Your own", no "Free prompt", no In use.
 *   5. The video row is unchanged, and its art direction is still drafted from
 *      the homepage on eligible plans.
 *
 * Real signature hooks and picker on a real query cache; `apiFetch` (the
 * network edge) answers the thin pass. The preset list, license, providers
 * and the visual-style suggest are stubbed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

const licenseMock = vi.hoisted(() => ({
  current: { plan: "cloud", isPaidLicense: true } as { plan: string; isPaidLicense: boolean },
}));
const suggestMock = vi.hoisted(() => ({ fn: vi.fn() }));
const presetsMock = vi.hoisted(() => ({
  current: { boundPresetId: null, presets: [] } as
    | { boundPresetId: string | null; presets: Array<Record<string, unknown>> }
    | undefined,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
  useDefaultProviders: () => ({ defaultTextProvider: "gemini" }),
  usePublicSiteProfile: () => ({
    data: {
      name: "Northfield Garden",
      publicUrl: "https://northfield.test",
      homeUrl: "https://northfield.test",
    },
  }),
}));

vi.mock("@/features/settings/api/useVisualPresets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/settings/api/useVisualPresets")>()),
  useVisualPresetsQuery: () => ({ data: presetsMock.current }),
}));

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: suggestMock.fn, isSuggesting: false }),
}));

const videoEligibilityMock = vi.hoisted(() => ({
  current: "unknown" as "eligible" | "locked" | "unknown",
}));
vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => videoEligibilityMock.current,
}));

import { WizardStep4Visuals } from "../components/WizardStep4Visuals";
import { useWizardStore } from "../state/wizardStore";

const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made, like your seasonal planting guides.",
  palette: ["#2F6B4F", "#C8553D", "#A3C585"],
};

const passCalls = () =>
  apiFetchMock.mock.calls.filter(([arg]) => arg?.path === "/structura/v1/visual-signature/suggest");

function renderStep() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <WizardStep4Visuals />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const step4 = () => useWizardStore.getState().drafts.step4!;

beforeEach(() => {
  useWizardStore.getState().reset();
  apiFetchMock.mockReset().mockResolvedValue({ suggestion: SUGGESTION, homepageRead: true });
  suggestMock.fn.mockReset().mockResolvedValue(null);
  licenseMock.current = { plan: "cloud", isPaidLicense: true };
  presetsMock.current = { boundPresetId: null, presets: [] };
  videoEligibilityMock.current = "unknown";
});

describe("WizardStep4Visuals — the pick", () => {
  it("runs the pass once on open; until it answers the house signature is preselected and the sentence says so", async () => {
    let answer!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderStep();

    const reading = await screen.findByText(/Still reading Northfield Garden to pick a style\./);
    expect(reading).toHaveTextContent(
      "Still reading Northfield Garden to pick a style. Editorial reportage is selected until then."
    );
    await waitFor(() =>
      expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true")
    );
    expect(passCalls()).toHaveLength(1);

    await act(async () => answer({ suggestion: SUGGESTION, homepageRead: true }));

    await waitFor(() => expect(radio(/^Paper cut/)).toHaveAttribute("aria-checked", "true"));
    expect(passCalls()).toHaveLength(1);
  });

  it("paid: the pick goes first and is preselected, named with the palette and the reason", async () => {
    renderStep();
    await waitFor(() => expect(radio(/^Paper cut/)).toHaveAttribute("aria-checked", "true"));
    expect(screen.getAllByRole("radio")[0]).toHaveAccessibleName(/^Paper cut/);

    const sentence = screen.getByText(/Our pick for Northfield Garden/).closest("p")!;
    expect(sentence).toHaveTextContent(
      "Our pick for Northfield Garden is Paper cut, in your colors"
    );
    expect(within(sentence).getByText("Paper cut").tagName).toBe("STRONG");
    expect(within(sentence).getByRole("img", { name: "Brand colors" })).toBeInTheDocument();
    expect(screen.getByText(SUGGESTION.reason)).toBeInTheDocument();

    expect(step4().signature).toEqual({ kind: "curated", id: "paper-cut", version: 1 });
    expect(step4().palette).toEqual(SUGGESTION.palette);
    expect(screen.getByRole("list", { name: "Brand colors" })).toHaveTextContent("#2F6B4F");
  });

  it("free: the pick goes first but locked; the house signature stays preselected and the sentence names both", async () => {
    licenseMock.current = { plan: "free", isPaidLicense: false };
    renderStep();
    await waitFor(() => expect(screen.getAllByRole("radio")[0]).toHaveAccessibleName(/^Paper cut/));
    expect(radio(/^Paper cut/)).toBeDisabled();
    expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Our pick for Northfield Garden/).closest("p")).toHaveTextContent(
      "Our pick for Northfield Garden is Paper cut, which comes with paid plans. Until then, your images use Editorial reportage in your colors"
    );
    expect(step4().signature).toEqual({ kind: "curated", id: "editorial-reportage", version: 1 });
    // The palette is every plan's.
    expect(step4().palette).toEqual(SUGGESTION.palette);
  });

  it("a card the user picked survives a later answer", async () => {
    let answer!: (value: unknown) => void;
    apiFetchMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderStep();
    await waitFor(() => expect(radio(/^Isometric glass/)).toBeEnabled());
    fireEvent.click(radio(/^Isometric glass/));

    await act(async () => answer({ suggestion: SUGGESTION, homepageRead: true }));

    await waitFor(() => expect(step4().suggestion?.pick).toBe("paper-cut"));
    expect(radio(/^Isometric glass/)).toHaveAttribute("aria-checked", "true");
    expect(step4().signature).toEqual({ kind: "curated", id: "isometric-glass", version: 1 });
  });

  it("a pick stored on the activation (the preset list) is used without running the pass", async () => {
    presetsMock.current = {
      boundPresetId: null,
      presets: [],
      visualSuggestion: { ...SUGGESTION, pick: "ink-and-fill", at: "2026-11-09T14:00:00.000Z" },
    } as typeof presetsMock.current;
    renderStep();
    await waitFor(() => expect(radio(/^Ink and fill/)).toHaveAttribute("aria-checked", "true"));
    expect(screen.getAllByRole("radio")[0]).toHaveAccessibleName(/^Ink and fill/);
    expect(step4().palette).toEqual(SUGGESTION.palette);
    expect(passCalls()).toHaveLength(0);
  });

  it("an answer persisted on the draft is reused, not fetched again", async () => {
    useWizardStore.getState().setStep4Draft({
      globalArtDirection: "",
      aspectRatio: "16:9",
      format: "webp",
      optimizeOnUpload: true,
      medium: "photography",
      signature: { kind: "curated", id: "paper-cut", version: 1 },
      suggestion: { ...SUGGESTION, pick: "paper-cut", runnerUp: "ink-and-fill" },
    });
    renderStep();
    await waitFor(() => expect(radio(/^Paper cut/)).toHaveAttribute("aria-checked", "true"));
    expect(passCalls()).toHaveLength(0);
  });

  it("a failed pass hides the sentence and keeps the house signature", async () => {
    apiFetchMock.mockRejectedValue({
      code: "cloud_error",
      message: "x",
      data: { status: 429, code: "ai_rate_limited" },
    });
    renderStep();
    await waitFor(() => expect(step4().suggestion).toBeNull());
    expect(screen.queryByText(/Still reading/)).toBeNull();
    expect(screen.queryByText(/Our pick for Northfield Garden/)).toBeNull();
    expect(radio(/^Editorial reportage/)).toHaveAttribute("aria-checked", "true");
  });

  it("Re-scan replaces the palette and the pick", async () => {
    renderStep();
    await waitFor(() => expect(step4().palette).toEqual(SUGGESTION.palette));
    apiFetchMock.mockResolvedValue({
      suggestion: { ...SUGGESTION, pick: "ink-and-fill", palette: ["#123456"] },
      homepageRead: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));

    await waitFor(() => expect(step4().palette).toEqual(["#123456"]));
    expect(step4().suggestion?.pick).toBe("ink-and-fill");
    expect(radio(/^Ink and fill/)).toHaveAttribute("aria-checked", "true");
  });
});

describe("WizardStep4Visuals — a site with a saved preset", () => {
  const bound = (over: Record<string, unknown>) => {
    presetsMock.current = {
      boundPresetId: "preset-1",
      presets: [
        {
          presetId: "preset-1",
          globalArtDirection: "Saved words",
          aspectRatio: "1:1",
          format: "jpeg",
          optimizeOnUpload: false,
          medium: "illustration",
          ...over,
        },
      ],
    };
  };

  it("keeps the saved library choice selected over the pick", async () => {
    bound({
      signature: { kind: "curated", id: "miniature-world", version: 1 },
      palette: ["#000000"],
    });
    renderStep();
    await waitFor(() => expect(step4().suggestion?.pick).toBe("paper-cut"));
    expect(radio(/^Miniature world/)).toHaveAttribute("aria-checked", "true");
    expect(step4()).toMatchObject({
      signature: { kind: "curated", id: "miniature-world", version: 1 },
      aspectRatio: "1:1",
      format: "jpeg",
      medium: "illustration",
      // A saved palette is not replaced by the scraped one.
      palette: ["#000000"],
    });
  });

  // 2026-11-09: free plans seeded defaults before the list loaded; with the
  // signature now written at Finish, that would have replaced a free site's
  // saved prompt with the house signature.
  it("free: waits for the saved preset instead of seeding the house signature over it", async () => {
    licenseMock.current = { plan: "free", isPaidLicense: false };
    presetsMock.current = undefined;
    const view = renderStep();
    await act(async () => {
      await Promise.resolve();
    });
    expect(useWizardStore.getState().drafts.step4).toBeUndefined();

    bound({});
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <WizardStep4Visuals />
        </ToastProvider>
      </QueryClientProvider>
    );
    await waitFor(() => expect(step4().signature).toBeNull());
    expect(step4().globalArtDirection).toBe("Saved words");
  });

  it("a saved free prompt is kept: no card checked, and a line says so", async () => {
    bound({});
    renderStep();
    await waitFor(() => expect(step4().signature).toBeNull());
    expect(
      await screen.findByText("This site keeps its current style unless you pick one below.")
    ).toBeInTheDocument();
    for (const r of screen.getAllByRole("radio"))
      expect(r).toHaveAttribute("aria-checked", "false");
    expect(step4().globalArtDirection).toBe("Saved words");
  });
});

describe("WizardStep4Visuals — the step", () => {
  it("Continue is always enabled", async () => {
    renderStep();
    await waitFor(() => expect(useWizardStore.getState().stepValidity[4]).toBe(true));
  });

  it("has the library only: no Your own, no Free prompt, no In use", async () => {
    renderStep();
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(6));
    expect(screen.queryByRole("button", { name: /^Your own/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Free prompt/ })).toBeNull();
    expect(screen.queryByText("In use")).toBeNull();
    expect(screen.getByRole("heading", { name: "Visual signature" })).toBeInTheDocument();
  });

  it("paid plans get the build-later line; free plans don't", async () => {
    const line =
      "Want a look of your own? Build it later on the Visuals page, or write a prompt there.";
    const view = renderStep();
    expect(await screen.findByText(line)).toBeInTheDocument();
    view.unmount();
    useWizardStore.getState().reset();
    licenseMock.current = { plan: "free", isPaidLicense: false };
    renderStep();
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(6));
    expect(screen.queryByText(line)).toBeNull();
  });

  it("free tier: format and optimize stay Pro-gated", async () => {
    licenseMock.current = { plan: "free", isPaidLicense: false };
    renderStep();
    await waitFor(() => expect(screen.getAllByText("Pro").length).toBeGreaterThan(0));
    expect(step4().format).toBe("png");
  });

  it("drafts no image style any more: the visual-style suggest only runs for the video row", async () => {
    renderStep();
    await waitFor(() => expect(passCalls()).toHaveLength(1));
    expect(suggestMock.fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Video styling row (video-visuals handoff §4) — unchanged by the signature
// step, except that its art direction is now drafted on its own.
// ---------------------------------------------------------------------------

describe("WizardStep4Visuals — video styling row", () => {
  it("renders no video row when the plan is ineligible (locked)", async () => {
    videoEligibilityMock.current = "locked";
    renderStep();
    await waitFor(() => expect(useWizardStore.getState().drafts.step4).toBeTruthy());
    expect(screen.queryByText("Video styling")).toBeNull();
  });

  it("renders no video row while eligibility is unknown", async () => {
    videoEligibilityMock.current = "unknown";
    renderStep();
    await waitFor(() => expect(useWizardStore.getState().drafts.step4).toBeTruthy());
    expect(screen.queryByText("Video styling")).toBeNull();
  });

  it("renders the collapsed row with suggested defaults (kinetic · bottom) and expands to the compact controls", async () => {
    videoEligibilityMock.current = "eligible";
    renderStep();

    const row = await screen.findByRole("button", { name: /video styling/i });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Suggested for you")).toBeInTheDocument();
    await waitFor(() => {
      expect(step4().videoStyle).toBe("kinetic");
      expect(step4().captionPlacement).toBe("bottom");
    });

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radiogroup", { name: /video style preset/i })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /caption placement/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /video art direction/i })).toBeNull();
  });

  it("drafts the video art direction from the homepage in the background; the palette stays the thin pass's", async () => {
    videoEligibilityMock.current = "eligible";
    suggestMock.fn.mockResolvedValue({
      prompt: "STYLE: ignored here",
      videoArtDirection: "FOOTAGE: warm workshop scenes",
      palette: ["#999999"],
    });
    renderStep();

    await waitFor(() => expect(step4().videoArtDirection).toBe("FOOTAGE: warm workshop scenes"));
    expect(suggestMock.fn).toHaveBeenCalledTimes(1);
    expect(suggestMock.fn).toHaveBeenCalledWith(
      "visual",
      expect.objectContaining({
        context: [{ title: "Northfield Garden", url: "https://northfield.test" }],
      })
    );
    await waitFor(() => expect(step4().palette).toEqual(SUGGESTION.palette));
    expect(step4().globalArtDirection).toBe("");
  });

  it("hydrates the video fields from the bound preset and drafts nothing over them", async () => {
    videoEligibilityMock.current = "eligible";
    presetsMock.current = {
      boundPresetId: "preset-1",
      presets: [
        {
          presetId: "preset-1",
          globalArtDirection: "Saved curated style",
          aspectRatio: "1:1",
          format: "jpeg",
          optimizeOnUpload: false,
          videoStyle: "bold",
          videoArtDirection: "PACING: fast cuts",
          captionPlacement: "top",
          palette: ["#123456"],
        },
      ],
    };
    renderStep();

    await waitFor(() => expect(step4().videoStyle).toBe("bold"));
    expect(step4().captionPlacement).toBe("top");
    expect(step4().videoArtDirection).toBe("PACING: fast cuts");
    expect(step4().palette).toEqual(["#123456"]);
    expect(suggestMock.fn).not.toHaveBeenCalled();
  });
});
