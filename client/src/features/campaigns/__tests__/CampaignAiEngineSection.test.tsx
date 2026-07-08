/**
 * Tests for the BYOK "image generation is on but no image model selected"
 * conflict warning in `<CampaignAiEngineSection>`.
 *
 * Why this exists: a campaign created with defaults persisted
 * `imageModel: ""` while featured/body image generation was enabled. On
 * BYOK that produced "Model must be specified for BYOK users." and both
 * image slots failed silently at publish time (2026-05-27). The cloud now
 * backfills a default model so it no longer hard-fails, but we surface the
 * gap in the editor so the user picks the model they actually want instead
 * of inheriting a default they never saw.
 *
 * The condition is BYOK-only (`!isCloud`) AND image gen enabled
 * (`structure.featuredImage || structure.bodyImages`) AND no
 * `intelligence.imageModel`. These pin all three legs plus the managed
 * exclusion.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useLicenseMock = vi.hoisted(() => vi.fn());
const useDefaultProvidersMock = vi.hoisted(() => vi.fn());
const useAvailableModelsQueryMock = vi.hoisted(() => vi.fn());
const useAiSettingsQueryMock = vi.hoisted(() => vi.fn());
const useCampaignFormMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/settings", () => ({
  useLicense: useLicenseMock,
  useDefaultProviders: useDefaultProvidersMock,
}));
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: useAiSettingsQueryMock,
}));
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: useAvailableModelsQueryMock,
}));
vi.mock("@/features/ai-engine/helpers", () => ({
  maybeGetModelWarning: () => undefined,
}));
vi.mock("@/features/campaigns/context/CampaignContext", () => ({
  useCampaignForm: useCampaignFormMock,
}));

import { CampaignAiEngineSection } from "../components/CampaignAiEngineSection";

const WARNING = /no image model is selected/i;

function setup(opts: {
  isCloud?: boolean;
  featuredImage?: boolean;
  bodyImages?: boolean;
  imageModel?: string;
}) {
  const {
    isCloud = false,
    featuredImage = true,
    bodyImages = false,
    imageModel = "",
  } = opts;

  useLicenseMock.mockReturnValue({
    isLicensed: true,
    plan: isCloud ? "cloud" : "byok",
    isPaidLicense: true,
  });
  useDefaultProvidersMock.mockReturnValue({
    isCloud,
    // Keep the settings-level "Model not selected" warning OFF so we
    // isolate the new campaign-level conflict warning.
    isProviderIncomplete: () => false,
  });
  useAvailableModelsQueryMock.mockReturnValue({
    data: {
      defaults: {
        gemini: { text: "gemini-text", fast: "gemini-fast", image: "gemini-image" },
        openai: { text: "openai-text", fast: "openai-fast", image: "openai-image" },
      },
      text: [{ id: "gemini-text", name: "Gemini Text", provider: "gemini" }],
      image: [{ id: "gemini-image", name: "Gemini Image", provider: "gemini" }],
    },
  });
  useAiSettingsQueryMock.mockReturnValue({ data: { providers: {} } });
  useCampaignFormMock.mockReturnValue({
    formData: {
      intelligence: {
        textProvider: "gemini",
        imageProvider: "gemini",
        textModel: "gemini-text",
        imageModel,
        fallbackTextProvider: null,
        fallbackImageProvider: null,
      },
      schedule: { pregenerationEnabled: true },
      structure: { featuredImage, bodyImages },
    },
    updateForm: vi.fn(),
  });
}

function renderSection() {
  return render(
    <CampaignAiEngineSection
      availableTextProviders={["gemini", "openai"]}
      availableImageProviders={["gemini", "openai"]}
    />,
  );
}

describe("<CampaignAiEngineSection> image-model conflict warning", () => {
  it("warns when BYOK has featured-image gen on but no image model", () => {
    setup({ featuredImage: true, bodyImages: false, imageModel: "" });
    renderSection();
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("warns when only body-image gen is on (no image model)", () => {
    setup({ featuredImage: false, bodyImages: true, imageModel: "" });
    renderSection();
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("does NOT warn once an image model is selected", () => {
    setup({ featuredImage: true, imageModel: "gemini-image" });
    renderSection();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("does NOT warn when image generation is switched off", () => {
    setup({ featuredImage: false, bodyImages: false, imageModel: "" });
    renderSection();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("does NOT warn on managed tier (model is resolved server-side)", () => {
    setup({ isCloud: true, featuredImage: true, imageModel: "" });
    renderSection();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
