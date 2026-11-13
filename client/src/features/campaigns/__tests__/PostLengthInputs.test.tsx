/**
 * Post Length inputs in wp-admin (2026-11-12). Paid campaigns took any
 * length, so a Cloud site could save 1,000,000 words and run every
 * generation to the output-token cap. The three inputs (the new-schedule
 * modal's StepArchitecture, the Create / Edit CoreContentSettings panel and
 * the Generate a Post page) now carry the plan's range: typing past the
 * ceiling caps at it (paid 3000, Free 500) and the 300 floor applies on
 * blur, through the shared `clampPostLength`.
 *
 * Real components, real form context. Mocked: the network edge
 * (`@wordpress/api-fetch`) and the settings / personas / presets data hooks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));

const PAID = { isPaidLicense: true, isLicensed: true, plan: "byok", hasUsableLicense: true };
const FREE = { isPaidLicense: false, isLicensed: true, plan: "free", hasUsableLicense: true };

// StepArchitecture reads the hook from its module, the rest from the barrel.
vi.mock("@/features/settings/api/useLicense", () => ({ useLicense: () => h.license }));
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

import GeneratePostPage from "../routes/GeneratePostPage";
import { StepArchitecture } from "../components/steps/StepArchitecture";
import { CoreContentSettings } from "../components/CoreContentSettings";
import { CampaignProvider } from "../context/CampaignContext";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import { useCampaignDraftStore } from "../context/draftStore";

function renderAt(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={element} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const inCampaignForm = (child: React.ReactNode) => (
  <CampaignProvider initialData={DEFAULT_CAMPAIGN_FORM_DATA} mode="campaign">
    {child}
  </CampaignProvider>
);

const HOSTS = [
  {
    name: "StepArchitecture (new-schedule modal)",
    render: () => renderAt(inCampaignForm(<StepArchitecture />)),
    input: () => screen.getByLabelText("Target Word Count") as HTMLInputElement,
  },
  {
    name: "CoreContentSettings (Create / Edit campaign)",
    render: () => renderAt(inCampaignForm(<CoreContentSettings />)),
    input: () => screen.getByLabelText("Words") as HTMLInputElement,
  },
  {
    name: "GeneratePostPage",
    render: () => renderAt(<GeneratePostPage />),
    input: () => screen.getByLabelText("Post Length") as HTMLInputElement,
  },
];

beforeEach(() => {
  h.license = PAID;
  useCampaignDraftStore.getState().discardDraft();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async () => []);
});

describe.each(HOSTS)("Post Length · $name", ({ render: renderHost, input }) => {
  it("paid: carries 300–3000 and caps typing at 3000", async () => {
    renderHost();
    const field = await waitFor(input);
    expect(field.min).toBe("300");
    expect(field.max).toBe("3000");

    fireEvent.change(field, { target: { value: "50000" } });
    expect(input().value).toBe("3000");

    fireEvent.change(input(), { target: { value: "2400" } });
    expect(input().value).toBe("2400");
  });

  it("paid: lifts a length under 300 to 300 on blur, not while typing", async () => {
    renderHost();
    const field = await waitFor(input);

    fireEvent.change(field, { target: { value: "5" } });
    expect(input().value).toBe("5");
    fireEvent.blur(input());
    expect(input().value).toBe("300");
  });

  it("free: carries 300–500 and caps typing at 500", async () => {
    h.license = FREE;
    renderHost();
    const field = await waitFor(input);
    expect(field.max).toBe("500");

    fireEvent.change(field, { target: { value: "2700" } });
    expect(input().value).toBe("500");
    fireEvent.blur(input());
    expect(input().value).toBe("500");
  });
});
