import { cva } from "class-variance-authority";

/**
 * Switch variant definitions — Structura Design System
 *
 * Design guide references:
 * - Section 6.1: Border Radius — rounded-full for switches
 * - Section 6.5: Focus State Convention — soft glow pattern
 * - Section 3.5 Target: Motion — spring overshoot on toggle (--ease-spring)
 */
export const switchVariants = cva(
  [
    "relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full",
    "border-2 border-transparent",
    // Transitions — spring easing for toggle (design guide 6.4: "Toggle/switch → --ease-spring")
    "transition-colors duration-normal ease-spring",
    // Focus — soft glow pattern (design guide 6.5)
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
    // Disabled
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      intent: {
        primary:
          "bg-neutral-300 dark:bg-neutral-700 data-checked:bg-brand-600 dark:data-checked:bg-brand-500",
      },
    },
    defaultVariants: {
      intent: "primary",
    },
  }
);
