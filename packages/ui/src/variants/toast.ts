import { cva } from "class-variance-authority";

/**
 * Toast variant definitions — Structura Design System
 *
 * Design guide references:
 * - Section 5.7: Toasts — thick left border, neutral body
 * - Section 3.5 Target: Motion — slideInFromRight at 300ms --ease-out
 * - Section 4.1: Elevation — shadow-lg
 */
export const toastVariants = cva(
  [
    "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg",
    // Transitions — ease-out for entrance, ease-in for exit
    "transition-all duration-300 ease-out",
    // Headless UI animation states
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
    "data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
    // Thick left border for severity indicator
    "border-l-[6px]",
  ].join(" "),
  {
    variants: {
      intent: {
        default:
          "bg-white border-gray-200 border-l-gray-500 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:border-l-gray-500 dark:text-gray-100 dark:ring-1 dark:ring-white/[0.04]",

        success:
          "bg-white border-gray-200 border-l-emerald-500 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:border-l-emerald-500 dark:text-gray-100 dark:ring-1 dark:ring-white/[0.04]",

        error:
          "bg-white border-gray-200 border-l-red-500 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:border-l-red-500 dark:text-gray-100 dark:ring-1 dark:ring-white/[0.04]",

        warning:
          "bg-white border-gray-200 border-l-amber-500 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:border-l-amber-500 dark:text-gray-100 dark:ring-1 dark:ring-white/[0.04]",

        info:
          "bg-white border-gray-200 border-l-brand-500 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:border-l-brand-500 dark:text-gray-100 dark:ring-1 dark:ring-white/[0.04]",
      },
    },
    defaultVariants: {
      intent: "default",
    },
  }
);

export const toastIconColors = {
  default: "text-gray-500 dark:text-gray-400",
  success: "text-emerald-500 dark:text-emerald-400",
  error: "text-red-500 dark:text-red-400",
  warning: "text-amber-500 dark:text-amber-400",
  info: "text-brand-500 dark:text-brand-400",
};
