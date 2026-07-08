import type { HTMLAttributes } from "react";
import { cn } from "../utils";

/**
 * Skeleton — thin wrapper over a div that renders a shimmering placeholder
 * block while async content loads.
 *
 * Why a shared component, not ad-hoc `animate-pulse` divs:
 *   - Unifies the colour tokens so every loading surface in the app pulses
 *     the same shade in both light and dark mode. Prior inline usages drifted
 *     between `bg-gray-200` and `bg-neutral-200`, which read as inconsistent
 *     polish.
 *   - Lets us swap the animation (e.g. to a shimmer gradient) later without
 *     hunting down every inline usage.
 *
 * The component is transparent to layout — it forwards className so callers
 * size each skeleton block to match the real content it replaces (width of
 * a button, height of a title, etc.). No default dimensions: a zero-size
 * skeleton is preferable to a wrong-size one that causes layout shift when
 * real content arrives.
 */
export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export const Skeleton = ({ className, ...rest }: SkeletonProps) => {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-neutral-200/80 dark:bg-neutral-700/60",
        className,
      )}
      {...rest}
    />
  );
};
