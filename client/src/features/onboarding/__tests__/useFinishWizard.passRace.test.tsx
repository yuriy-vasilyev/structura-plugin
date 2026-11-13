/**
 * The thin pass outliving the wizard's Visuals step (production, 2026-11-09).
 * The pass took 28 s; the user picked a card and moved on within seconds. The
 * cloud stored the palette on the activation, but the preset was saved
 * without one, so every image rendered in the neutral set.
 *
 * Pins: the pass's answer reaches the step-4 draft after the step unmounted,
 * and a step opened again while the pass reads the site starts no second one;
 * Finish waits a bounded time for a pass still in flight, refetches the
 * preset list right before saving and falls back to the palette stored on
 * the activation, never over colours the draft has.
 *
 * The real step, pass and preset hooks, wizard store and Finish on one query
 * cache; `apiFetch` (the network edge) answers the plugin routes. License,
 * site profile, the video row and the other steps' saves are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";
import type { ReactNode } from "react";

const { apiFetchMock, license } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  license: { plan: "cloud", isPaidLicense: true, hasUsableLicense: true, isLicensed: true },
}));

vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));
vi.mock("@/features/settings/api/useLicense", () => ({ useLicense: () => license }));
vi.mock("@/features/settings", () => ({
  useLicense: () => license,
  useDefaultProviders: () => ({ defaultTextProvider: "gemini" }),
  usePublicSiteProfile: () => ({
    data: {
      name: "Northfield Garden",
      publicUrl: "https://northfield.test",
      homeUrl: "https://northfield.test",
    },
  }),
  usePublicSiteProfileMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(async () => null), isSuggesting: false }),
}));
vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => "locked",
}));
vi.mock("@/features/ai-engine/api/useUpdateAiSettings", () => ({
  useUpdateAiSettings: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/site/api/useSiteAnalysis", () => ({
  useUpdateSiteSeoSettingsMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../api/useWizardSeo", () => ({
  useSaveWizardPositioningMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../api/useOnboardingState", () => ({
  useSaveWizardStepMutation: () => ({ mutateAsync: vi.fn() }),
  useDismissOnboardingMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../utils/onboardingDismissal", () => ({ clearOnboardingDismissed: vi.fn() }));

import { WizardStep4Visuals } from "../components/WizardStep4Visuals";
import { useFinishWizard } from "../api/useFinishWizard";
import {
  useSuggestVisualSignatureMutation,
  useVisualPresetsQuery,
} from "@/features/settings/api/useVisualPresets";
import { useWizardStore, type VisualDraft } from "../state/wizardStore";

const LIST = "/structura/v1/visual-presets";
const SUGGEST = "/structura/v1/visual-signature/suggest";
const PALETTE = ["#2F6B4F", "#C8553D", "#A3C585", "#F2E8CF"];
const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made, like your seasonal planting guides.",
  palette: PALETTE,
};
const PAPER_CUT = { kind: "curated" as const, id: "paper-cut" as const, version: 1 };
const ISOMETRIC_GLASS = { kind: "curated" as const, id: "isometric-glass" as const, version: 1 };

/** The cloud side: the site's bound preset and the thin-pass answer stored on the activation. */
let bound: Record<string, unknown> | null;
let stored: (typeof SUGGESTION & { at: string }) | undefined;
/** Passes still reading the site; answering one stores its result first, as the cloud does. */
let openPasses: Array<() => void>;

function plugin(req: { path: string; method?: string }) {
  if (req.path === SUGGEST) {
    return new Promise((resolve) => {
      openPasses.push(() => {
        stored = { ...SUGGESTION, at: "2026-11-09T14:00:00.000Z" };
        resolve({ suggestion: SUGGESTION, homepageRead: true });
      });
    });
  }
  if (req.path === LIST && req.method === "POST") {
    return Promise.resolve({
      success: true,
      preset: { presetId: "p-new" },
      boundPresetId: "p-new",
    });
  }
  if (req.path === LIST) {
    return Promise.resolve({
      success: true,
      boundPresetId: bound ? bound.presetId : null,
      presets: bound ? [bound] : [],
      ...(stored ? { visualSuggestion: stored } : {}),
    });
  }
  return Promise.reject(new Error(`unexpected ${req.method ?? "GET"} ${req.path}`));
}

const answerPasses = () => openPasses.splice(0).forEach((answer) => answer());

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <ToastProvider>{children}</ToastProvider>
  </QueryClientProvider>
);

const requests = (path: string, method?: string) =>
  apiFetchMock.mock.calls.filter(([req]) => req.path === path && req.method === method);
const passCalls = () => requests(SUGGEST, "POST");
/** Preset-list reads before the first preset save (a save refetches the list too). */
const listReadsBeforeSave = () => {
  const calls = apiFetchMock.mock.calls.map(([req]) => req as { path: string; method?: string });
  const save = calls.findIndex((req) => req.path === LIST && req.method === "POST");
  return calls
    .slice(0, save === -1 ? undefined : save)
    .filter((req) => req.path === LIST && !req.method).length;
};
const savedContent = () =>
  (requests(LIST, "POST")[0]![0] as { data: { content: Record<string, unknown> } }).data.content;
const step4 = () => useWizardStore.getState().drafts.step4;
const radio = (name: RegExp) => screen.getByRole("radio", { name });

/** A step-4 draft as the step left it. */
const seedStep4 = (over: Partial<VisualDraft>) =>
  useWizardStore.getState().setStep4Draft({
    globalArtDirection: "",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    ...over,
  });

/** Finish, and a pass hook on the same cache, once the wizard has the preset list (as it has long before Finish). */
async function renderFinish() {
  const view = renderHook(
    () => ({
      finish: useFinishWizard(),
      scan: useSuggestVisualSignatureMutation(),
      presets: useVisualPresetsQuery(),
    }),
    { wrapper }
  );
  await waitFor(() => expect(view.result.current.presets.isSuccess).toBe(true));
  return view;
}

/**
 * Opens the step on a draft whose card the user picked on an earlier visit
 * and waits for its pass to start. Since 2026-11-11 the loader holds the
 * step while the pass reads the site, so no card can be picked meanwhile;
 * the user can still leave the step.
 */
async function openWhileReading() {
  seedStep4({ signature: ISOMETRIC_GLASS, signatureTouched: true });
  const view = render(<WizardStep4Visuals />, { wrapper });
  await waitFor(() => expect(passCalls()).toHaveLength(1));
  await screen.findByText("Reading your brand");
  return view;
}

beforeEach(() => {
  useWizardStore.getState().reset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  bound = null;
  stored = undefined;
  openPasses = [];
  apiFetchMock.mockReset().mockImplementation(plugin);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the thin pass answering after the Visuals step unmounted (2026-11-09)", () => {
  it("still lands its palette and pick in the draft, keeping the card the user picked", async () => {
    const step = await openWhileReading();
    step.unmount();

    await act(async () => answerPasses());
    await waitFor(() => expect(step4()?.palette).toEqual(PALETTE));
    expect(step4()?.suggestion?.pick).toBe("paper-cut");
    expect(step4()?.signature).toEqual(ISOMETRIC_GLASS);
  });

  it("starts no second pass when the step opens again while the first still reads the site", async () => {
    const first = render(<WizardStep4Visuals />, { wrapper });
    await waitFor(() => expect(passCalls()).toHaveLength(1));
    first.unmount();

    render(<WizardStep4Visuals />, { wrapper });
    await screen.findByText("Reading your brand");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(passCalls()).toHaveLength(1);

    await act(async () => answerPasses());
    await waitFor(() => expect(radio(/^Paper cut/)).toHaveAttribute("aria-checked", "true"));
    expect(step4()?.palette).toEqual(PALETTE);
    expect(passCalls()).toHaveLength(1);
  });
});

describe("Finish with the pass still reading the site", () => {
  it("waits for the pass and saves its palette with the picked card", async () => {
    const step = await openWhileReading();
    step.unmount();

    const { result } = await renderFinish();
    let finishing!: Promise<void>;
    act(() => {
      finishing = result.current.finish.mutateAsync();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(requests(LIST, "POST")).toHaveLength(0);

    await act(async () => answerPasses());
    await act(() => finishing);
    expect(savedContent()).toMatchObject({ signature: ISOMETRIC_GLASS, palette: PALETTE });
  });

  it("stops waiting after 15 s and saves what it has", async () => {
    seedStep4({ signature: PAPER_CUT, signatureTouched: true });
    const { result } = await renderFinish();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      void result.current.scan.mutateAsync();
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(passCalls()).toHaveLength(1);

    let finished = false;
    act(() => {
      void result.current.finish.mutateAsync().then(() => {
        finished = true;
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(14_900));
    expect(requests(LIST, "POST")).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(100));
    await vi.waitFor(() => expect(finished).toBe(true));
    expect(savedContent().signature).toEqual(PAPER_CUT);
    expect(savedContent()).not.toHaveProperty("palette");
  });
});

describe("Finish and the palette stored on the activation", () => {
  it("refetches the preset list and saves the stored palette when the draft has none", async () => {
    // The pass answered on the activation but never in this draft: the page
    // reloaded while it read the site.
    seedStep4({ signature: PAPER_CUT, signatureTouched: true });
    const { result } = await renderFinish();
    stored = { ...SUGGESTION, at: "2026-11-09T14:00:00.000Z" };

    await act(() => result.current.finish.mutateAsync());
    expect(listReadsBeforeSave()).toBe(2);
    expect(savedContent()).toMatchObject({ signature: PAPER_CUT, palette: PALETTE });
  });

  it("keeps the colours the draft has, without a refetch", async () => {
    stored = { ...SUGGESTION, at: "2026-11-09T14:00:00.000Z" };
    seedStep4({ signature: PAPER_CUT, palette: ["#112233"] });
    const { result } = await renderFinish();

    await act(() => result.current.finish.mutateAsync());
    expect(listReadsBeforeSave()).toBe(1);
    expect(savedContent().palette).toEqual(["#112233"]);
  });

  it("adds none to a bound free prompt kept as it is", async () => {
    bound = {
      presetId: "preset-1",
      globalArtDirection: "Saved words",
      aspectRatio: "16:9",
      format: "webp",
      optimizeOnUpload: true,
      medium: "photography",
    };
    stored = { ...SUGGESTION, at: "2026-11-09T14:00:00.000Z" };
    seedStep4({ signature: null, globalArtDirection: "Saved words" });
    const { result } = await renderFinish();

    await act(() => result.current.finish.mutateAsync());
    expect(requests(`${LIST}/preset-1`, "POST")).toHaveLength(0);
    expect(requests(LIST, "POST")).toHaveLength(0);
  });
});
