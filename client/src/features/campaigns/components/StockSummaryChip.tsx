import { FC } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@structura/ui";

import { useStockSummaryQuery } from "../api/useStockSummaryQuery";

/**
 * Compact stock-state chip for the campaign card (Phase 1.6 follow-up).
 *
 * Renders one of three states based on the campaign's current stock:
 *
 *   - Has `ready` entries → "{n} ready" with a Sparkles icon
 *     (positive, the user knows their next publish is instant).
 *   - No ready, but has `pending` (in-flight) → "Pre-generating"
 *     with a spinning RefreshCw (the buffer is being refilled).
 *     The label deliberately uses the same vocabulary as the
 *     campaign-edit form's toggle ("Pre-generation"); a plain
 *     "Generating" was reading as "we're publishing a post right
 *     now" to first-time users immediately after campaign creation
 *     (Yurii feedback 2026-05-01).
 *   - Total = 0 → render nothing. Either the campaign just doesn't
 *     have pre-gen on yet, or stock genuinely doesn't exist
 *     (rare edge case before the first cron tick).
 *
 * `failed` and `stale` are computed but not surfaced on the chip —
 * those states are operator-debugging signals, not user-facing.
 * Stale entries always have a fresh refill batch behind them so the
 * "in-flight" rendering covers it implicitly.
 *
 * Skipped entirely when `pregenerationEnabled === false` (passes
 * `enabled: false` to the query so we don't even fetch).
 */
interface StockSummaryChipProps {
  campaignId: string | number;
  pregenerationEnabled: boolean;
  className?: string;
}

export const StockSummaryChip: FC<StockSummaryChipProps> = ({
  campaignId,
  pregenerationEnabled,
  className,
}) => {
  const { data: summary, isLoading } = useStockSummaryQuery(campaignId, {
    enabled: pregenerationEnabled,
  });

  if (!pregenerationEnabled) return null;
  if (isLoading || !summary) return null;
  if (summary.total === 0) return null;

  // Active states (pending, in-flight) feed the "Pre-generating" branch.
  const inFlight = summary.pending;

  if (summary.ready > 0) {
    return (
      <div
        className={cn(
          "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
          className,
        )}
      >
        <Sparkles size={10} aria-hidden />
        {/* translators: %d is the count of pre-generated posts ready to publish. */}
        {sprintf(__("%d ready", "structura"), summary.ready)}
      </div>
    );
  }

  if (inFlight > 0) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase dark:bg-amber-950/30 dark:text-amber-300",
          className,
        )}
      >
        <RefreshCw size={10} className="animate-spin" aria-hidden />
        {__("Pre-generating", "structura")}
      </div>
    );
  }

  return null;
};
