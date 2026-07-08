import { cva } from "class-variance-authority";

/**
 * Checkbox variant definitions — Structura Design System
 *
 * Design guide references:
 * - Section 6.1: Border Radius — rounded (small controls)
 * - Section 6.5: Focus State Convention — soft glow pattern
 * - Section 3.5 Target: Motion — --duration-fast (150ms) with --ease-out
 */
export const checkboxVariants = cva(
  [
    "flex size-5 items-center justify-center rounded border shadow-sm",
    // Transitions — fast with spring deceleration
    "transition-all duration-fast ease-out",
    // Focus — soft glow pattern (design guide 6.5)
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
    // Disabled
    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
  ].join(" "),
  {
    variants: {
      intent: {
        primary:
          // Unchecked — gray border, white bg
          "border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900 " +
          // Checked — brand-600
          "data-[checked]:bg-brand-600 data-[checked]:border-brand-600 data-[checked]:text-white " +
          // Hover
          "hover:border-brand-500 dark:hover:border-brand-400",
      },
    },
    defaultVariants: {
      intent: "primary",
    },
  }
);
