/**
 * Downgrade banner rendered above the wizard content when the user
 * completed setup on a paid tier but is now on a lower tier (e.g.
 * cloud → free).
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`
 * §"Tier change + downgrade behavior".
 *
 * Two principles enforced here:
 *
 *   1. **Wizard data is preserved.** Positioning, target keywords,
 *      personas — all stay on the workspace doc. We never destroy
 *      them on downgrade.
 *
 *   2. **The user knows the trade-off.** The banner explicitly
 *      explains that saved choices are intact but won't power
 *      free-tier campaigns (the cloud-side gate enforces this; the
 *      banner is the transparency layer). One-time dismiss per
 *      session.
 */

import { useEffect, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "structura-onboarding-downgrade-banner-dismissed";

interface DowngradeBannerProps {
  previousPlanLabel?: string;
}

export const DowngradeBanner = ({ previousPlanLabel }: DowngradeBannerProps) => {
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
      }
    } catch {
      // sessionStorage unavailable — treat as not dismissed.
    }
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore.
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="flex flex-col gap-1">
          <p className="m-0! text-sm font-medium text-amber-900 dark:text-amber-100">
            {previousPlanLabel
              ? __("Your paid features are paused", "structura")
              : __("Your saved setup is preserved", "structura")}
          </p>
          <p className="m-0! text-xs text-amber-800 dark:text-amber-200">
            {__(
              "Your previous setup answers are still here, but won't power campaigns on this plan. They'll re-engage automatically when you upgrade.",
              "structura",
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-amber-600 hover:bg-amber-100 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/40 dark:hover:text-amber-200"
        aria-label={__("Dismiss notice", "structura")}
      >
        <X size={12} />
      </button>
    </div>
  );
};
