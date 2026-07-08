import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils";
import { ProgressBar } from "./ProgressBar";

export interface QuotaMeterProps extends HTMLAttributes<HTMLDivElement> {
  /** Units consumed so far (e.g. videos rendered this month). */
  used: number;
  /** The period's allowance. */
  total: number;
  /**
   * Caption text, e.g. `"12 of 20 videos this month"`. Passed as a node —
   * copy and i18n live in the consuming app, never in the primitive.
   */
  label: ReactNode;
  /**
   * Optional right-aligned note, e.g. `"Resets Aug 1"`. Same i18n rule as
   * `label`.
   */
  note?: ReactNode;
  /**
   * Forces the amber exhausted treatment. Defaults to `used >= total`;
   * pass explicitly when exhaustion is decided server-side (e.g. a plan
   * downgrade mid-period).
   */
  exhausted?: boolean;
  /**
   * Extra classes for the bar track — the handoff constrains its width per
   * placement (`w-44` in the config-modal footer, `max-w-xs` on the
   * connection row).
   */
  barClassName?: string;
}

/**
 * QuotaMeter — caption row + thin quota bar.
 *
 * Thin wrapper over {@link ProgressBar} for "N of M this month" surfaces
 * (video-channel handoff §5): 12/600 caption, optional 11px neutral note,
 * and an amber fill once the quota is exhausted.
 */
export const QuotaMeter = forwardRef<HTMLDivElement, QuotaMeterProps>(
  ({ used, total, label, note, exhausted, barClassName, className, ...props }, ref) => {
    const isExhausted = exhausted ?? used >= total;

    return (
      <div ref={ref} className={cn("min-w-0", className)} {...props}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            {label}
          </span>
          {note != null && (
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{note}</span>
          )}
        </div>
        <ProgressBar
          value={used}
          max={total}
          intent={isExhausted ? "warning" : "brand"}
          className={cn("mt-1.5", barClassName)}
        />
      </div>
    );
  }
);
QuotaMeter.displayName = "QuotaMeter";
