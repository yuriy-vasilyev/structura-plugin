/**
 * Dismissable "connect Google Search Console" banner for the wp-admin
 * Overview.
 *
 * GSC connect used to be offered inside the onboarding wizard (SEO step, then
 * briefly the Done step) — both were poor homes: the SEO step buried it under
 * competitor discovery, and the Done step launched the property-picker modal
 * over a screen the user was trying to leave. This banner is the replacement
 * surface: a quiet, prominent, one-line nudge on the dashboard that the user
 * can dismiss for good.
 *
 * Gating:
 *   - Paid tiers only (GSC insight is a paid feature; free/none get no nudge).
 *   - Renders only while GSC is `not_connected` — once connected it vanishes
 *     on its own, and the `property_pending` / `expired` states have their own
 *     dedicated surfaces (the GscSummaryCard glance tile + reconnect banner).
 *   - Dismissal persists in localStorage (per WP origin = per site), so a
 *     user who dismisses it doesn't get nagged again on the next visit. The
 *     quiet stat-grid teaser in `GscSummaryCard` remains as the always-present
 *     way to connect after dismissal.
 */

import { useEffect, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Button } from "@structura/ui";
import { Plug, X } from "lucide-react";

import { useGscOverviewSummaryQuery } from "@/features/channels/api/useGscOverviewSummaryQuery";
import { GoogleGGlyph } from "@/features/channels/components/GscConnectFlow";
import { useLicense } from "@/features/settings";

const DISMISS_KEY = "structura-gsc-connect-banner-dismissed";

export const GscConnectBanner = () => {
  const { isPaidLicense } = useLicense();
  const query = useGscOverviewSummaryQuery();
  const [dismissed, setDismissed] = useState(false);

  // Read the persisted dismissal once on mount.
  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        window.localStorage.getItem(DISMISS_KEY) === "1"
      ) {
        setDismissed(true);
      }
    } catch {
      // Private mode / storage disabled — treat as not dismissed.
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Non-fatal: the banner still hides for this session via state.
    }
  };

  // The query self-disables without a usable license, so `not_connected` is
  // the single "offer to connect" signal.
  if (!isPaidLicense || dismissed) return null;
  if (query.data?.state !== "not_connected") return null;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
        <GoogleGGlyph size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0! text-sm font-semibold text-neutral-900 dark:text-white">
          {__("Connect Google Search Console", "structura")}
        </p>
        <p className="mt-0.5! mb-0! text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "See what each post earns from Google Search — free, read-only, and your posts report from day one.",
            "structura",
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" href="#/channels/store">
          <Plug size={14} aria-hidden className="mr-1.5" />
          {__("Connect", "structura")}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={__("Dismiss", "structura")}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <X size={16} />
        </button>
      </div>
    </section>
  );
};
