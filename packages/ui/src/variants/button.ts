import { cva } from "class-variance-authority";

/**
 * Button variant definitions — Structura Design System
 *
 * Design guide references:
 * - Section 5.1: Buttons — 7 variants × 4 sizes
 * - Section 6.5: Focus State Convention — soft glow pattern
 * - Section 3.5 Target: Motion — scale(1.02) hover, scale(0.98) press, --ease-out at --duration-fast
 * - Section 7.1: CSS Reset Conflicts — WordPress admin ships `a { color }`,
 *   `a:hover { color }`, `a:focus { color }`, `a:visited { color }` rules
 *   that leak into any Button used with `asChild` wrapping a `<Link>` or
 *   with a plain `href` (both render as <a>). Tailwind utility specificity
 *   alone loses, so every text-color utility in this file uses the `!`
 *   (important) modifier. Every variant ALSO re-asserts the text color on
 *   `hover`, `focus`, `active`, and `visited` — because WP admin sets
 *   color on all four pseudo-states and the browser otherwise flashes
 *   link colors the moment the user interacts with the button.
 *
 * If you add a new variant here, the rule is: every text-color class must
 * be `!`, and if the variant renders as <a>, cover hover/focus/visited
 * even if the color doesn't change. Cheaper than chasing "why is my button
 * blue" bugs later.
 */
export const buttonVariants = cva(
  [
    // Layout
    "relative group/button inline-flex items-center justify-center font-bold text-nowrap cursor-pointer",
    // Transitions — spring deceleration (--ease-out) at --duration-fast
    "transition-all duration-fast ease-out",
    // Disabled
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none",
    // Focus — soft glow pattern (design guide 6.5)
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
    // Micro-interactions (design guide 5.1 target)
    "hover:scale-[1.02] active:scale-[0.98]",
    // WP admin link-color reset — when asChild wraps <Link>→<a> or href is
    // set, WP's `a:visited` color flashes through. `no-underline!` blocks
    // the default <a> underline from WP admin too.
    "no-underline! visited:text-inherit! hover:text-inherit! focus:text-inherit!",
    // Icon defaults — every Button is permitted exactly one inline icon
    // before/after its label. Size is locked so a stray `<Icon size={N}/>`
    // can't desync from the label, `shrink-0` keeps it from collapsing
    // when the label wraps, and stroke-width 2.5 matches the label's
    // `font-bold`. Per-size overrides below tune the dimensions.
    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:[stroke-width:2.5]",
    // Default gap between an icon and the label. The non-asChild branch
    // also applies this gap onto the inner content `<span>` (see
    // Button.tsx) since the outer button has only one direct child.
    "gap-2",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          // Structura Primary: Electric Indigo. Text is white in both modes.
          "bg-brand-600 text-white! visited:text-white! hover:text-white! focus:text-white! active:text-white! border border-transparent hover:bg-brand-700 shadow-lg shadow-brand-600/20 hover:-translate-y-0.5 active:translate-y-0 dark:bg-brand-500 dark:hover:bg-brand-400 dark:shadow-brand-500/20",

        accent:
          // Structura Obsidian: Deep Gray/Black. White text in light mode,
          // inverts to dark text on light button in dark mode.
          "bg-gray-900 text-white! visited:text-white! hover:text-white! focus:text-white! active:text-white! border border-transparent hover:bg-gray-800 shadow-lg shadow-gray-900/20 hover:-translate-y-0.5 active:translate-y-0 dark:bg-white dark:text-gray-900! dark:visited:text-gray-900! dark:hover:text-gray-900! dark:focus:text-gray-900! dark:active:text-gray-900! dark:hover:bg-gray-100 dark:shadow-white/10",

        secondary:
          // Standard secondary: White with Gray border. All text-color
          // utilities already use `!` here (WP conflict was found during
          // Phase 2 when this variant used asChild + Link).
          "bg-white! text-gray-700! visited:text-gray-700! focus:text-gray-700! active:text-gray-700! border border-gray-200! hover:bg-gray-50! hover:text-gray-900! hover:border-gray-300! shadow-sm dark:bg-gray-900! dark:border-gray-700! dark:text-gray-300! dark:visited:text-gray-300! dark:focus:text-gray-300! dark:active:text-gray-300! dark:hover:bg-gray-800! dark:hover:text-gray-100! dark:hover:border-gray-600!",

        danger:
          // Semantic Red. Locked white in light mode, red-tinted white in dark.
          "bg-red-600 text-white! visited:text-white! hover:text-white! focus:text-white! active:text-white! border border-transparent hover:bg-red-700 shadow-md shadow-red-600/20 dark:bg-red-900/50 dark:text-red-100! dark:visited:text-red-100! dark:hover:text-red-100! dark:focus:text-red-100! dark:active:text-red-100! dark:border-red-900 dark:hover:bg-red-900",

        link:
          // Link style: Brand text. Disable scale micro-interactions for
          // inline links; they should feel like text, not buttons.
          "bg-transparent text-brand-600! visited:text-brand-600! focus:text-brand-600! underline-offset-4 hover:underline disabled:no-underline p-0 h-auto hover:text-brand-700! active:text-brand-700! hover:scale-100 active:scale-100 dark:text-brand-400! dark:visited:text-brand-400! dark:focus:text-brand-400! dark:hover:text-brand-300! dark:active:text-brand-300!",

        transparent:
          // Ghost/Transparent: sidebar items, quiet actions.
          "bg-transparent text-gray-600! visited:text-gray-600! focus:text-gray-600! active:text-gray-600! border border-transparent hover:bg-gray-100 hover:text-gray-900! dark:text-gray-400! dark:visited:text-gray-400! dark:focus:text-gray-400! dark:active:text-gray-400! dark:hover:bg-gray-800 dark:hover:text-white!",

        white:
          // Neutral bordered button.
          "bg-white text-gray-900! visited:text-gray-900! hover:text-gray-900! focus:text-gray-900! active:text-gray-900! border border-gray-300 hover:bg-gray-50 shadow-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white! dark:visited:text-white! dark:hover:text-white! dark:focus:text-white! dark:active:text-white! dark:hover:bg-gray-700",
      },
      size: {
        // Per-size icon dimensions and gaps. The base classes set
        // `[&_svg]:size-4 gap-2` for `md`; `sm` tightens both, `lg`
        // loosens both. `icon` keeps the default svg size and zeroes
        // the gap since the button is icon-only.
        sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5 [&_svg]:size-3.5",
        md: "px-5 py-2.5 text-sm rounded-xl",
        lg: "px-6 py-3 text-base rounded-2xl gap-2.5 [&_svg]:size-5",
        icon: "h-10 w-10 p-2 rounded-xl gap-0 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);
