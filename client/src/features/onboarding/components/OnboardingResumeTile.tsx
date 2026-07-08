/**
 * Dashboard banner that nudges users to finish an incomplete wizard,
 * OR (W-E addition) to revisit setup after a plan upgrade unlocks
 * features they didn't have when they last ran through.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`
 * §"Tier change + downgrade behavior".
 *
 * Three render modes:
 *
 *   1. **Incomplete** — `completedAt === null`. Nudge to finish.
 *      "Pick up where you left off — N steps left."
 *
 *   2. **Upgraded** (W-E) — `completedAt !== null` AND
 *      `completedAtPlanId` was a tier strictly lower than the
 *      current plan. The user finished setup on a lighter plan and
 *      missed paid-only steps (or got their previously-locked
 *      steps unlocked). "New options unlocked — refresh your
 *      setup."
 *
 *   3. **Stable** — `completedAt !== null` AND no tier change.
 *      Tile doesn't render at all.
 *
 * In all rendered modes:
 *   - Only paid tiers see the tile. Free/none get the locked-
 *     preview wizard but no dashboard nudge (would be noisy upsell).
 *   - Per-session dismissal via sessionStorage.
 *
 * Auto-redirect (`useOnboardingAutoRedirect`) handles the very
 * first wizard land. This tile is the recovery + upgrade-revisit
 * surface.
 */

import { useEffect, useMemo, useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { ArrowRight, PartyPopper, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router";

import { useLicense } from "@/features/settings";

import { useWizardStateQuery } from "../api/useOnboardingState";

const DISMISS_KEY = "structura-onboarding-resume-tile-dismissed";

/**
 * Ordered tier ladder — index === effective "level" for comparison.
 * Any plan id missing from this list resolves to `-1` (unknown),
 * which makes the upgrade-detection branch a strict no-op so a
 * future plan id doesn't accidentally fire false-positive nudges.
 */
const TIER_ORDER: ReadonlyArray<string> = [
  "none",
  "free",
  "byok",
  "cloud",
  "cloud_pro",
];

function tierLevel(planId: string | null | undefined): number {
  if (!planId) return -1;
  return TIER_ORDER.indexOf(planId);
}

type TileMode = "incomplete" | "upgraded";

export const OnboardingResumeTile = () => {
  const navigate = useNavigate();
  const { plan: currentPlan, hasWorkspace } = useLicense();
  // All tiers — free/none get the wizard as a locked-preview upsell, so
  // they should also get the dashboard nudge to (re-)enter it. Gated on
  // workspace presence: without a bearer the endpoint can only fail.
  const { data } = useWizardStateQuery({ enabled: hasWorkspace === true });
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Read dismissal flag once on mount. Stored in sessionStorage so
  // it auto-clears on next browser session.
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
      }
    } catch {
      // SSR or storage-disabled — treat as not dismissed.
    }
  }, []);

  /**
   * Decide which render mode (or none) applies. We separate this
   * out so the gating logic is testable in isolation and so future
   * modes (e.g. "monthly content review nudge") can slot in
   * without re-flowing the JSX.
   */
  const mode: TileMode | null = useMemo(() => {
    if (!data) return null;
    if (!data.state.completedAt) return "incomplete";

    // Upgrade detection — wizard completed under a strictly lower
    // tier than the current plan. `tierLevel` resolves unknown plan
    // ids to -1 so a future plan that's not yet in the ladder won't
    // fire false positives.
    const completedLevel = tierLevel(data.state.completedAtPlanId);
    const currentLevel = tierLevel((currentPlan as string) ?? null);
    if (
      completedLevel >= 0 &&
      currentLevel > completedLevel
    ) {
      return "upgraded";
    }
    return null;
  }, [data, currentPlan]);

  if (!mode || dismissed) return null;
  if (!data) return null;

  const { state } = data;
  const totalSteps = 6;
  const resolvedCount =
    state.completedSteps.length + state.skippedSteps.length;
  const remaining = Math.max(0, totalSteps - resolvedCount);

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage failures; in-memory dismiss still works.
    }
    setDismissed(true);
  };

  // Mode-specific copy. Visual treatment stays brand-tinted in both
  // modes — the upgrade nudge is celebratory, not noisy. Same
  // dismiss + CTA shape so muscle memory carries over.
  const copy =
    mode === "incomplete"
      ? {
          icon: <Sparkles size={14} />,
          title:
            resolvedCount === 0
              ? __("Finish your Structura setup", "structura")
              : __("Pick up where you left off", "structura"),
          subtitle:
            remaining === 1
              ? __("One step left — a few minutes.", "structura")
              : sprintf(
                  /* translators: %d = number of remaining setup steps */
                  __("%d steps left — a few minutes.", "structura"),
                  remaining,
                ),
          cta: __("Resume setup", "structura"),
        }
      : {
          icon: <PartyPopper size={14} />,
          title: __("New options unlocked", "structura"),
          subtitle: __(
            "Your plan upgrade enables paid-tier setup steps — refresh your wizard to take advantage.",
            "structura",
          ),
          cta: __("Refresh setup", "structura"),
        };

  return (
    <Card className="flex items-center justify-between gap-6 border-brand-200 bg-brand-50 p-5 dark:border-brand-900/40 dark:bg-brand-950/20">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          {copy.icon}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0! text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            {copy.title}
          </p>
          <p className="m-0! text-xs text-neutral-600 dark:text-neutral-400">
            {copy.subtitle}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate("/onboarding")}
        >
          {copy.cta}
          <ArrowRight size={14} className="ml-1.5" />
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-brand-100 hover:text-neutral-700 dark:hover:bg-brand-900/40 dark:hover:text-neutral-200"
          aria-label={__("Dismiss setup reminder", "structura")}
        >
          <X size={14} />
        </button>
      </div>
    </Card>
  );
};
