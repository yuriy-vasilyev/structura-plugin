import { cva } from "class-variance-authority";

/**
 * Badge variant definitions — Structura Design System
 *
 * Design guide references:
 * - Section 5.6: Badges — pill shape, uppercase (xs) or mixed-case (sm),
 *   intent × visual × size matrix
 * - Section 6.1: Border Radius Scale — rounded-full for badges
 * - Section 6.4: Motion — spring easing for playful interactions
 * - Section 6.5: Focus State Convention — soft glow pattern
 * - Section 3.6: Typography — xs badge uses
 *   `text-[10px] font-bold tracking-wide uppercase`, sm badge uses
 *   `text-xs font-semibold tracking-normal normal-case` (blog taxonomy,
 *   channel filters, topic-label surfaces)
 *
 * The `size` axis is **additive** — `xs` is the default and preserves
 * every pre-existing call-site's rendering exactly (same classes, same
 * order). The `sm` variant landed alongside the blog category/tag
 * surfaces per `specs/sitemap-and-blog-taxonomy.md` §5.5 + §10.1, where
 * the 10px uppercase status-chrome read wrong as a clickable topic
 * label at the bottom of a long-form post.
 */
export const badgeVariants = cva(
  [
    // Layout — shape only. Padding moves into the size axis so `sm`
    // can breathe a little more than `xs`.
    "inline-flex items-center gap-1 rounded-full",
    // Transitions — spring easing for badge pop (design guide 6.4)
    "transition-all duration-normal ease-spring",
    // Focus — soft glow pattern (design guide 6.5). Still applies in
    // the Link-wrapped configuration used by blog taxonomy chips —
    // consumers who want the focus ring on the wrapper instead pass
    // `tabIndex={-1}` + `className="focus:ring-0"` to the Badge.
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
  ],
  {
    variants: {
      intent: {
        default:
          "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
        primary:
          "bg-brand-600 text-white shadow-sm dark:bg-brand-500",
        success:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
        secondary:
          "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900",
        destructive:
          "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
        warning:
          "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
        info:
          "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
        premium:
          "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
        indigo:
          "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
        orange:
          "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
      },
      variant: {
        solid: "border border-transparent",
        // `bg-transparent!` + `dark:bg-transparent!` on purpose: the
        // `intent` axis above emits a paired `bg-*`/`dark:bg-*` for every
        // semantic (e.g. primary = `bg-brand-600 dark:bg-brand-500`).
        // Those classes are meant for the solid variant but always make
        // it onto the element regardless of `variant`, and Tailwind's
        // utility ordering puts keyword backgrounds like `bg-transparent`
        // *before* named-color backgrounds within the same bucket — so
        // the more-specific `dark:bg-brand-500` wins in dark mode and the
        // outline chip renders as a solid pill with dark-on-dark text.
        // (Reported 2026-04-24 — category chips on
        // `/en/blog/best-wordpress-ai-content-automation-for-agencies`
        // appeared as filled indigo blocks.) Using the `!` suffix is the
        // cheapest surgical fix: it hoists both background declarations
        // above the intent pair without restructuring the axis, and
        // matches the `m-0!` pattern the SPA uses to punch through
        // wp-admin's margin cascade.
        outline: "bg-transparent! dark:bg-transparent! border",
      },
      size: {
        // Status-chrome scale (default). Matches the pre-size-axis
        // rendering exactly — byte-identical output with every
        // existing `<Badge intent="..." variant="...">` call-site.
        xs: "px-2.5 py-1 text-[10px] uppercase font-bold leading-none tracking-wide",
        // Topic-label scale (new, see spec §10.1). Mixed-case, less
        // aggressive tracking, slightly larger. Used by blog
        // category/tag surfaces and future channel-filter chips.
        sm: "px-3 py-1 text-xs normal-case font-semibold leading-tight tracking-normal",
      },
    },
    compoundVariants: [
      // ─── Outline Variants ────────────────────────────────────────────
      {
        variant: "outline",
        intent: "default",
        className: "border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400",
      },
      {
        variant: "outline",
        intent: "primary",
        className: "border-brand-300 text-brand-600 dark:border-brand-500/40 dark:text-brand-400",
      },
      {
        variant: "outline",
        intent: "success",
        className: "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
      },
      {
        variant: "outline",
        intent: "secondary",
        className: "border-neutral-900 text-neutral-900 dark:border-neutral-300 dark:text-neutral-100",
      },
      {
        variant: "outline",
        intent: "destructive",
        className: "border-red-200 text-red-700 dark:border-red-800 dark:text-red-400",
      },
      {
        variant: "outline",
        intent: "warning",
        className: "border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400",
      },
      {
        variant: "outline",
        intent: "info",
        className: "border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-400",
      },
      {
        variant: "outline",
        intent: "premium",
        className: "border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-400",
      },
      {
        variant: "outline",
        intent: "indigo",
        className: "border-brand-200 text-brand-700 dark:border-brand-800 dark:text-brand-400",
      },
      {
        variant: "outline",
        intent: "orange",
        className: "border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-400",
      },

      // ─── Solid Variants (border + dark mode glass-edge) ─────────────
      {
        variant: "solid",
        intent: "default",
        className: "border-neutral-200 dark:border-neutral-700 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "primary",
        className: "border-brand-700 dark:border-brand-400 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "success",
        className: "border-emerald-100 dark:border-emerald-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "secondary",
        className: "border-neutral-800 dark:border-neutral-200 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "destructive",
        className: "border-red-100 dark:border-red-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "warning",
        className: "border-amber-100 dark:border-amber-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "info",
        className: "border-blue-100 dark:border-blue-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "premium",
        className: "border-purple-100 dark:border-purple-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "indigo",
        className: "border-brand-100 dark:border-brand-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
      {
        variant: "solid",
        intent: "orange",
        className: "border-orange-100 dark:border-orange-900/50 dark:ring-1 dark:ring-white/[0.04]",
      },
    ],
    defaultVariants: {
      intent: "default",
      variant: "solid",
      size: "xs",
    },
  }
);
