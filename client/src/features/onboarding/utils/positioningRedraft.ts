/**
 * When a positioning AI draft asks before replacing text: one rule for the
 * Site → Info card and the setup wizard's positioning step
 * (specs/site-reading.md §11), the same as the customer portal's.
 */

/** The three positioning answers. */
export interface PositioningText {
  what: string;
  who: string;
  problem: string;
}

/** Returns whether any of the three answers differs. */
export const positioningDiffers = (a: PositioningText, b: PositioningText): boolean =>
  a.what !== b.what || a.who !== b.who || a.problem !== b.problem;

/**
 * Whether an AI draft asks first (specs/site-reading.md §11, 2026-11-13):
 * after a draft in this visit, when the text differs from it; before one,
 * when the text differs from an AI draft as loaded or was loaded as the
 * operator's own. Empty text never asks.
 */
export function redraftNeedsConfirm(
  current: PositioningText,
  loaded: (PositioningText & { source?: string }) | null | undefined,
  sessionDraft: PositioningText | null,
): boolean {
  if (sessionDraft) return positioningDiffers(current, sessionDraft);
  if (![current.what, current.who, current.problem].some((value) => value.trim().length > 0)) {
    return false;
  }
  return loaded?.source === "ai_draft" ? positioningDiffers(current, loaded) : true;
}
