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

/**
 * Sweep EVERY onboarding localStorage key — the per-activation dismissed
 * flags and the persisted wizard drafts, across all ids (including leftovers
 * from prior installs). Called once the durable server-side "dismissed" flag
 * is set: at that point localStorage is redundant, and clearing it stops the
 * key drift that resurrected the wizard. Never called while the user is
 * actively inside the wizard, so an in-progress manual re-run's draft is safe.
 */
export function clearAllOnboardingStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(KEY_BASE) ||
          key.startsWith("structura-onboarding-wizard"))
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage unavailable — nothing to clean; the server flag still gates.
  }
}
