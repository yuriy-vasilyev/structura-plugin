/**
 * Pure helpers for the `<Pagination>` component. Lives in a standalone file
 * (not inside `Pagination.tsx`) so downstream workspaces can import and
 * unit-test it without pulling in React. The package exposes this file
 * directly as a TS source path via `@structura/ui/pagination-utils` so
 * tests don't need the dist build to be current.
 */

/**
 * One item in the resolved page list. Either a clickable page number or
 * a visual gap (ellipsis) between two non-contiguous numbers.
 */
export type PageItem =
  | { kind: "page"; number: number }
  | { kind: "ellipsis"; id: string };

/**
 * Build the list of page numbers + ellipses to render. Ported from the
 * legacy Blade pagination component so the UX stays identical:
 *
 *   - Always show page 1 and the last page.
 *   - Show `current ± range` numbers.
 *   - Insert `…` when there's a gap between the always-shown edges and
 *     the current window.
 *
 * Edge cases:
 *   - `total <= 1`             → empty array (caller should not render the nav)
 *   - `current` out of range   → clamped to [1, total]
 *   - `range < 0`              → treated as 0
 */
export function buildPageList(
  current: number,
  total: number,
  range = 2
): ReadonlyArray<PageItem> {
  if (total <= 1) return [];

  const safeRange = Math.max(0, range);
  const safeCurrent = Math.min(Math.max(1, current), total);

  const shouldShow = (i: number): boolean =>
    i === 1 ||
    i === total ||
    (i >= safeCurrent - safeRange && i <= safeCurrent + safeRange);

  const items: PageItem[] = [];
  let lastShown = 0;

  for (let i = 1; i <= total; i++) {
    if (!shouldShow(i)) continue;
    if (lastShown && i - lastShown > 1) {
      // Stable id makes React keys deterministic across renders —
      // important because two ellipses can appear in long ranges.
      items.push({ kind: "ellipsis", id: `gap-${lastShown}-${i}` });
    }
    items.push({ kind: "page", number: i });
    lastShown = i;
  }

  return items;
}
