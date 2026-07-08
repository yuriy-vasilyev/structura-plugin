/**
 * VisualsPage — the per-preset "Video" section (video-visuals handoff §1).
 *
 * Video styling moved out of the Video channel's Configure dialog and onto
 * the visual preset. This suite pins the wp-admin surface of that move:
 *
 *   1. Eligible plans (catalog says the Video channel is installable)
 *      render the full section — style preset cards, video art direction,
 *      caption placement, automatic brand-palette row — seeded from the
 *      bound preset's new fields.
 *   2. Ineligible plans get the compact locked teaser (`SectionGateTeaser`)
 *      with an "Upgrade plan" CTA carrying the `unlock_video` pricing
 *      intent — and none of the gated fields render.
 *   3. Unknown eligibility (catalog still loading / degraded / entry
 *      missing on an older cloud) renders neither — no teaser flash for
 *      paying customers, no premium editor leak.
 *   4. Saving persists the video fields through the existing preset save
 *      path (`content.video_style` / `video_art_direction` /
 *      `caption_placement` / `palette` on the wire).
 *   5. The video-field suggest fills `videoArtDirection` + `palette` from
 *      the visual suggest response WITHOUT clobbering the image prompt;
 *      the image-style suggest ALSO fills the video fields (one pass
 *      drafts both siblings, handoff §1).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) =>
    text.replace(/%s|%d/g, () => String(args.shift() ?? "")),
}));

const updateMock = vi.hoisted(() => vi.fn());
const suggestMock = vi.hoisted(() => ({ fn: vi.fn() }));
const eligibilityMock = vi.hoisted(() => ({
  current: "eligible" as "eligible" | "locked" | "unknown",
}));
const presetsMock = vi.hoisted(() => ({
  current: undefined as
    | { boundPresetId: string | null; presets: Array<Record<string, unknown>> }
    | undefined,
}));

vi.mock("@/features/settings", () => ({
  useDefaultProviders: () => ({ defaultImageProvider: "gemini" }),
  useLicense: () => ({
    plan: "cloud_pro",
    isPaidLicense: true,
    hasUsableLicense: true,
  }),
  useVisualPresetMutations: () => ({
    create: vi.fn(),
    update: updateMock,
    fork: vi.fn(),
    remove: vi.fn(),
    bind: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isForking: false,
    isRemoving: false,
    isBinding: false,
  }),
  useVisualPresetsQuery: () => ({ data: presetsMock.current, isLoading: false }),
  useVisualQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: suggestMock.fn, isSuggesting: false }),
}));

vi.mock("@/features/channels/hooks/useVideoStylingEligibility", () => ({
  useVideoStylingEligibility: () => eligibilityMock.current,
}));

// The shared suggest panel has its own suite — stub it to a button per
// instance (labelled by `toggleButtonLabel`) so this file can trigger the
// image-style and video-style suggests independently.
vi.mock("@/features/campaigns/components/SuggestStrategySection", () => ({
  SuggestStrategySection: ({
    onGenerate,
    toggleButtonLabel,
  }: {
    onGenerate: (provider: string, context: unknown[], medium?: string) => void;
    toggleButtonLabel: string;
  }) => (
    <button type="button" onClick={() => onGenerate("gemini", [])}>
      {toggleButtonLabel}
    </button>
  ),
}));

vi.mock("@/components/Layout/PageTitle", () => ({
  PageTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("@/components/Layout/PageSubtitle", () => ({
  PageDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

import { VisualsPage } from "../VisualsPage";

function boundPreset(overrides: Record<string, unknown> = {}) {
  return {
    presetId: "p1",
    workspaceId: "w1",
    label: "Default",
    globalArtDirection: "IMAGE STYLE PROMPT",
    aspectRatio: "16:9",
    format: "webp",
    optimizeOnUpload: true,
    medium: "photography",
    createdBy: "u1",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    boundActivationCount: 1,
    videoStyle: "kinetic",
    videoArtDirection: "FOOTAGE: real workplaces",
    captionPlacement: "middle",
    palette: ["#B36D33", "#111111", "#F9F9F9"],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <VisualsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  updateMock.mockReset().mockResolvedValue({ success: true });
  suggestMock.fn.mockReset();
  eligibilityMock.current = "eligible";
  presetsMock.current = { boundPresetId: "p1", presets: [boundPreset()] };
});

describe("VisualsPage — Video section (eligible plan)", () => {
  it("renders the Video section seeded from the bound preset's video fields", () => {
    renderPage();

    // Section head: title + premium plan badge.
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getByText("Cloud Pro")).toBeInTheDocument();

    // Style preset radiogroup with the three cards; preset's kinetic wins.
    const styleGroup = screen.getByRole("radiogroup", {
      name: /video style preset/i,
    });
    expect(styleGroup).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /clean/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /kinetic/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Video art direction textarea seeded from the preset.
    expect(
      screen.getByRole("textbox", { name: /video art direction/i }),
    ).toHaveValue("FOOTAGE: real workplaces");

    // Caption placement radiogroup; preset's middle wins.
    expect(
      screen.getByRole("radiogroup", { name: /caption placement/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /middle/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByText("Bottom feels native on Shorts, TikTok and Reels."),
    ).toBeInTheDocument();

    // Automatic palette pickup row — no toggle, just the explainer + swatches.
    expect(screen.getByText("Brand palette in captions")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /preset palette/i })).toBeInTheDocument();
  });

  it("persists video fields through the preset save path", async () => {
    renderPage();

    // Move captions to the bottom, then save the bound preset.
    fireEvent.click(screen.getByRole("radio", { name: /bottom/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          preset_id: "p1",
          content: expect.objectContaining({
            video_style: "kinetic",
            video_art_direction: "FOOTAGE: real workplaces",
            caption_placement: "bottom",
            palette: ["#B36D33", "#111111", "#F9F9F9"],
          }),
        }),
      );
    });
  });

  it("omits video fields from the save payload when the preset has none (nothing touched)", async () => {
    presetsMock.current = {
      boundPresetId: "p1",
      presets: [
        boundPreset({
          videoStyle: undefined,
          videoArtDirection: undefined,
          captionPlacement: undefined,
          palette: undefined,
        }),
      ],
    };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const content = updateMock.mock.calls[0][0].content as Record<string, unknown>;
    expect(content.video_style).toBeUndefined();
    expect(content.video_art_direction).toBeUndefined();
    expect(content.caption_placement).toBeUndefined();
    expect(content.palette).toBeUndefined();
  });

  it("video suggest fills videoArtDirection + palette without touching the image prompt", async () => {
    suggestMock.fn.mockResolvedValue({
      prompt: "NEW IMAGE STYLE",
      videoArtDirection: "NEW VIDEO DIRECTION",
      palette: ["#123456"],
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /suggest video style/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: /video art direction/i }),
      ).toHaveValue("NEW VIDEO DIRECTION"),
    );
    // The image prompt is a sibling, never merged — the video suggest
    // must not replace it.
    expect(
      screen.getByRole("textbox", { name: /global art direction/i }),
    ).toHaveValue("IMAGE STYLE PROMPT");

    // The drafted palette rides the next save.
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            video_art_direction: "NEW VIDEO DIRECTION",
            palette: ["#123456"],
          }),
        }),
      );
    });
  });

  it("image suggest also fills the video art direction + palette (one pass, both siblings)", async () => {
    suggestMock.fn.mockResolvedValue({
      prompt: "NEW IMAGE STYLE",
      videoArtDirection: "NEW VIDEO DIRECTION",
      palette: ["#ABCDEF"],
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /suggest image style/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: /global art direction/i }),
      ).toHaveValue("NEW IMAGE STYLE"),
    );
    expect(
      screen.getByRole("textbox", { name: /video art direction/i }),
    ).toHaveValue("NEW VIDEO DIRECTION");
  });
});

describe("VisualsPage — Video section gating", () => {
  it("renders the locked teaser (and none of the fields) for ineligible plans", () => {
    eligibilityMock.current = "locked";
    renderPage();

    expect(screen.getByText("Video styling")).toBeInTheDocument();
    const upgrade = screen.getByRole("link", { name: /upgrade plan/i });
    expect(upgrade).toHaveAttribute(
      "href",
      expect.stringContaining("intent=unlock_video"),
    );

    // Gated fields are neither rendered nor fetched.
    expect(
      screen.queryByRole("radiogroup", { name: /video style preset/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /video art direction/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: /caption placement/i }),
    ).toBeNull();
  });

  it("renders neither section nor teaser while eligibility is unknown", () => {
    eligibilityMock.current = "unknown";
    renderPage();

    expect(screen.queryByText("Video styling")).toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: /video style preset/i }),
    ).toBeNull();
  });
});
