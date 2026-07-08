import { cva } from "class-variance-authority";

/**
 * Alert variant definitions — Structura Design System.
 *
 * Layout model: a 2-column CSS grid. The icon (the only direct-child
 * `<svg>`) sits in column 1; Title / Description / Action / any other
 * non-svg direct children flow into column 2 in source order. When no
 * icon is present the content spans both columns. This replaces an
 * older `[&>svg]:absolute … [&>div]:pl-8` shortcut that only padded
 * direct-child `<div>`s — `Alert.Title` is an `<h5>`, so the title
 * collided with the icon at every call site that didn't wrap things
 * in an extra flex layout. The grid removes the need for those
 * wrappers entirely.
 *
 * Spec: `specs/design-guide.md` §5.5 (Alerts — rounded-xl, border,
 * p-4, semantic variants), §3.5 (motion — `transition-all` with
 * `--ease-out`).
 */
export const alert = cva(
  [
    "relative w-full rounded-xl border p-4 shadow-sm",
    // Transitions — ease-out at duration-normal.
    "transition-all duration-normal ease-out",
    // 2-column grid: icon | content. The icon column is sized to
    // its child (auto), the content column takes the rest.
    "grid grid-cols-[auto_1fr] gap-x-3",
    // Icon: the only direct-child <svg>. Pinned to (row 1, col 1)
    // and given a consistent 20px box so callers don't have to
    // remember to size it. `mt-0.5` nudges the optical centre to
    // line up with the title's cap height.
    "[&>svg]:size-5 [&>svg]:row-start-1 [&>svg]:col-start-1 [&>svg]:mt-0.5 [&>svg]:shrink-0",
    // Non-svg direct children flow into column 2. `min-w-0` lets
    // long text wrap instead of forcing the grid track to grow.
    "[&>:not(svg)]:col-start-2 [&>:not(svg)]:min-w-0",
    // No icon? Let content span both columns so left-padding
    // isn't visually orphaned.
    "[&:not(:has(>svg))>*]:col-start-1 [&:not(:has(>svg))>*]:col-end-3",
    // Links inside the alert inherit the variant text colour with
    // an underline, overriding WordPress admin's global `a` blue
    // and visited-purple. `!` wins specificity against wp-admin's
    // `.wrap a, #wpbody-content a, …` selectors.
    "[&_a:not(.button)]:font-medium [&_a:not(.button)]:underline [&_a:not(.button)]:underline-offset-2",
    "[&_a:not(.button)]:text-current! [&_a:not(.button):visited]:text-current!",
    "[&_a:not(.button):hover]:text-current! [&_a:not(.button):hover]:opacity-80",
    "[&_a:not(.button):focus-visible]:outline-2 [&_a:not(.button):focus-visible]:outline-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-white text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800 dark:ring-1 dark:ring-white/[0.04] [&>svg]:text-gray-500 dark:[&>svg]:text-gray-400",

        info:
          "bg-brand-50 text-brand-800 border-brand-100 dark:bg-brand-950/30 dark:text-brand-200 dark:border-brand-900/50 dark:ring-1 dark:ring-white/[0.04] [&>svg]:text-brand-600 dark:[&>svg]:text-brand-400",

        success:
          "bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/50 dark:ring-1 dark:ring-white/[0.04] [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400",

        warning:
          "bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/50 dark:ring-1 dark:ring-white/[0.04] [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",

        error:
          "bg-red-50 text-red-800 border-red-100 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50 dark:ring-1 dark:ring-white/[0.04] [&>svg]:text-red-600 dark:[&>svg]:text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);
