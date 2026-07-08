/**
 * SiteSettingsTab — verifies the restart-wizard card escapes the tier gate.
 *
 * The SEO-refresh preferences are paid-only (free sees a LockedPanel),
 * but the setup wizard runs on every tier — so the "Restart setup
 * wizard" entry point must render for free AND paid. Regression guard:
 * it previously lived inside the paid-only `SettingsLive` branch, so
 * free users had no way to re-open the wizard.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

// Stub the REST layer — both the SEO-analysis query (SettingsLive) and
// the wizard-reset mutation (RestartWizardCard) route through apiFetch.
vi.mock("@wordpress/api-fetch", () => ({
  default: vi.fn(async () => ({ success: false, capturedAt: null })),
}));

const licenseMock = vi.hoisted(() => ({
  current: {
    plan: "free" as string,
    isPaidLicense: false as boolean,
  },
}));
vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));

import { SiteSettingsTab } from "../routes/tabs/SiteSettingsTab";

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/site/settings"]}>
        <SiteSettingsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SiteSettingsTab", () => {
  it("free tier: SEO settings are locked but the wizard can still be restarted", () => {
    licenseMock.current = { plan: "free", isPaidLicense: false };
    renderTab();

    // The SEO-refresh preferences are gated behind the lock overlay.
    expect(
      screen.getByRole("link", { name: /unlock/i }),
    ).toBeInTheDocument();

    // The restart entry point is OUTSIDE that gate — this is the fix.
    expect(
      screen.getByRole("button", { name: /restart setup wizard/i }),
    ).toBeInTheDocument();
  });

  it("paid tier: live settings render alongside the restart card", () => {
    licenseMock.current = { plan: "cloud", isPaidLicense: true };
    renderTab();

    // No lock overlay on paid.
    expect(screen.queryByRole("link", { name: /unlock/i })).toBeNull();
    // Live preference (the monthly-digest switch) is present.
    expect(screen.getByText(/monthly digest email/i)).toBeInTheDocument();
    // Restart card is present here too.
    expect(
      screen.getByRole("button", { name: /restart setup wizard/i }),
    ).toBeInTheDocument();
  });
});
