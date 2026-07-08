import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../utils";

/**
 * Fill colors per semantic intent. `warning` is the exhausted/limit state
 * (e.g. a quota meter at 100%) — amber in both modes per the video-channel
 * handoff (`marketing/design_handoff_video_channel/README.md` §5).
 */
const FILL_INTENT_CLASSES = {
  brand: "bg-brand-600 dark:bg-brand-500",
  warning: "bg-amber-500",
} as const;

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Current progress. Omit for the indeterminate variant (a looping
   * runner used while total progress is unknown, e.g. a video render).
   */
  value?: number;
  /**
   * Upper bound for `value`.
   *
   * @defaultValue 100
   */
  max?: number;
  /**
   * Fill color semantics — `brand` (default) or `warning` (amber, for
   * exhausted/limit states).
   */
  intent?: keyof typeof FILL_INTENT_CLASSES;
  /**
   * Extra classes for the inner fill/runner element. The root `className`
   * targets the track (e.g. to swap the neutral track for a brand tint on
   * "Rendering" rows).
   */
  fillClassName?: string;
}

/**
 * ProgressBar — determinate + indeterminate progress track.
 *
 * Design guide §5.15 (Progress Bar). h-1.5 rounded-full neutral track with
 * a brand fill; the indeterminate runner loops at 1.6s with the spring
 * `--ease-out` curve and goes static under `prefers-reduced-motion`.
 *
 * Exposes `role="progressbar"`; `aria-valuenow`/`aria-valuemin`/
 * `aria-valuemax` are only present when determinate — omitting
 * `aria-valuenow` is how ARIA marks a progressbar indeterminate.
 */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, fillClassName, value, max = 100, intent = "brand", ...props }, ref) => {
    // Defensive: clamp into [0, max] so a stale `used > total` quota doc
    // renders a full bar instead of overflowing the rounded track.
    const clamped =
      value === undefined ? undefined : Math.min(Math.max(value, 0), Math.max(max, 0));
    const indeterminate = clamped === undefined;
    const percent = indeterminate || max <= 0 ? 0 : (clamped / max) * 100;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : max}
        className={cn(
          "h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full",
            FILL_INTENT_CLASSES[intent],
            indeterminate && "w-1/3 animate-progress-runner motion-reduce:animate-none",
            fillClassName
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";
