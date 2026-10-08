/**
 * New campaign: skipping keywords is an explicit choice (2026-10-08,
 * specs/empty-keyword-campaigns.md §6).
 *
 * A Free campaign ("Content Posting") ran on its campaign NAME because the
 * keyword step was an empty screen the user walked past. A campaign with no
 * keywords now picks each post's topic from its objective, and the wizard
 * says so: the step offers "Skip, write from the objective" wherever it would
 * otherwise be empty, and the summary names the choice. What this pins:
 *
 *   1. Free: the teaser's secondary action is the skip choice, with the hint,
 *      and it marks the step skipped and moves on.
 *   2. Paid, discovery came back empty: the action bar's primary button is the
 *      skip choice instead of the continue button, the hint shows, and the step
 *      lands skipped with an empty bank, never complete.
 *   3. Paid with keywords: the action bar is unchanged.
 *   4. Summary: an empty bank reads "From the objective".
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings / personas
 * data hooks are mocked, as in CreateCampaignSetupStep.test.tsx. The real
 * page, the real StepKeywords, the real form context and the real draft store
 * run.
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
  license: { isPaidLicense: false, isLicensed: true, plan: "free" } as Record<
    string,
    unknown
  >,
  /** Keywords the mocked discovery endpoint answers with. */
  discovered: [] as Array<{ keyword: string; source: string; usageCount: number }>,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => h.license,
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useSeoRules: () => ({ rules: null, isLoading: false }),
  useAiConnections: () => ({ textProviders: ["openai"] }),
  useDefaultProviders: () => ({
    defaultTextProvider: "openai",
    defaultImageProvider: "openai",
    availableProviders: ["openai"],
    availableImageProviders: ["openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: true,
    hasMultipleProviders: false,
    isFullyConfigured: true,
    isCloud: false,
  }),
}));

vi.mock("@/features/personas", () => {
  const personas = () => ({
    data: [{ id: "p1", name: "House voice" }],
    isLoading: false,
  });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/features/ai-engine", () => ({ useAiSettingsQuery: () => ({ data: {} }) }));
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({ data: undefined }),
}));

import CreateCampaignPage from "../routes/CreateCampaignPage";
import { useCampaignDraftStore } from "../context/draftStore";

const DISCOVER_PATH = "/structura/v1/scheduler/discover-keywords";
const SKIP = "Skip, write from the objective";
const HINT =
  "Without keywords, each post picks a new topic from your objective and skips topics this site already covers.";

const renderWizard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/campaigns/new"]}>
          <Routes>
            <Route path="/campaigns/new" element={<CreateCampaignPage />} />
            <Route path="*" element={<div>elsewhere</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

/** Open the wizard on `step`, as a resumed draft would. */
const openOn = (step: string, completed: string[] = ["setup"]) => {
  useCampaignDraftStore.setState({ activeStep: step, completedSteps: completed });
  renderWizard();
};

const store = () => useCampaignDraftStore.getState();

beforeEach(() => {
  // Moving between steps scrolls to the top; jsdom has no scrolling.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  h.license = { isPaidLicense: false, isLicensed: true, plan: "free" };
  h.discovered = [];
  useCampaignDraftStore.getState().discardDraft();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
    if (opts?.path === DISCOVER_PATH) {
      return {
        success: true,
        keywords: h.discovered,
        meta: { path: "legacy", resolvedMode: "authority", kdCeiling: null },
      };
    }
    return [];
  });
});

describe("New campaign: keywords step, Free", () => {
  it("offers the skip choice with the hint, and skipping moves on with the step marked skipped", async () => {
    openOn("keywords");

    const skip = await screen.findByRole("button", { name: SKIP });
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip & continue" })).toBeNull();

    fireEvent.click(skip);

    await waitFor(() => expect(store().activeStep).not.toBe("keywords"));
    expect(store().skippedSteps).toContain("keywords");
    // Free cannot discover: no keyword research call went out.
    expect(apiFetchMock.mock.calls.some(([o]) => o?.path === DISCOVER_PATH)).toBe(false);
  });
});

describe("New campaign: keywords step, paid", () => {
  beforeEach(() => {
    h.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
  });

  it("discovery came back empty: the primary action is the skip choice and the step lands skipped", async () => {
    // The step had been completed once (with keywords) before the user came
    // back and ended up with none: the skip must not leave it marked complete.
    openOn("keywords", ["setup", "keywords"]);

    const skip = await screen.findByRole("button", { name: SKIP });
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Looks good — continue" })).toBeNull();

    fireEvent.click(skip);

    await waitFor(() => expect(store().activeStep).not.toBe("keywords"));
    expect(store().skippedSteps).toContain("keywords");
    expect(store().completedSteps).not.toContain("keywords");
    expect(store().formData.keywords?.bank).toEqual([]);
    expect(store().formData.keywords?.discoveredAt).toBeNull();
  });

  it("with keywords the action bar is unchanged and there is no skip choice", async () => {
    h.discovered = [
      { keyword: "google business profile verification", source: "ai_generated", usageCount: 0 },
      { keyword: "fix google business listing", source: "ai_generated", usageCount: 0 },
    ];
    openOn("keywords");

    expect(await screen.findByRole("button", { name: "Looks good — continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SKIP })).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe("New campaign: summary", () => {
  it("names the choice for an empty bank instead of 'None'", async () => {
    openOn("summary", ["setup", "rhythm"]);

    expect(await screen.findByText("Campaign Summary")).toBeInTheDocument();
    expect(screen.getByText("From the objective")).toBeInTheDocument();
  });
});
