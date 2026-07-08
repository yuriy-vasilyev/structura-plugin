import { FC, useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Sparkles } from "lucide-react";
import { cn } from "@structura/ui";

/**
 * Staged progress display for AI suggestion calls.
 *
 * Shows a small panel with a cycling status line while the suggestion
 * is in flight. The lines are deliberately VAGUE — they tell the user
 * that real work is happening (so the spinner doesn't feel dead) but
 * don't reveal the actual mechanism (Jina-scrape homepage + landing
 * pages, hash inputs, cache for 24h, route to a reasoning model with a
 * structured-outputs schema). Competitors watching the UI shouldn't be
 * able to reverse-engineer the flow from these copy lines alone.
 *
 * Why three to four short stages and not a single "Analyzing…": users
 * tolerate longer waits when they can see progress *moving*. Reasoning-
 * model calls take 5-20s on a warm cache and longer on first-call
 * scrape — the staged copy makes that feel intentional rather than
 * hung.
 *
 * Cadence (~3s per stage) is loosely tuned to the median call length;
 * faster calls only flash through one or two stages, slower calls land
 * on the last "Composing…" line and stay there until `isLoading` flips
 * back to false.
 */
interface MagicSuggestProgressProps {
  isLoading: boolean;
  /** Optional override — pass mode-specific copy if the defaults read wrong. */
  stages?: string[];
  /** Tailwind sizing variant. `inline` is for "next to a button" placement. */
  variant?: "inline" | "panel";
  className?: string;
}

const DEFAULT_STAGES = [
  __("Reading your site…", "structura"),
  __("Studying your value proposition…", "structura"),
  __("Detecting topical patterns…", "structura"),
  __("Composing suggestions…", "structura"),
];

const STAGE_DURATION_MS = 3_000;

export const MagicSuggestProgress: FC<MagicSuggestProgressProps> = ({
  isLoading,
  stages = DEFAULT_STAGES,
  variant = "panel",
  className,
}) => {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setStageIndex(0);
      return;
    }
    // Advance one stage at a time, capped at the last index. We don't
    // loop — staying on "Composing…" feels honest if the call is long;
    // looping would feel like a fake bar.
    const id = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, stages.length - 1));
    }, STAGE_DURATION_MS);
    return () => clearInterval(id);
  }, [isLoading, stages.length]);

  if (!isLoading) return null;

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] text-brand-600 dark:text-brand-400",
          className,
        )}
      >
        <Sparkles size={12} className="animate-pulse" />
        <span aria-live="polite">{stages[stageIndex]}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/20",
        className,
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 shadow-sm shadow-brand-500/20">
        <Sparkles size={13} className="animate-pulse text-white" />
      </span>
      <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
        {stages[stageIndex]}
      </span>
    </div>
  );
};
