/**
 * useOnboardingAutoRedirect — first-run redirect triggers.
 *
 * Pins the 2026-06-06 fresh-install fix: a keyless install with no
 * prior activation gets sent to the wizard (whose license gate asks
 * for the key) — previously the redirect only fired on `justCreated`
 * from the wizard-state query, which requires a bearer that keyless
 * installs don't have, so they never saw the wizard at all.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const navigateMock = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => ({ current: { pathname: "/" } }));
vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationMock.current,
}));

const licenseMock = vi.hoisted(() => ({
  current: {
    hasUsableLicense: false as boolean | null,
    hasWorkspace: false as boolean | null,
  },
}));
vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));

const wizardDataMock = vi.hoisted(() => ({
  current: undefined as
    | { justCreated?: boolean; activationNeedsPositioning?: boolean }
    | undefined,
}));
vi.mock("../api/useOnboardingState", () => ({
  useWizardStateQuery: () => ({ data: wizardDataMock.current }),
}));

const dismissedMock = vi.hoisted(() => ({ current: false }));
vi.mock("../utils/onboardingDismissal", () => ({
  isOnboardingDismissed: () => dismissedMock.current,
}));

import { useOnboardingAutoRedirect } from "../hooks/useOnboardingAutoRedirect";

// The real `structuraConfig` global requires the full PHP bootstrap
// shape; tests only care about the one flag the hook reads.
const setConfig = (config: Record<string, unknown>) => {
  window.structuraConfig = config as Window["structuraConfig"];
};

beforeEach(() => {
  navigateMock.mockReset();
  locationMock.current = { pathname: "/" };
  licenseMock.current = { hasUsableLicense: false, hasWorkspace: false };
  wizardDataMock.current = undefined;
  dismissedMock.current = false;
  setConfig({ had_prior_activation: false });
});

describe("useOnboardingAutoRedirect", () => {
  it("redirects a fresh keyless install to the wizard's license gate", () => {
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).toHaveBeenCalledWith("/onboarding");
  });

  it("does NOT redirect a deliberately disconnected site (prior activation)", () => {
    setConfig({ had_prior_activation: true });
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("treats a missing had_prior_activation flag as prior (old plugin builds)", () => {
    setConfig({});
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("respects a prior explicit Exit dismissal", () => {
    dismissedMock.current = true;
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not yank away from deep links", () => {
    locationMock.current = { pathname: "/campaigns/abc" };
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("still redirects on justCreated for a licensed workspace", () => {
    licenseMock.current = { hasUsableLicense: true, hasWorkspace: true };
    setConfig({ had_prior_activation: true });
    wizardDataMock.current = { justCreated: true };
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).toHaveBeenCalledWith("/onboarding");
  });
});
