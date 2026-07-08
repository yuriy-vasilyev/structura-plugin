import { FC } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../utils";
import { buildPageList, type PageItem } from "./pagination-utils";

// Re-export so the public surface is unchanged for callers that have been
// importing `buildPageList` / `PageItem` from `@structura/ui`.
export { buildPageList };
export type { PageItem };

export interface PaginationLabels {
  /** `aria-label` on the outer `<nav>`. e.g. "Pagination". */
  ariaLabel: string;
  /** sr-only label on the previous chevron. e.g. "Previous". */
  previous: string;
  /** sr-only label on the next chevron. e.g. "Next". */
  next: string;
  /**
   * sr-only template for non-current page links. `{{n}}` is the page
   * number. e.g. "Go to page {{n}}".
   */
  pageNumber: string;
  /**
   * sr-only template for the current page. `{{n}}` is the page number.
   * e.g. "Current page, page {{n}}".
   */
  currentPage: string;
}

export interface PaginationProps {
  /** 1-based current page. */
  current: number;
  /** Total number of pages. Pagination does not render when `<= 1`. */
  total: number;
  /** Number of pages to show either side of `current`. Default 2. */
  range?: number;
  /**
   * Resolves a page number to an href. Usually `(n) => "/blog/page/" + n`
   * with a special case for page 1 (e.g. `"/blog"`). Keeping this a caller-
   * supplied function means the component is URL-shape-agnostic.
   */
  hrefForPage: (pageNumber: number) => string;
  labels: PaginationLabels;
  /** Additional classes appended to the outer `<nav>`. */
  className?: string;
}

const interpolate = (template: string, n: number): string =>
  template.replace(/\{\{n\}\}/g, String(n));

/**
 * Visual treatment of the disabled prev/next chevron placeholder. A visible
 * placeholder (rather than hiding the button entirely) keeps the nav's
 * total width stable as the visitor moves between pages, so the numbered
 * chips don't shift horizontally.
 */
const DISABLED_CHEVRON_CLS =
  "flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-700";

const ACTIVE_CHEVRON_CLS =
  "flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 transition-all duration-fast hover:border-brand-600 hover:text-brand-600 hover:shadow-lg hover:shadow-brand-500/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-brand-400 dark:hover:text-brand-300";

/**
 * Pagination control — ported from the legacy Blade component. Mirrors its
 * shape (prev chevron, numbered chips with first/last + current ± range,
 * ellipses, next chevron) but lives in `@structura/ui` so both the
 * marketing site and any future archive routes can share it.
 *
 * Intentionally presentational:
 *   - no `next/link` dependency — each chip is a plain `<a>`, the caller
 *     decides whether to upgrade to `next/link` at the call site
 *   - no i18n runtime — all strings come through `labels`
 *   - no click handlers — navigation is pure href, which means the
 *     component works under SSR and "open in new tab" without JS
 *
 * Accessibility:
 *   - outer `<nav aria-label>` announces the landmark to screen readers
 *   - prev/next have chevron icons + sr-only labels
 *   - the current page uses `aria-current="page"` and its own sr-only
 *     phrasing ("Current page, page 3") so AT users aren't left guessing
 *   - disabled prev/next render as non-interactive spans, keeping focus
 *     order predictable
 */
export const Pagination: FC<PaginationProps> = ({
  current,
  total,
  range = 2,
  hrefForPage,
  labels,
  className,
}) => {
  const items = buildPageList(current, total, range);
  if (items.length === 0) return null;

  const hasPrev = current > 1;
  const hasNext = current < total;

  return (
    <nav
      aria-label={labels.ariaLabel}
      className={cn("mt-12 flex justify-center lg:mt-20", className)}
    >
      <ul className="flex list-none items-center gap-2 p-0 text-sm font-bold">
        <li>
          {hasPrev ? (
            <a
              href={hrefForPage(current - 1)}
              rel="prev"
              className={ACTIVE_CHEVRON_CLS}
            >
              <span className="sr-only">{labels.previous}</span>
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </a>
          ) : (
            <span aria-disabled="true" className={DISABLED_CHEVRON_CLS}>
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </span>
          )}
        </li>

        {items.map((item) =>
          item.kind === "ellipsis" ? (
            <li
              key={item.id}
              aria-hidden="true"
              className="flex h-10 w-8 items-center justify-center font-mono text-neutral-400"
            >
              …
            </li>
          ) : item.number === current ? (
            <li key={item.number}>
              <span
                aria-current="page"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/20 ring-1 ring-brand-600 transition-all dark:bg-brand-500 dark:shadow-brand-500/30 dark:ring-brand-500"
              >
                <span className="sr-only">
                  {interpolate(labels.currentPage, item.number)}
                </span>
                <span aria-hidden="true">{item.number}</span>
              </span>
            </li>
          ) : (
            <li key={item.number}>
              <a
                href={hrefForPage(item.number)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-neutral-600 transition-all duration-fast hover:bg-neutral-100 hover:text-brand-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <span className="sr-only">
                  {interpolate(labels.pageNumber, item.number)}
                </span>
                <span aria-hidden="true">{item.number}</span>
              </a>
            </li>
          )
        )}

        <li>
          {hasNext ? (
            <a
              href={hrefForPage(current + 1)}
              rel="next"
              className={ACTIVE_CHEVRON_CLS}
            >
              <span className="sr-only">{labels.next}</span>
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </a>
          ) : (
            <span aria-disabled="true" className={DISABLED_CHEVRON_CLS}>
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
};
