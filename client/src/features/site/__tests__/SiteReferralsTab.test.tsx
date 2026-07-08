/**
 * SiteReferralsTab — paid-only gating.
 *
 * Regression (2026-07-08): the site-level Referral links tab rendered the full
 * ReferralLinksEditor + Save for EVERY tier, so free users could edit a paid
 * feature the cloud silently drops at generation time. It must lock behind the
 * same LockedPanel its peer Competitors/Settings tabs use.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) =>
    text.replace(/%s|%d/g, () => String(args.shift() ?? "")),
}));

const licenseMock = vi.hoisted(() => ({ current: { plan: "free", isPaidLicense: false } }));
vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));

const updateMutate = vi.hoisted(() => vi.fn());
const analysisQueryMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../api/useSiteAnalysis", () => ({
  useSiteAnalysisQuery: () => analysisQueryMock.current,
  useUpdateSiteSeoSettingsMutation: () => ({ mutate: updateMutate, isPending: false }),
}));

import { SiteReferralsTab } from "../routes/tabs/SiteReferralsTab";

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/site/referrals"]}>
        <SiteReferralsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  updateMutate.mockReset();
  analysisQueryMock.current = {
    data: { seoIntelSettings: { referralLinks: [] } },
    isLoading: false,
  };
});

describe("SiteReferralsTab gating", () => {
  it("locks the editor behind an upgrade panel for free tiers", () => {
    licenseMock.current = { plan: "free", isPaidLicense: false };
    renderTab();

    // The lock overlay is shown — value statement + a real upgrade link.
    expect(
      screen.getByText(/Weave your affiliate and partner links/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /unlock this feature/i }),
    ).toBeInTheDocument();

    // The editable affordances are NOT reachable: no Save, no "Add referral link".
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add referral link/i })).toBeNull();
  });

  it("renders the live editor for paid tiers", () => {
    licenseMock.current = { plan: "cloud", isPaidLicense: true };
    renderTab();

    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add referral link/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Weave your affiliate and partner links/i)).toBeNull();
  });
});
