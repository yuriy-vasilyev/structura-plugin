/**
 * Per-site "user exited onboarding" dismissal.
 *
 * The auto-redirect sends a site with no positioning of its own into the
 * wizard (`activationNeedsPositioning`). That flag stays true until the user
 * actually SAVES positioning (the wizard commits at Finish), so without a
 * durable dismissal the redirect re-fires on every page load — clicking
 * Exit only survived until the next refresh (the in-session ref guard
 * resets). This records the exit per activation so the redirect fires once
 * per site; the dashboard resume tile stays as the explicit way back in.
 *
 * localStorage (not the server) on purpose: it's a per-browser UX nudge,
 * not workspace state — another teammate on another machine SHOULD still
 * get nudged once.
 */
import { perActivationStorageKey } from "@/utils/storageKey";

const KEY_BASE = "structura-onboarding-dismissed";

export function markOnboardingDismissed(): void {
  try {
    localStorage.setItem(perActivationStorageKey(KEY_BASE), "1");
  } catch {
    // Storage unavailable (private mode / quota) — the redirect will nudge
    // again next load; annoying but harmless.
  }
}

export function clearOnboardingDismissed(): void {
  try {
    localStorage.removeItem(perActivationStorageKey(KEY_BASE));
  } catch {
    // ignore
  }
}

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(perActivationStorageKey(KEY_BASE)) === "1";
  } catch {
    return false;
  }
}
