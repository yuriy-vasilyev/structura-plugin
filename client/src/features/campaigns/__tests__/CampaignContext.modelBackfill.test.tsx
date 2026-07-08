/**
 * Tests for the form-provider-level model backfill (`useModelBackfill`
 * in CampaignContext.tsx).
 *
 * Why this exists: the only backfill used to live in mount effects
 * inside `<CampaignAiEngineSection>` / `<ProviderToggle>` — components
 * tucked into the collapsed Advanced Settings group. A campaign created
 * without ever expanding it persisted `textModel: ""` and every run
 * leaned on the cloud's silent fallback ("[engine] Empty textModel on
 * campaign", observed on BYOK 2026-06-04). The backfill now runs at the
 * form-provider level so the create/update payload always carries a
 * concrete model.
 *
 * What's pinned:
 *   - source priority: workspace per-provider model (the one the user
 *     picked in the AI Engine setup wizard) beats the catalog default —
 *     matching what the onboarding wizard seeds via `useFinishWizard`;
 *   - catalog fallback when the workspace has no model for the provider;
 *   - user-chosen models are never clobbered;
 *   - managed (cloud) plans are skipped entirely;
 *   - the create-flow fill does NOT mark the persisted draft as
 *     user-touched (`lastUpdatedAt` stays null) so the "Resume draft"
 *     banner and the license-defaults bootstrap keep working.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useLicenseMock = vi.hoisted(() => vi.fn());
const useDefaultProvidersMock = vi.hoisted(() => vi.fn());
const useAiSettingsQueryMock = vi.hoisted(() => vi.fn());
const useAvailableModelsQueryMock = vi.hoisted(() => vi.fn());
const useSiteAnalysisQueryMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/features/site/api/useSiteAnalysis", () => ({
  useSiteAnalysisQuery: useSiteAnalysisQueryMock,
}));

import { CampaignProvider, useCampaignForm } from "../context/CampaignContext";
import { useCampaignDraftStore } from "../context/draftStore";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import type { CampaignFormData } from "../types";

const Probe = () => {
  const { formData } = useCampaignForm();
  return (
    <div>
      <span data-testid="text-model">{formData.intelligence.textModel}</span>
      <span data-testid="image-model">{formData.intelligence.imageModel}</span>
    </div>
  );
};

const AI_SETTINGS = {
  providers: {
    openai: {
      connected: true,
      masked_key: "sk-...x",
      capabilities: ["text", "image"],
      text_model: "gpt-workspace-text",
      image_model: "gpt-workspace-image",
    },
    // Connected but no models chosen — exercises the catalog fallback.
    gemini: {
      connected: true,
      masked_key: "AIz...x",
      capabilities: ["text", "image"],
      text_model: "",
      image_model: "",
    },
  },
};

const CATALOG = {
  defaults: {
    openai: { text: "gpt-catalog-text", image: "gpt-catalog-image", fast: "gpt-fast" },
    gemini: { text: "gemini-catalog-text", image: "gemini-catalog-image", fast: "gemini-fast" },
  },
  text: [],
  image: [],
};

function setup(opts: { isCloud?: boolean; hydrated?: boolean } = {}) {
  const { isCloud = false, hydrated = true } = opts;
  useLicenseMock.mockReturnValue({
    isLicensed: true,
    isPaidLicense: true,
    plan: isCloud ? "cloud" : "byok_agency",
  });
  useDefaultProvidersMock.mockReturnValue({
    isCloud,
    defaultTextProvider: "openai",
    defaultImageProvider: "openai",
  });
  useAiSettingsQueryMock.mockReturnValue({ data: hydrated ? AI_SETTINGS : undefined });
  useAvailableModelsQueryMock.mockReturnValue({ data: hydrated ? CATALOG : undefined });
  useSiteAnalysisQueryMock.mockReturnValue({ data: undefined });
}

/** Edit-mode form data — drives the LocalCampaignProvider branch. */
const editData = (
  intelligence: Partial<CampaignFormData["intelligence"]>,
): CampaignFormData => ({
  ...DEFAULT_CAMPAIGN_FORM_DATA,
  intelligence: { ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence, ...intelligence },
});

const renderEdit = (intelligence: Partial<CampaignFormData["intelligence"]>) =>
  render(
    <CampaignProvider initialData={editData(intelligence)} mode="campaign">
      <Probe />
    </CampaignProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useCampaignDraftStore.setState({
    formData: DEFAULT_CAMPAIGN_FORM_DATA,
    activeStep: "interview",
    completedSteps: [],
    skippedSteps: [],
    lastUpdatedAt: null,
  });
});

describe("useModelBackfill — edit mode (LocalCampaignProvider)", () => {
  it("fills empty models from the workspace per-provider choice (beats catalog default)", () => {
    setup();
    renderEdit({ textProvider: "openai", imageProvider: "openai", textModel: "", imageModel: "" });
    expect(screen.getByTestId("text-model").textContent).toBe("gpt-workspace-text");
    expect(screen.getByTestId("image-model").textContent).toBe("gpt-workspace-image");
  });

  it("falls back to the catalog default when the workspace has no model for the provider", () => {
    setup();
    renderEdit({ textProvider: "gemini", imageProvider: "gemini", textModel: "", imageModel: "" });
    expect(screen.getByTestId("text-model").textContent).toBe("gemini-catalog-text");
    expect(screen.getByTestId("image-model").textContent).toBe("gemini-catalog-image");
  });

  it("never clobbers a model the user already picked", () => {
    setup();
    renderEdit({
      textProvider: "openai",
      imageProvider: "openai",
      textModel: "my-pinned-text",
      imageModel: "my-pinned-image",
    });
    expect(screen.getByTestId("text-model").textContent).toBe("my-pinned-text");
    expect(screen.getByTestId("image-model").textContent).toBe("my-pinned-image");
  });

  it("skips managed (cloud) plans — models resolve server-side", () => {
    setup({ isCloud: true });
    renderEdit({ textProvider: "openai", imageProvider: "openai", textModel: "", imageModel: "" });
    expect(screen.getByTestId("text-model").textContent).toBe("");
    expect(screen.getByTestId("image-model").textContent).toBe("");
  });

  it("leaves models empty until sources hydrate (server fallback covers the gap)", () => {
    setup({ hydrated: false });
    renderEdit({ textProvider: "openai", imageProvider: "openai", textModel: "", imageModel: "" });
    expect(screen.getByTestId("text-model").textContent).toBe("");
    expect(screen.getByTestId("image-model").textContent).toBe("");
  });
});

describe("useModelBackfill — create flow (PersistedCampaignProvider)", () => {
  it("fills models on the draft WITHOUT marking it user-touched", () => {
    setup();
    render(
      <CampaignProvider mode="campaign">
        <Probe />
      </CampaignProvider>,
    );
    // Providers seed from useDefaultProviders ("openai") via the
    // license-defaults bootstrap; the backfill then resolves that
    // provider's workspace models.
    expect(screen.getByTestId("text-model").textContent).toBe("gpt-workspace-text");
    expect(screen.getByTestId("image-model").textContent).toBe("gpt-workspace-image");
    // The wire payload reads from the same store — pin it directly.
    const state = useCampaignDraftStore.getState();
    expect(state.formData.intelligence.textModel).toBe("gpt-workspace-text");
    // System fill must not trip the "Resume draft" banner or lock out
    // the license-defaults bootstrap.
    expect(state.lastUpdatedAt).toBeNull();
  });
});
