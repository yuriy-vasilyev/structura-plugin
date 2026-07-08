/**
 * WizardStep4Visuals — visual-style step.
 *
 * Pins the visual-step contracts:
 *   1. The visual prompt auto-suggests on land for paid + a genuinely
 *      blank prompt (no bound preset, no draft). A logo is NOT required —
 *      the cloud screenshots the homepage for the brand cue, so every paid
 *      site gets an on-brand draft — and a saved/hydrated style is never
 *      overwritten.
 *   2. The draft HYDRATES from the activation's bound visual preset, so a
 *      configured site shows its saved style instead of a blank prompt
 *      (and Finish updates it in place rather than replacing it).
 *   3. The step gates on a non-empty art-direction prompt.
 *   4. Paid tiers get an actionable "AI suggest style"; free tiers see it
 *      locked, with the format/optimize controls Pro-gated.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@structura/ui";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const licenseMock = vi.hoisted(() => ({
  current: { plan: "cloud", isPaidLicense: true } as {
    plan: string;
    isPaidLicense: boolean;
  },
}));
const suggestMock = vi.hoisted(() => ({ fn: vi.fn() }));
const presetsMock = vi.hoisted(() => ({
  current: { boundPresetId: null, presets: [] } as {
    boundPresetId: string | null;
    presets: Array<Record<string, unknown>>;
  } | undefined,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
  useDefaultProviders: () => ({ defaultTextProvider: "openai" }),
  usePublicSiteProfile: () => ({
    data: {
      name: "Acme",
      publicUrl: "https://acme.test",
      homeUrl: "https://acme.test",
    },
  }),
}));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: presetsMock.current }),
}));

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: suggestMock.fn, isSuggesting: false }),
}));

// Video-styling eligibility (video-visuals handoff §4) — cloud-computed off
// the channel catalog. Defaults to "unknown" so the pre-existing tests above
// exercise the step exactly as before the video row landed (no row).
const videoEligibilityMock = vi.hoisted(() => ({
  current: "unknown" as "eligible" | "locked" | "unknown",
}));
vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => videoEligibilityMock.current,
}));

// SuggestStrategySection is the shared suggest panel (its own paid/locked
// state + provider deps are covered with that component). Stub it to a
// button that fires onGenerate, so these tests stay focused on the wizard
// step's own logic (auto-suggest / hydration / gating).
vi.mock("@/features/campaigns/components/SuggestStrategySection", () => ({
  SuggestStrategySection: ({
    onGenerate,
  }: {
    onGenerate: (provider: string, context: unknown[], medium?: string) => void;
  }) => (
    <button type="button" onClick={() => onGenerate("openai", [], "photography")}>
      Suggest Image Style
    </button>
  ),
}));

import { WizardStep4Visuals } from "../components/WizardStep4Visuals";
import { useWizardStore } from "../state/wizardStore";

function renderStep() {
  return render(
    <ToastProvider>
      <WizardStep4Visuals />
    </ToastProvider>,
  );
}

beforeEach(() => {
  useWizardStore.getState().reset();
  suggestMock.fn.mockReset();
  licenseMock.current = { plan: "cloud", isPaidLicense: true };
  presetsMock.current = { boundPresetId: null, presets: [] };
  videoEligibilityMock.current = "unknown";
});

describe("WizardStep4Visuals", () => {
  it("auto-suggests on land WITHOUT a logo (cloud screenshots the homepage)", async () => {
    suggestMock.fn.mockResolvedValue({ prompt: "Homepage-grounded brand style" });
    // No logo set on Step 1 — the homepage screenshot now carries the brand
    // cue server-side, so the draft still fills and no nudge is shown.
    renderStep();

    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "Homepage-grounded brand style",
      ),
    );
    expect(suggestMock.fn).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Add a logo for an on-brand style"),
    ).toBeNull();
  });

  it("auto-suggests on land when paid + logo + blank prompt", async () => {
    suggestMock.fn.mockResolvedValue({ prompt: "Bold isometric brand style" });
    useWizardStore.getState().setStep1Draft({
      publicUrl: "https://acme.test",
      isHeadless: false,
      description: "",
      logoUrl: "https://acme.test/logo.png",
    });
    renderStep();

    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "Bold isometric brand style",
      ),
    );
    expect(suggestMock.fn).toHaveBeenCalledTimes(1);
    // Banner is for the no-logo case only.
    expect(
      screen.queryByText("Add a logo for an on-brand style"),
    ).toBeNull();
  });

  it("does NOT auto-suggest over a hydrated bound preset, even with a logo", async () => {
    useWizardStore.getState().setStep1Draft({
      publicUrl: "https://acme.test",
      isHeadless: false,
      description: "",
      logoUrl: "https://acme.test/logo.png",
    });
    presetsMock.current = {
      boundPresetId: "preset-1",
      presets: [
        {
          presetId: "preset-1",
          globalArtDirection: "Saved curated style",
          aspectRatio: "1:1",
          format: "jpeg",
          optimizeOnUpload: false,
        },
      ],
    };
    renderStep();

    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "Saved curated style",
      ),
    );
    expect(suggestMock.fn).not.toHaveBeenCalled();
  });

  it("hydrates the draft from the bound visual preset", async () => {
    presetsMock.current = {
      boundPresetId: "preset-1",
      presets: [
        {
          presetId: "preset-1",
          globalArtDirection: "High-precision 3D isometric render, indigo palette",
          aspectRatio: "1:1",
          format: "jpeg",
          optimizeOnUpload: false,
        },
      ],
    };
    renderStep();

    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "High-precision 3D isometric render, indigo palette",
      ),
    );
    const draft = useWizardStore.getState().drafts.step4!;
    expect(draft.aspectRatio).toBe("1:1");
    expect(draft.format).toBe("jpeg");
    // A site that already has a style is immediately valid — no rewrite.
    await waitFor(() =>
      expect(useWizardStore.getState().stepValidity[4]).toBe(true),
    );
  });

  it("hydrates over a persisted PRISTINE draft (empty prompt) — the 1.75.1 stale-draft case", async () => {
    // A pre-hydration build persisted an empty default draft to
    // localStorage; it must not block hydration of the saved preset.
    useWizardStore.getState().setStep4Draft({
      globalArtDirection: "",
      aspectRatio: "16:9",
      format: "webp",
      optimizeOnUpload: true,
      medium: "photography",
    });
    presetsMock.current = {
      boundPresetId: "preset-1",
      presets: [
        {
          presetId: "preset-1",
          globalArtDirection: "Saved isometric style",
          aspectRatio: "1:1",
          format: "jpeg",
          optimizeOnUpload: false,
        },
      ],
    };
    renderStep();

    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "Saved isometric style",
      ),
    );
  });

  it("does NOT overwrite a draft the user actually wrote", async () => {
    useWizardStore.getState().setStep4Draft({
      globalArtDirection: "My hand-written style",
      aspectRatio: "16:9",
      format: "webp",
      optimizeOnUpload: true,
      medium: "photography",
    });
    presetsMock.current = {
      boundPresetId: "preset-1",
      presets: [
        {
          presetId: "preset-1",
          globalArtDirection: "Saved isometric style",
          aspectRatio: "1:1",
          format: "jpeg",
          optimizeOnUpload: false,
        },
      ],
    };
    renderStep();

    // Give the seed effect a tick, then assert the user's text survived.
    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "My hand-written style",
      ),
    );
  });

  it("gates on a non-empty art-direction prompt when no preset exists", async () => {
    renderStep();
    await waitFor(() =>
      expect(useWizardStore.getState().stepValidity[4]).toBe(false),
    );

    const draft = useWizardStore.getState().drafts.step4!;
    useWizardStore
      .getState()
      .setStep4Draft({ ...draft, globalArtDirection: "Soft editorial light" });

    await waitFor(() =>
      expect(useWizardStore.getState().stepValidity[4]).toBe(true),
    );
  });

  it("renders the shared suggest panel (medium switcher lives there)", async () => {
    renderStep();
    expect(
      await screen.findByRole("button", { name: /suggest image style/i }),
    ).toBeInTheDocument();
  });

  it("free tier: visual options are Pro-gated", async () => {
    // The suggest panel's own locked state is covered with
    // SuggestStrategySection; here we only pin the wizard step's gated
    // format + optimize controls.
    licenseMock.current = { plan: "free", isPaidLicense: false };
    renderStep();
    await waitFor(() =>
      expect(screen.getAllByText("Pro").length).toBeGreaterThan(0),
    );
  });
});

// ---------------------------------------------------------------------------
// Video styling row (video-visuals handoff §4)
// ---------------------------------------------------------------------------
//
// Eligible plans get one collapsible "Video styling" row after the visual
// prompt block — collapsed summary + "Suggested for you" badge; expanded
// compact style cards + placement radio, NO textarea (the drafted video art
// direction saves silently onto the preset). Ineligible plans see no row at
// all: the wizard sells nothing.

describe("WizardStep4Visuals — video styling row", () => {
  it("renders no video row when the plan is ineligible (locked)", async () => {
    videoEligibilityMock.current = "locked";
    renderStep();
    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4).toBeTruthy(),
    );
    expect(screen.queryByText("Video styling")).toBeNull();
  });

  it("renders no video row while eligibility is unknown", async () => {
    videoEligibilityMock.current = "unknown";
    renderStep();
    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4).toBeTruthy(),
    );
    expect(screen.queryByText("Video styling")).toBeNull();
  });

  it("renders the collapsed row with suggested defaults (kinetic · bottom) and expands to the compact controls", async () => {
    videoEligibilityMock.current = "eligible";
    suggestMock.fn.mockResolvedValue({ prompt: "Brand style" });
    renderStep();

    const row = await screen.findByRole("button", { name: /video styling/i });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Suggested for you")).toBeInTheDocument();

    // Suggested-for-you defaults land on the draft so Finish persists a
    // branded starting point even when the user never expands the row.
    await waitFor(() => {
      const draft = useWizardStore.getState().drafts.step4!;
      expect(draft.videoStyle).toBe("kinetic");
      expect(draft.captionPlacement).toBe("bottom");
    });

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    // Compact style cards + placement radio — and NO video-art-direction
    // textarea (wizard saves the drafted prompt silently).
    expect(
      screen.getByRole("radiogroup", { name: /video style preset/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /kinetic/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radiogroup", { name: /caption placement/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /video art direction/i }),
    ).toBeNull();
    expect(
      screen.getByText(
        /Video art direction was drafted from your homepage/,
      ),
    ).toBeInTheDocument();
  });

  it("stashes videoArtDirection + palette from the suggest pass silently on the draft", async () => {
    videoEligibilityMock.current = "eligible";
    suggestMock.fn.mockResolvedValue({
      prompt: "Homepage-grounded brand style",
      videoArtDirection: "FOOTAGE: warm workshop scenes",
      palette: ["#B36D33", "#111111"],
    });
    renderStep();

    // Auto-suggest on land fills the image prompt AND the video fields.
    await waitFor(() =>
      expect(useWizardStore.getState().drafts.step4?.globalArtDirection).toBe(
        "Homepage-grounded brand style",
      ),
    );
    const draft = useWizardStore.getState().drafts.step4!;
    expect(draft.videoArtDirection).toBe("FOOTAGE: warm workshop scenes");
    expect(draft.palette).toEqual(["#B36D33", "#111111"]);
  });

  it("hydrates the video fields from the bound preset instead of the suggested defaults", async () => {
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

    await waitFor(() => {
      const draft = useWizardStore.getState().drafts.step4;
      expect(draft?.videoStyle).toBe("bold");
    });
    const draft = useWizardStore.getState().drafts.step4!;
    expect(draft.captionPlacement).toBe("top");
    expect(draft.videoArtDirection).toBe("PACING: fast cuts");
    expect(draft.palette).toEqual(["#123456"]);
  });
});
