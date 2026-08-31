/**
 * Regression: the AI-competitor fallback must survive step remounts.
 *
 * 2026-07-15 agency report (workspace e7e0969b, apofit onboarding): the
 * wizard's competitors step "never stops loading". Cloud logs showed
 * `suggestWizardCompetitors` firing every ~10s with the SAME empty
 * exclude list — the step was remounting, and its mount-scoped one-shot
 * guard + component-state results reset each time, so the SPA re-burned
 * the AI call forever and the suggestions never rendered.
 *
 * This test runs the REAL `useWizardAiCompetitorsQuery` (real TanStack
 * Query cache, mocked `apiFetch` transport) and pins the fix: across a
 * mount → unmount → remount cycle the suggest endpoint is called exactly
 * once and the chips still render from cache on the second mount.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: "cloud", isPaidLicense: true }),
}));
vi.mock("@/features/site/api/useSiteAnalysis", () => ({
  // DFS has no SERP-overlap data — the AI fallback path.
  useSiteAnalysisQuery: () => ({ data: { suggestedCompetitors: [] } }),
}));
// The GSC connect card fires its own connections query, which this suite's
// strict apiFetch mock would reject — stub it out; it has its own tests.
vi.mock("../components/WizardGscConnectCard", () => ({
  WizardGscConnectCard: () => null,
}));

import { WizardStep3SeoIntelligence } from "../components/WizardStep3SeoIntelligence";
import { useWizardStore } from "../state/wizardStore";

const suggestCallCount = () =>
  apiFetchMock.mock.calls.filter(
    (call) =>
      (call[0] as { path?: string } | undefined)?.path ===
      "/structura/v1/wizard/competitors/suggest",
  ).length;

beforeEach(() => {
  useWizardStore.getState().reset();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
    if (path === "/structura/v1/wizard/competitors/suggest") {
      return {
        suggestions: [{ domain: "koala.ai", rationale: "Same audience." }],
      };
    }
    throw new Error(`Unexpected apiFetch in test: ${path}`);
  });

  // Returning user with complete positioning — the orchestrator's
  // blocking positioning pass stays off; only the competitors query arms.
  useWizardStore.getState().setStep3Draft({
    positioning: {
      what: "We sell pharmacy supplements",
      who: "Health-conscious shoppers",
      problem: "Hard to find trusted brands online",
    },
    positioningSource: "user",
    competitorUrls: [],
  });
});

describe("WizardStep3SeoIntelligence — AI competitors across remounts", () => {
  it("fetches once and serves remounts from cache", async () => {
    // One QueryClient across mounts — mirrors production, where the
    // client lives at the app root and outlives any step remount.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const ui = (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WizardStep3SeoIntelligence />
        </ToastProvider>
      </QueryClientProvider>
    );

    const first = render(ui);
    expect(await screen.findByText("koala.ai")).toBeInTheDocument();
    expect(suggestCallCount()).toBe(1);
    first.unmount();

    // Remount — the pre-fix shape re-fired the mutation here (its
    // one-shot ref and results were component state) and looped forever.
    render(ui);
    // Cache hit: chips render immediately, still exactly one call.
    expect(await screen.findByText("koala.ai")).toBeInTheDocument();
    await waitFor(() => expect(suggestCallCount()).toBe(1));
  });
});
