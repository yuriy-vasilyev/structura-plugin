/**
 * SiteCompetitorsTab — AI fallback + save semantics (paid tier).
 *
 * The settings page is passive — it does NOT discover on mount. When the
 * user clicks Re-discover and that DFS pass surfaces zero SERP competitors,
 * the tab falls back to AI-guessed peers and labels them honestly (info
 * banner). Adopting them is local; Save commits once. Pins the no-auto-run,
 * the manual fallback, and the no-request-per-change behaviour.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) =>
    text.replace(/%s|%d/g, () => String(args.shift() ?? "")),
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: "cloud", isPaidLicense: true }),
}));

const aiMutateAsync = vi.hoisted(() =>
  vi.fn(async () => ({
    suggestions: [{ domain: "asana.com", rationale: "Same audience as you." }],
  })),
);
vi.mock("@/features/onboarding", () => ({
  useSuggestWizardCompetitorsMutation: () => ({
    mutateAsync: aiMutateAsync,
    isPending: false,
  }),
  useWizardPositioningQuery: () => ({ data: undefined }),
}));

const updateMutate = vi.hoisted(() => vi.fn());
const analyzeMutate = vi.hoisted(() => vi.fn());
const analysisQueryMock = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock("../api/useSiteAnalysis", () => ({
  useSiteAnalysisQuery: () => analysisQueryMock.current,
  useAnalyzeSiteMutation: () => ({ mutate: analyzeMutate, isPending: false }),
  useUpdateSiteSeoSettingsMutation: () => ({
    mutate: updateMutate,
    isPending: false,
  }),
}));

import { SiteCompetitorsTab } from "../routes/tabs/SiteCompetitorsTab";

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/site/competitors"]}>
        <SiteCompetitorsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  updateMutate.mockReset();
  aiMutateAsync.mockClear();
  // A manual re-discover re-runs DFS; here it returns no SERP competitors so
  // the AI fallback should kick in (via the mutation's onSuccess).
  analyzeMutate.mockReset();
  analyzeMutate.mockImplementation(
    (_input: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ suggestedCompetitors: [] });
    },
  );
  analysisQueryMock.current = {
    data: {
      capturedAt: "2026-06-01T00:00:00Z", // analysis HAS run
      suggestedCompetitors: [], // ...but DFS found nothing
      seoIntelSettings: { competitorUrls: [] },
    },
    isLoading: false,
    isFetching: false,
  };
});

describe("SiteCompetitorsTab AI fallback", () => {
  it("does NOT auto-discover on mount, but a manual re-discover falls back to AI guesses, and Save commits locally-adopted picks", async () => {
    renderTab();

    // The settings page is passive — no discovery runs on its own.
    expect(aiMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("asana.com")).toBeNull();

    // User clicks Re-discover → DFS pass surfaces nothing → AI fallback fires.
    fireEvent.click(screen.getByRole("button", { name: /re-discover/i }));
    expect(await screen.findByText("asana.com")).toBeInTheDocument();
    expect(aiMutateAsync).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/these are AI suggestions based on what you do/i),
    ).toBeInTheDocument();

    // Adopt all — local only, no save yet.
    fireEvent.click(screen.getByRole("button", { name: /add all/i }));
    expect(updateMutate).not.toHaveBeenCalled();

    // The Save button commits the adopted competitor in one call.
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith({
      competitorUrls: ["https://asana.com/"],
    });
  });
});

describe("SiteCompetitorsTab loading state", () => {
  it("shows a loader instead of flashing the empty editor while the query is in flight", () => {
    // Pre-2026-06-07 the live editor rendered with empty data during
    // the fetch — "No competitors confirmed yet" + a bare Discover
    // button read as data loss until the real chips popped in.
    analysisQueryMock.current = { data: undefined, isLoading: true };
    renderTab();

    expect(screen.getByText("Loading competitors…")).toBeTruthy();
    expect(screen.queryByText(/No competitors confirmed yet/)).toBeNull();
    expect(screen.queryByText(/Discover/)).toBeNull();
  });
});
