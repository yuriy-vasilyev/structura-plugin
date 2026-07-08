import { forwardRef, type HTMLAttributes } from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { badgeVariants } from "../variants/badge";

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /**
   * Renders a leading 6px status dot in the badge's text color. For
   * in-progress states pair with {@link BadgeProps#dotPulse}.
   */
  dot?: boolean;
  /**
   * Pulses the leading dot (implies `dot`) — the "Rendering"-style
   * in-progress affordance from the video-channel handoff. Decorative
   * only: the animation is disabled under `prefers-reduced-motion` and
   * the dot stays visible.
   */
  dotPulse?: boolean;
}

/**
 * Badge — inline status indicator.
 *
 * Renders as a `<span>` because badges are purely presentational inline
 * elements (status labels, counts, tags). Using a `<div>` would break
 * inline flow and violate HTML semantics when nested inside `<p>`, `<a>`,
 * or other inline contexts.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, intent, variant, size, dot, dotPulse, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ intent, variant, size }), className)}
        {...props}
      >
        {(dot || dotPulse) && (
          <span
            data-badge-dot=""
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-current",
              dotPulse && "animate-pulse-dot motion-reduce:animate-none"
            )}
          />
        )}
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";
