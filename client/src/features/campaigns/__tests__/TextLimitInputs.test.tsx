/**
 * Character bounds on the wp-admin brief and topic inputs (2026-11-12 cost
 * audit): the campaign objective on Create and Edit carries `maxLength`
 * 4,000 and the Generate a Post topic 1,000, on every plan. The cloud cuts
 * whatever an older build sends; the input stops the customer from typing
 * past what will be used.
 *
 * Real pages, real form context. Mocked: the network edge
 * (`@wordpress/api-fetch`) and the settings / personas / presets data hooks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { ToastProvider } from "@structura/ui";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _x: (t: string) => t,
  _n: (single: string, plural: string, n: number) => (n === 1 ? single : plural),
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

const h = vi.hoisted(() => ({
  license: {} as Record<string, unknown>,
  campaign: null as Record<string, unknown> | null,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => h.license,
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useSeoRules: () => ({ rules: null, isLoading: false }),
  useAiConnections: () => ({
    activeProviders: ["openai"],
    textProviders: ["openai"],
    imageProviders: ["openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    isLoading: false,
    isFetching: false,
  }),
  useDefaultProviders: () => ({
    defaultTextProvider: "openai",
    defaultImageProvider: "openai",
    availableProviders: ["openai"],
    availableImageProviders: ["openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: true,
    hasExplicitTextDefault: true,
    hasExplicitImageDefault: true,
    hasMultipleProviders: false,
    isAutoResolved: false,
    isFullyConfigured: true,
    isCloud: false,
  }),
}));

vi.mock("@/features/personas", () => {
  const personas = () => ({ data: [{ id: "p1", name: "House voice" }], isLoading: false });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});
vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));
vi.mock("@/features/ai-engine", () => ({ useAiSettingsQuery: () => ({ data: {} }) }));
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({ data: undefined }),
}));
vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: { boundPresetId: null, presets: [] }, isLoading: false }),
}));
vi.mock("@/features/campaigns/api/useCampaignQuery", () => ({
  useCampaignQuery: () => ({ data: h.campaign, isLoading: false, dataUpdatedAt: 1 }),
}));

import CreateCampaignPage from "../routes/CreateCampaignPage";
import EditCampaignPage from "../routes/EditCampaignPage";
import GeneratePostPage from "../routes/GeneratePostPage";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import { useCampaignDraftStore } from "../context/draftStore";

function renderAt(path: string, routePath: string, element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const PLANS = [
  { plan: "free", isPaidLicense: false },
  { plan: "byok", isPaidLicense: true },
  { plan: "cloud", isPaidLicense: true },
];

beforeEach(() => {
  h.campaign = null;
  useCampaignDraftStore.getState().discardDraft();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async () => []);
});

describe.each(PLANS)("wp-admin text bounds on $plan", ({ plan, isPaidLicense }) => {
  beforeEach(() => {
    h.license = { isPaidLicense, isLicensed: true, plan, hasUsableLicense: true };
  });

  it("Create campaign: the objective takes at most 4,000 characters", async () => {
    renderAt("/campaigns/new", "/campaigns/new", <CreateCampaignPage />);
    const objective = (await screen.findByLabelText("Campaign Objective")) as HTMLTextAreaElement;
    expect(objective.maxLength).toBe(4000);
  });

  it("Edit campaign: the objective takes at most 4,000 characters", async () => {
    h.campaign = { id: "c1", status: "active", ...DEFAULT_CAMPAIGN_FORM_DATA };
    renderAt("/campaigns/c1/edit", "/campaigns/:id/edit", <EditCampaignPage />);
    const objective = (await screen.findByLabelText("Campaign Objective")) as HTMLTextAreaElement;
    expect(objective.maxLength).toBe(4000);
  });

  it("Generate a Post: the topic takes at most 1,000 characters", async () => {
    renderAt("/", "/", <GeneratePostPage />);
    const topic = (await screen.findByLabelText(
      "Describe your post topic or objective"
    )) as HTMLTextAreaElement;
    expect(topic.maxLength).toBe(1000);
  });
});
