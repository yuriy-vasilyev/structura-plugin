import { cva } from "class-variance-authority";

/**
 * Form field variant definitions — Structura Design System
 *
 * Design guide references:
 * - Section 5.2: Form Fields — wrapper group + inner input pattern
 * - Section 6.5: Focus State Convention — brand-colored ring
 * - Section 7.1: WordPress Override Pattern — !important on inner elements
 * - Section 3.5 Target: Motion — --ease-out at --duration-fast
 */

/**
 * Container: Handles the border and the "Brand Glow" on focus.
 * WP Override Note: Using focus-within to style the wrapper when input is focused.
 */
export const formFieldGroupVariants = cva(
  [
    "relative flex overflow-hidden rounded-xl border bg-white dark:bg-gray-900 shadow-sm",
    // Transitions — ease-out (spring deceleration) at duration-fast
    "transition-all duration-fast ease-out",
    "outline outline-0 outline-offset-0 outline-transparent",
  ],
  {
    variants: {
      intent: {
        default: [
          "border-gray-300 dark:border-gray-700",
          "text-gray-900 dark:text-gray-100",
          "placeholder:text-gray-400 dark:placeholder:text-gray-500",
          // Brand Focus — using ! to override potential WP generic input focus styles
          "focus-within:!border-brand-600 focus-within:!ring-4 focus-within:!ring-brand-600/10",
        ],
        error: [
          "border-red-500 dark:border-red-500/50",
          "text-red-900 dark:text-red-300",
          "placeholder:text-red-300 dark:placeholder:text-red-700",
          "focus-within:!border-red-600 focus-within:!ring-4 focus-within:!ring-red-600/10",
        ],
      },
    },
    defaultVariants: {
      intent: "default",
    },
  }
);

/**
 * Styles for the core <input> or <textarea> element itself.
 * WP Override Note: We use !important (!) extensively here because WordPress core forms.css
 * adds heavy styling to 'input[type=text]', 'select', etc.
 */
export const formFieldElementVariants = cva(
  "w-full !bg-transparent !border-0 !shadow-none !outline-none !ring-0 leading-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600 dark:text-white",
  {
    variants: {
      size: {
        xs: "!px-2 !py-1 !text-xs",
        sm: "!px-3 !py-1.5 !text-sm",
        md: "!px-4 !py-2.5 !text-sm",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

/**
 * Trigger (Select/Combobox): Matches the input group style exactly.
 */
export const formFieldTriggerVariants = cva(
  [
    "relative w-full cursor-pointer rounded-xl border bg-white dark:bg-gray-900 text-left shadow-sm",
    // Transitions — ease-out (spring deceleration) at duration-fast
    "transition-all duration-fast ease-out",
    "outline-0 outline-offset-0 outline-transparent",
    "text-gray-900 dark:text-gray-100 placeholder:text-gray-400",
    // Disabled state — HeadlessUI's ListboxButton renders a real
    // `<button disabled>` AND sets `data-disabled`, so cover both. Without
    // this a gated Select (e.g. the Pro-only "Image format" picker) looked
    // fully interactive — visually indistinguishable from an enabled one.
    "disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
    "data-disabled:cursor-not-allowed data-disabled:opacity-55 data-disabled:shadow-none",
  ],
  {
    variants: {
      intent: {
        default:
          "border-gray-300 dark:border-gray-700 focus:!border-brand-600 focus:!ring-4 focus:!ring-brand-600/10",
        error:
          "border-red-500 dark:border-red-500/50 text-red-900 dark:text-red-300 focus:!border-red-500 focus:!ring-4 focus:!ring-red-500/10",
      },
      size: {
        xs: "px-2 py-1 pr-8 text-xs leading-none",
        sm: "px-3 py-1.5 pr-8 text-sm leading-none",
        md: "px-4 py-2.5 pr-10 text-sm leading-none",
      },
    },
    defaultVariants: {
      intent: "default",
      size: "md",
    },
  }
);

export const leftAdornmentVariants = cva("flex items-center text-gray-500 dark:text-gray-400", {
  variants: {
    size: {
      xs: "pl-2 pr-1",
      sm: "pl-3 pr-1.5",
      md: "pl-4 pr-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const rightAdornmentVariants = cva(
  "flex items-center text-gray-500 dark:text-gray-400 shrink-0",
  {
    variants: {
      size: {
        xs: "pr-2 pl-1",
        sm: "pr-3 pl-1.5",
        md: "pr-4 pl-2",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

/**
 * Label variants — hoisted out of the individual primitives so InputField,
 * TextArea, and Select share one definition. Historically every primitive
 * repeated the same class string inline; a change in one drifted from the
 * other two. Passing through the `labelStyle` axis here keeps them in
 * lockstep.
 *
 * - `default` — the original wp-admin-flavored label: tiny uppercase
 *   tracking-widest. Fits the portal / wp-admin surfaces that `@structura/ui`
 *   was originally designed for.
 * - `prominent` — full `text-sm font-bold` label with proper color
 *   contrast against the page, matched to the marketing site (`www/`) where
 *   a form is a featured surface rather than one row in a settings pane.
 *   Keeps labels legible as a first-class heading above the field instead of
 *   a subordinate eyebrow.
 */
export const formFieldLabelVariants = cva("block", {
  variants: {
    labelStyle: {
      default:
        "mb-2 text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500",
      prominent:
        "mb-1.5 text-sm font-bold text-neutral-900 dark:text-white",
    },
  },
  defaultVariants: {
    labelStyle: "default",
  },
});

/**
 * Description/Error Message Variants
 */
export const formFieldDescriptionVariants = cva("text-xs font-medium", {
  variants: {
    intent: {
      default: "text-gray-500 dark:text-gray-400",
      error: "text-red-600 dark:text-red-400",
    },
    view: {
      default: "mt-2",
      tooltip: [
        "absolute z-20 mt-1 hidden w-full rounded-xl border shadow-lg",
        "px-3 py-1.5",
        "group-hover/field:block",
      ],
      hidden: "sr-only",
    },
  },
  compoundVariants: [
    {
      intent: "error",
      view: "tooltip",
      class:
        "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950 dark:text-red-200",
    },
  ],
  defaultVariants: {
    intent: "default",
    view: "default",
  },
});
