/**
 * Per-site onboarding dismissal — pins the contract behind "Exit must stick":
 * the wizard's Exit records a per-activation flag, the auto-redirect skips
 * the needs-positioning nudge while it's set, and Finish clears it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearOnboardingDismissed,
  isOnboardingDismissed,
  markOnboardingDismissed,
} from "../utils/onboardingDismissal";

beforeEach(() => {
  localStorage.clear();
});

describe("onboardingDismissal", () => {
  it("is not dismissed by default", () => {
    expect(isOnboardingDismissed()).toBe(false);
  });

  it("sticks after marking (survives a 'reload' — storage-backed, not in-memory)", () => {
    markOnboardingDismissed();
    expect(isOnboardingDismissed()).toBe(true);
    // The stored key is activation-namespaced so it can't bleed across sites.
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.startsWith("structura-onboarding-dismissed:"))).toBe(
      true,
    );
  });

  it("clears on finish", () => {
    markOnboardingDismissed();
    clearOnboardingDismissed();
    expect(isOnboardingDismissed()).toBe(false);
  });
});
