import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "danger";
  /**
   * Enables hover micro-interactions (elevation lift, subtle scale).
   * Only set this on cards that are clickable or represent selectable items.
   * Static content containers should leave this `false` (default).
   */
  interactive?: boolean;
}

/**
 * Card — elevated surface container.
 *
 * Design guide references:
 * - Section 5.3: Cards — multi-layered shadow, dark glass-edge
 * - Section 4.1: Elevation Level 1 (Raised)
 * - Section 6.1: Border Radius Scale — rounded-2xl for cards
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, variant = "default", interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Structure
          "relative overflow-hidden rounded-2xl border p-6",
          // Elevation — multi-layered raised shadow (design guide 4.1)
          "shadow-raised border-gray-200 bg-white",
          // Transitions — ease-out at duration-normal
          "duration-normal transition-all ease-out",
          // Dark mode — glass-edge treatment
          "dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/4",
          // Interactive hover — only when card represents a clickable target
          interactive && [
            "cursor-pointer",
            "hover:shadow-floating",
            "hover:-translate-y-0.5 hover:scale-[1.015]",
            "dark:hover:ring-white/8",
          ],
          // Danger variant — thick bottom border
          variant === "danger" && "border-b-4 border-b-red-100 dark:border-b-red-900/20",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";
