/**
 * AI-label reminder in wp-admin (specs/ai-image-label.md §7, 2026-10-05):
 * a non-blocking notice by the image switches when images are on, the
 * site's medium is photography, the campaign language is an EU language and
 * the bound preset's AI label is off. The decision is truth-tabled in
 * packages/ui (`shouldShowAiLabelReminder`); this file pins the hosts.
 *
 * Real pages, real form context, real reminder and fallback notice. Mocked:
 * the network edge (`@wordpress/api-fetch`) and the settings / personas /
 * presets data hooks.
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
  license: {
    isPaidLicense: true,
    isLicensed: true,
    plan: "byok",
    hasUsableLicense: true,
  } as Record<string, unknown>,
  /** What `get_bloginfo('language')` reports for this install. */
  siteLanguage: "de-DE",
  boundPresetId: "preset-1" as string | null,
  preset: { medium: "photography", aiLabel: false } as Record<string, unknown>,
  campaign: null as Record<string, unknown> | null,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => h.license,
  usePublicSiteProfile: () => ({ data: { language: h.siteLanguage }, isLoading: false }),
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
    isFullyConfigured: false,
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
  useVisualPresetsQuery: () => ({
    data: {
      success: true,
      boundPresetId: h.boundPresetId,
      presets: h.boundPresetId ? [{ presetId: h.boundPresetId, ...h.preset }] : [],
    },
    isLoading: false,
  }),
}));
vi.mock("@/features/campaigns/api/useCampaignQuery", () => ({
  useCampaignQuery: () => ({ data: h.campaign, isLoading: false, dataUpdatedAt: 1 }),
}));

import CreateCampaignPage from "../routes/CreateCampaignPage";
import EditCampaignPage from "../routes/EditCampaignPage";
import GeneratePostPage from "../routes/GeneratePostPage";
import { StepArchitecture } from "../components/steps/StepArchitecture";
import { CampaignProvider } from "../context/CampaignContext";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import { useCampaignDraftStore } from "../context/draftStore";
import type { CampaignFormData } from "../types";

const TITLE = "Photo-style images may need an AI label";
const FALLBACK = "Images will use a generic style";

function renderAt(path: string, routePath: string, element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
            <Route path="*" element={<div>elsewhere</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function formData(over: {
  language?: string;
  featuredImage?: boolean;
  bodyImages?: boolean;
}): CampaignFormData {
  return {
    ...DEFAULT_CAMPAIGN_FORM_DATA,
    intelligence: {
      ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence,
      textProvider: "openai",
      imageProvider: "openai",
      language: over.language ?? "de",
    },
    structure: {
      ...DEFAULT_CAMPAIGN_FORM_DATA.structure,
      featuredImage: over.featuredImage ?? true,
      bodyImages: over.bodyImages ?? false,
    },
  };
}

/** Opens Advanced Settings, then its Images group (both start collapsed). */
const openAdvanced = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Advanced Settings/ }));
  fireEvent.click(await screen.findByRole("button", { name: /^Images$/ }));
};
const featuredToggle = () => screen.getByRole("switch", { name: "Generate featured image" });
const bodyLabel = () => screen.getAllByText("Body image generation")[0];

const expectFollows = (first: HTMLElement, second: HTMLElement) =>
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

beforeEach(() => {
  h.license = { isPaidLicense: true, isLicensed: true, plan: "byok", hasUsableLicense: true };
  h.siteLanguage = "de-DE";
  h.boundPresetId = "preset-1";
  h.preset = { medium: "photography", aiLabel: false };
  h.campaign = null;
  useCampaignDraftStore.getState().discardDraft();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async () => []);
});

describe("AiLabelReminder · wp-admin Create campaign", () => {
  it("shows by the image toggles for a German site with photography and the label off", async () => {
    renderAt("/campaigns/new", "/campaigns/new", <CreateCampaignPage />);
    await openAdvanced();
    // A fresh form may start with images off; turn the featured image on.
    if (featuredToggle().getAttribute("aria-checked") !== "true") fireEvent.click(featuredToggle());
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expectFollows(bodyLabel(), screen.getByText(TITLE));
    expect(screen.getByRole("button", { name: /Turn it on in Visuals/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Learn more/ })).toHaveAttribute(
      "href",
      "https://docs.structurawp.com/en/using/generated-posts/visuals#ai-label"
    );
  });

  it("'Turn it on in Visuals' goes to the Visuals route", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/campaigns/new"]}>
            <Routes>
              <Route path="/campaigns/new" element={<CreateCampaignPage />} />
              <Route path="/visuals" element={<div>visuals route</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    await openAdvanced();
    if (featuredToggle().getAttribute("aria-checked") !== "true") fireEvent.click(featuredToggle());
    fireEvent.click(await screen.findByRole("button", { name: /Turn it on in Visuals/ }));
    expect(await screen.findByText("visuals route")).toBeInTheDocument();
  });

  it("with no bound preset both notices show, the fallback first", async () => {
    h.boundPresetId = null;
    renderAt("/campaigns/new", "/campaigns/new", <CreateCampaignPage />);
    await openAdvanced();
    if (featuredToggle().getAttribute("aria-checked") !== "true") fireEvent.click(featuredToggle());
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expectFollows(screen.getByText(FALLBACK), screen.getByText(TITLE));
  });
});

describe("AiLabelReminder · wp-admin Edit campaign", () => {
  const editCampaign = (over: Parameters<typeof formData>[0]) => {
    const data = formData(over);
    h.campaign = {
      id: "c1",
      status: "active",
      ...data,
    };
  };
  const renderEdit = () =>
    renderAt("/campaigns/c1/edit", "/campaigns/:id/edit", <EditCampaignPage />);

  it("shows for a German campaign with photography and the label off", async () => {
    editCampaign({});
    renderEdit();
    await openAdvanced();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expectFollows(bodyLabel(), screen.getByText(TITLE));
  });

  it.each<[string, () => void]>([
    ["English", () => editCampaign({ language: "en" })],
    [
      "illustration",
      () => {
        editCampaign({});
        h.preset = { medium: "illustration", aiLabel: false };
      },
    ],
    ["both image toggles off", () => editCampaign({ featuredImage: false, bodyImages: false })],
    [
      "the label on",
      () => {
        editCampaign({});
        h.preset = { medium: "photography", aiLabel: true };
      },
    ],
  ])("absent for %s", async (_name, arrange) => {
    arrange();
    renderEdit();
    await openAdvanced();
    await screen.findAllByText("Body image generation");
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("the default language resolves to the site's", async () => {
    editCampaign({ language: "default" });
    h.siteLanguage = "fr-FR";
    renderEdit();
    await openAdvanced();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
  });

  it("the default language on an English site stays quiet", async () => {
    editCampaign({ language: "default" });
    h.siteLanguage = "en-US";
    renderEdit();
    await openAdvanced();
    await screen.findAllByText("Body image generation");
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("goes away when the toggles are switched off (no dismiss, no persistence)", async () => {
    editCampaign({});
    renderEdit();
    await openAdvanced();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
    fireEvent.click(featuredToggle());
    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
  });
});

describe("AiLabelReminder · wp-admin Generate Post", () => {
  it("shows after the image switches on a German site", async () => {
    renderAt("/generate", "/generate", <GeneratePostPage />);
    // The page may open with images off; switch the featured image on.
    const featured = await screen.findByRole("switch", { name: "Featured image" });
    if (featured.getAttribute("aria-checked") !== "true") fireEvent.click(featured);
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expectFollows(screen.getByRole("switch", { name: "Body images" }), screen.getByText(TITLE));
  });

  it("with no bound preset the fallback notice still comes first", async () => {
    h.boundPresetId = null;
    renderAt("/generate", "/generate", <GeneratePostPage />);
    const featured = await screen.findByRole("switch", { name: "Featured image" });
    if (featured.getAttribute("aria-checked") !== "true") fireEvent.click(featured);
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expectFollows(screen.getByText(FALLBACK), screen.getByText(TITLE));
  });

  it("absent on an English site", async () => {
    h.siteLanguage = "en-US";
    renderAt("/generate", "/generate", <GeneratePostPage />);
    const featured = await screen.findByRole("switch", { name: "Featured image" });
    if (featured.getAttribute("aria-checked") !== "true") fireEvent.click(featured);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });
});

describe("AiLabelReminder · new-schedule modal (StepArchitecture)", () => {
  const renderStep = (data: CampaignFormData) =>
    renderAt(
      "/",
      "/",
      <CampaignProvider initialData={data} mode="campaign">
        <StepArchitecture />
      </CampaignProvider>
    );

  it("shows under the image cards for a German campaign", async () => {
    renderStep(formData({}));
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expectFollows(bodyLabel(), screen.getByText(TITLE));
  });

  it("absent with both image cards off", async () => {
    renderStep(formData({ featuredImage: false, bodyImages: false }));
    await screen.findAllByText("Body image generation");
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("shows on the Free plan too: no plan check", async () => {
    h.license = { isPaidLicense: false, isLicensed: true, plan: "free", hasUsableLicense: true };
    renderStep(formData({}));
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
  });
});
