import type { FC, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";
import { Spinner } from "./Spinner";

/**
 * In-page loader for async data inside a route or card.
 *
 * Positioned deliberately *between* two existing surfaces:
 *
 *   - `<AppLoader />` — the full-bleed brand loader with the animated
 *     Structura logo and "Initializing core…" copy. That surface is
 *     intentionally dramatic: it tells the user "the whole app is
 *     booting." Using it for a per-record fetch (e.g. a single run's
 *     detail) misleads the user and visually clips inside narrow
 *     containers because its `min-h-[70vh]` and solid background
 *     override the parent layout.
 *   - `<Spinner />` — a bare icon. Useful inline (e.g. inside a
 *     button) but has no label/centering/spacing, so every caller
 *     re-invents the same "centered spinner with a caption" layout.
 *
 * `PageLoader` is the middle: centered spinner + optional caption,
 * no background fill, no forced viewport height. The caller controls
 * the surrounding container (card, page section, overlay). The
 * component only draws *content*; it doesn't lay claim to real estate.
 *
 * Accessibility: announces itself via `role="status"` with an
 * `aria-live="polite"` region carrying the caption. When no caption
 * is provided, falls back to a generic localised string via the
 * `srOnlyLabel` prop so screen-reader users still hear a
 * status — silently spinning loaders are an a11y failure mode.
 */
const pageLoaderVariants = cva(
  "flex flex-col items-center justify-center gap-3 text-neutral-500 dark:text-neutral-400",
  {
    variants: {
      padding: {
        /**
         * No vertical padding. Use when the parent already provides
         * spacing (e.g. a Card with its own p-5) and the loader is
         * replacing the card's inner content for the loading state.
         */
        none: "",
        /**
         * Comfortable padding for inline "this section is loading"
         * uses — the default for most in-route use cases.
         */
        md: "py-10",
        /**
         * Extra breathing room for full-page route-level loaders
         * where the rest of the page is empty. Smaller than
         * AppLoader's `min-h-[70vh]` on purpose — the page shell
         * (header, breadcrumb) is visible above/below.
         */
        lg: "py-16",
      },
    },
    defaultVariants: {
      padding: "md",
    },
  },
);

export interface PageLoaderProps
  extends VariantProps<typeof pageLoaderVariants> {
  /**
   * Visible caption under the spinner. Keep short — this is a transient
   * surface, not a place for explanations. Examples: "Loading run…",
   * "Fetching latest data…". If absent, the spinner renders alone and
   * `srOnlyLabel` is used purely for screen readers.
   */
  label?: ReactNode;
  /**
   * Screen-reader-only label announced when `label` is not provided,
   * so AT users still hear that content is loading. Defaults to
   * "Loading…". Components that wrap this in a translated context
   * should pass `__("Loading…", "structura")` etc. explicitly.
   */
  srOnlyLabel?: string;
  /** Spinner size. Defaults to `md` — `lg` is for full-route loaders. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const PageLoader: FC<PageLoaderProps> = ({
  label,
  srOnlyLabel = "Loading…",
  size = "md",
  padding,
  className,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(pageLoaderVariants({ padding }), className)}
    >
      <Spinner size={size} />
      {label ? (
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          {label}
        </span>
      ) : (
        <span className="sr-only">{srOnlyLabel}</span>
      )}
    </div>
  );
};
