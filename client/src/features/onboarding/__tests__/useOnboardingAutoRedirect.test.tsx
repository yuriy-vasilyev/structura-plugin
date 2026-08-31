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
    isPaidLicense: false as boolean,
  },
}));
vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));

const wizardDataMock = vi.hoisted(() => ({
  current: undefined as
    | {
        justCreated?: boolean;
        activationNeedsPositioning?: boolean;
        state?: { completedAt?: string | null };
      }
    | undefined,
}));
vi.mock("../api/useOnboardingState", () => ({
  useWizardStateQuery: () => ({ data: wizardDataMock.current }),
}));

const dismissedMock = vi.hoisted(() => ({ current: false }));
const clearAllMock = vi.hoisted(() => vi.fn());
vi.mock("../utils/onboardingDismissal", () => ({
  isOnboardingDismissed: () => dismissedMock.current,
  clearAllOnboardingStorage: clearAllMock,
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
  licenseMock.current = {
    hasUsableLicense: false,
    hasWorkspace: false,
    isPaidLicense: false,
  };
  wizardDataMock.current = undefined;
  dismissedMock.current = false;
  clearAllMock.mockReset();
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
    licenseMock.current = {
      hasUsableLicense: true,
      hasWorkspace: true,
      isPaidLicense: true,
    };
    setConfig({ had_prior_activation: true });
    wizardDataMock.current = { justCreated: true };
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).toHaveBeenCalledWith("/onboarding");
  });

  // Regression (2026-07-08): a completed none/free wizard re-opened on
  // every SPA load. positioning is a LOCKED step for those tiers, so
  // `activationNeedsPositioning` stays true forever and the nudge fired
  // endlessly. The nudge is now gated to tiers that can actually capture
  // positioning.
  it("does NOT re-nudge a none/free install that can't capture positioning", () => {
    licenseMock.current = {
      hasUsableLicense: true,
      hasWorkspace: true,
      isPaidLicense: false,
    };
    setConfig({ had_prior_activation: true });
    wizardDataMock.current = {
      justCreated: false,
      activationNeedsPositioning: true,
    };
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("still nudges a PAID new site that needs positioning (2nd-site case)", () => {
    licenseMock.current = {
      hasUsableLicense: true,
      hasWorkspace: true,
      isPaidLicense: true,
    };
    setConfig({ had_prior_activation: true });
    wizardDataMock.current = {
      justCreated: false,
      activationNeedsPositioning: true,
    };
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).toHaveBeenCalledWith("/onboarding");
  });

  // Regression (2026-07-20, 3rd occurrence): the wizard reappeared after
  // completion because the suppressor was a localStorage flag keyed by the
  // activation id, which drifts on workspace re-provision. The durable
  // server-side `onboarding_dismissed` wp_option (localized here) now wins
  // over EVERY trigger — including justCreated and the keyless fresh-install
  // path — regardless of activation-id drift or tier (anonymous included).
  it("does NOT redirect when the server onboarding_dismissed flag is set", () => {
    licenseMock.current = {
      hasUsableLicense: true,
      hasWorkspace: true,
      isPaidLicense: true,
    };
    // justCreated would normally redirect — the durable seal overrides it.
    wizardDataMock.current = { justCreated: true };
    setConfig({ had_prior_activation: false, onboarding_dismissed: true });
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect a keyless fresh install once server-dismissed", () => {
    // The exact reported case: anonymous tier, no license, fresh activation
    // id (no localStorage flag), but onboarding already finished/exited once.
    setConfig({ had_prior_activation: false, onboarding_dismissed: true });
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("treats a licensed workspace's completedAt as a durable seal", () => {
    licenseMock.current = {
      hasUsableLicense: true,
      hasWorkspace: true,
      isPaidLicense: true,
    };
    setConfig({ had_prior_activation: true });
    wizardDataMock.current = {
      justCreated: false,
      activationNeedsPositioning: true,
      state: { completedAt: "2026-07-20T00:00:00.000Z" },
    };
    renderHook(() => useOnboardingAutoRedirect());

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("sweeps stale onboarding localStorage once dismissed, off the wizard route", () => {
    setConfig({ had_prior_activation: false, onboarding_dismissed: true });
    renderHook(() => useOnboardingAutoRedirect());

    expect(clearAllMock).toHaveBeenCalled();
  });

  it("does NOT sweep while the user is inside the wizard (manual re-run)", () => {
    locationMock.current = { pathname: "/onboarding" };
    setConfig({ had_prior_activation: false, onboarding_dismissed: true });
    renderHook(() => useOnboardingAutoRedirect());

    expect(clearAllMock).not.toHaveBeenCalled();
  });
});
