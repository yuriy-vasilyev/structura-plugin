/**
 * useFinishWizard — step-4 visual-preset commit wire shape.
 *
 * Pins the video-visuals handoff §4 contract on the batched Finish save:
 * the drafted video styling (style / art direction / placement / palette)
 * rides the SAME preset create/update `content` payload as the image
 * fields — but ONLY when the wizard actually drafted them. A draft
 * without video fields (ineligible plan, or a pre-video draft restored
 * from localStorage) must not write video keys at all, so an old draft
 * can never clobber a preset's saved video styling with defaults.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@wordpress/i18n", () => ({ __: (text: string) => text }));

const createMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const presetsMock = vi.hoisted(() => ({
  current: { boundPresetId: null as string | null, presets: [] as unknown[] },
}));

vi.mock("@/features/settings", () => ({
  usePublicSiteProfile: () => ({ data: undefined }),
  usePublicSiteProfileMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/ai-engine/api/useUpdateAiSettings", () => ({
  useUpdateAiSettings: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: presetsMock.current }),
  useVisualPresetMutations: () => ({
    create: createMock,
    update: updateMock,
  }),
}));
vi.mock("@/features/site/api/useSiteAnalysis", () => ({
  useUpdateSiteSeoSettingsMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../api/useWizardSeo", () => ({
  useSaveWizardPositioningMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../api/useOnboardingState", () => ({
  useSaveWizardStepMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../utils/onboardingDismissal", () => ({
  clearOnboardingDismissed: vi.fn(),
}));

import { useFinishWizard } from "../api/useFinishWizard";
import { useWizardStore } from "../state/wizardStore";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useWizardStore.getState().reset();
  createMock.mockReset().mockResolvedValue({});
  updateMock.mockReset().mockResolvedValue({});
  presetsMock.current = { boundPresetId: null, presets: [] };
});

describe("useFinishWizard — visual preset video fields", () => {
  it("persists drafted video styling on the preset content", async () => {
    useWizardStore.getState().setStep4Draft({
      globalArtDirection: "Editorial photography",
      aspectRatio: "16:9",
      format: "webp",
      optimizeOnUpload: true,
      medium: "photography",
      videoStyle: "kinetic",
      videoArtDirection: "FOOTAGE: workshop scenes",
      captionPlacement: "bottom",
      palette: ["#B36D33", "#111111"],
    });

    const { result } = renderHook(() => useFinishWizard(), { wrapper });
    await result.current.mutateAsync();

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          global_art_direction: "Editorial photography",
          video_style: "kinetic",
          video_art_direction: "FOOTAGE: workshop scenes",
          caption_placement: "bottom",
          palette: ["#B36D33", "#111111"],
        }),
      }),
    );
  });

  it("omits video keys entirely when the draft has none (pre-video draft / ineligible plan)", async () => {
    presetsMock.current = { boundPresetId: "preset-1", presets: [] };
    useWizardStore.getState().setStep4Draft({
      globalArtDirection: "Editorial photography",
      aspectRatio: "16:9",
      format: "webp",
      optimizeOnUpload: true,
      medium: "photography",
    });

    const { result } = renderHook(() => useFinishWizard(), { wrapper });
    await result.current.mutateAsync();

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const content = updateMock.mock.calls[0][0].content as Record<string, unknown>;
    expect("video_style" in content).toBe(false);
    expect("video_art_direction" in content).toBe(false);
    expect("caption_placement" in content).toBe(false);
    expect("palette" in content).toBe(false);
  });
});
