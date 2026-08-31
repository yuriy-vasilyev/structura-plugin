/**
 * MetricChip — the keyword-difficulty (KD) meter on a keyword-bank row:
 * a 26×4px track with a fill at `kd%` and the numeric value, both tinted by
 * the row's state RELATIVE TO THE SITE'S RESOLVED CEILING — never by an
 * absolute scale. A KD of 52 is "stretch" on a balanced (≤ 65) site and a
 * "pillar" on a winnable (≤ 40) one; the same number must read differently.
 *
 * Design handoff: `marketing/design_handoff_keyword_bank/keyword-bank-spec.md`
 * §2 (`MetricChip`). Surface-neutral: tokens only, no strings of its own —
 * the accessible description comes from the caller (translated).
 */
import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";

/** Row difficulty state, derived from KD vs the resolved ceiling. */
export type KdState = "winnable" | "stretch" | "pillar";

/**
 * How far below the ceiling a keyword stops being "stretch" and becomes
 * plainly winnable. Spec §2: `stretch = ceiling − 20 < kd ≤ ceiling`.
 */
export const STRETCH_BAND = 20;

/**
 * Derive a row's difficulty state from its KD and the site's resolved KD
 * ceiling (40 winnable / 65 balanced / `null` authority = no cap).
 *
 * - No ceiling (authority mode, or a bank saved before the ceiling shipped)
 *   → everything is winnable and no pillar group exists.
 * - No KD (manual add, AI-estimated bank) → winnable; the caller hides the
 *   meter anyway.
 */
export function deriveKdState(
  kd: number | undefined | null,
  ceiling: number | undefined | null
): KdState {
  if (ceiling == null || kd == null) return "winnable";
  if (kd > ceiling) return "pillar";
  if (kd > ceiling - STRETCH_BAND) return "stretch";
  return "winnable";
}

const KD_TEXT: Record<KdState, string> = {
  winnable: "text-emerald-600 dark:text-emerald-400",
  stretch: "text-amber-600 dark:text-amber-400",
  pillar: "text-purple-600 dark:text-purple-400",
};

const KD_FILL: Record<KdState, string> = {
  winnable: "bg-emerald-600 dark:bg-emerald-400",
  stretch: "bg-amber-600 dark:bg-amber-400",
  pillar: "bg-purple-600 dark:bg-purple-400",
};

export interface MetricChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Keyword difficulty, 0–100. */
  kd: number;
  /** Pre-derived state (see {@link deriveKdState}) so the row and chip agree. */
  state: KdState;
}

/**
 * The KD meter. Renders as a focusable inline `<span>` (so a tooltip can
 * attach on keyboard focus — spec §7) carrying `data-kd-state` for tests
 * and styling hooks. Pass `aria-label` with the translated description
 * ("Difficulty 52 — stretch (near your KD ≤ 65 ceiling)").
 */
export const MetricChip = forwardRef<HTMLSpanElement, MetricChipProps>(
  ({ kd, state, className, ...rest }, ref) => {
    const width = Math.max(0, Math.min(100, kd));
    return (
      <span
        ref={ref}
        data-kd-state={state}
        tabIndex={0}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
          className
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className="relative inline-block h-1 w-[26px] shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
        >
          <span
            className={cn("absolute inset-y-0 left-0 rounded-full", KD_FILL[state])}
            style={{ width: `${width}%` }}
          />
        </span>
        <span className={cn("font-mono text-[11px] font-medium tabular-nums", KD_TEXT[state])}>
          {kd}
        </span>
      </span>
    );
  }
);
MetricChip.displayName = "MetricChip";
