import { FC, Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "../utils";

/**
 * One cell in the comparison table. The shape is intentionally narrow so the
 * caller can decide what each value means semantically:
 *
 *   - `true`  → green check, "Included"
 *   - `false` → muted dash, "Not included"
 *   - `string` → render as text. Used for everything that isn't a binary
 *                yes/no — token quotas ("2M"), price-formatted add-ons
 *                ("$7 add-on"), tier text ("White-glove"), placeholders ("—").
 *
 * `null`/`undefined` is treated as "not included" so callers can omit a key
 * for any column the row doesn't apply to.
 */
export type ComparisonCell = boolean | string | null;

export interface ComparisonRow {
  /** Row label rendered in the sticky first column. */
  label: string;
  wpOrg: ComparisonCell;
  free: ComparisonCell;
  byok: ComparisonCell;
  cloud: ComparisonCell;
  cloud_pro: ComparisonCell;
}

export interface ComparisonGroup {
  /** Stable id used as the React key + rendered as a hidden anchor. */
  id: string;
  /** Group heading rendered as a full-width section row. */
  title: string;
  rows: ReadonlyArray<ComparisonRow>;
}

export interface ComparisonMatrixLabels {
  /** Eyebrow above the section title (e.g. "Compare plans"). */
  eyebrow: string;
  /** Section title (e.g. "Full feature comparison"). */
  title: string;
  /** Optional supporting paragraph beneath the title. */
  description?: string;
  /** Column headers — one per plan + one for the row label column. */
  columns: {
    feature: string;
    wpOrg: string;
    free: string;
    byok: string;
    cloud: string;
    cloud_pro: string;
  };
  /** Visually-hidden labels used by the cell icons for screen readers. */
  cellAria: {
    included: string;
    notIncluded: string;
  };
}

export interface ComparisonMatrixProps {
  groups: ReadonlyArray<ComparisonGroup>;
  labels: ComparisonMatrixLabels;
  /**
   * Whether to render the `WP.org` column. Defaults to `true`. Set to
   * `false` while the wp.org plugin listing isn't live yet — the data
   * shape (rows still carry `wpOrg` cells, labels still carry the
   * column header) is intentionally unchanged so flipping back to
   * `true` on launch day surfaces the column with no data migration.
   */
  includeWpOrg?: boolean;
}

type PlanKey = "wpOrg" | "free" | "byok" | "cloud" | "cloud_pro";

const ALL_PLAN_KEYS: ReadonlyArray<PlanKey> = [
  "wpOrg",
  "free",
  "byok",
  "cloud",
  "cloud_pro",
];

/**
 * Per-column theming. The Agency column is emphasized with an amber accent
 * that matches the TOP TIER badge; the Pro column gets a quiet brand tint
 * that mirrors the MOST POPULAR badge. Both tints are *background only* —
 * text color lives in `COLUMN_HEADER_TINT` so `twMerge` can't collapse the
 * amber accent into a neutral header color.
 *
 * Agency was previously `bg-neutral-950` in both modes to match the dark
 * premium card upstream. That worked in dark mode but in light mode it
 * printed a single pitch-black column in the middle of an otherwise white
 * table, which read as "something rendered wrong" — not "this tier is
 * special". The amber tint keeps the "this is the premium column" signal
 * while staying visually coherent with the surrounding light surface.
 */
const COLUMN_TINT: Record<PlanKey, string> = {
  wpOrg: "",
  free: "",
  byok: "bg-brand-50/60 dark:bg-brand-500/[0.04]",
  cloud: "",
  cloud_pro: "bg-gold-50/70 dark:bg-gold-500/[0.06]",
};

const COLUMN_HEADER_TINT: Record<PlanKey, string> = {
  wpOrg: "text-neutral-600 dark:text-neutral-300",
  free: "text-neutral-600 dark:text-neutral-300",
  byok: "text-brand-700 dark:text-brand-300",
  cloud: "text-neutral-600 dark:text-neutral-300",
  cloud_pro: "text-gold-700 dark:text-gold-300",
};

/**
 * Renders one cell value. Booleans become icons; strings are rendered as-is
 * with a slightly bolder weight so plan-specific detail ("$7 add-on", "2M",
 * "White-glove") jumps out from the surrounding checks.
 *
 * The `premium` tone pairs with `COLUMN_TINT.agency` (a gold-tinted
 * surface in both modes). Check + text colors lean amber so the column
 * reads as the gold-accented premium track top-to-bottom.
 */
const Cell: FC<{
  value: ComparisonCell;
  ariaIncluded: string;
  ariaNotIncluded: string;
  tone: "default" | "premium";
}> = ({ value, ariaIncluded, ariaNotIncluded, tone }) => {
  if (value === true) {
    return (
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full",
          tone === "premium"
            ? "bg-gold-100 text-gold-700 dark:bg-gold-500/15 dark:text-gold-300"
            : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
        )}
      >
        <Check size={14} strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{ariaIncluded}</span>
      </span>
    );
  }

  if (value === false || value == null) {
    return (
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center",
          tone === "premium"
            ? "text-gold-300 dark:text-gold-700/60"
            : "text-neutral-300 dark:text-neutral-600"
        )}
      >
        <Minus size={14} aria-hidden="true" />
        <span className="sr-only">{ariaNotIncluded}</span>
      </span>
    );
  }

  // String value — the "—" placeholder also lands here so it stays muted.
  const isPlaceholder = value.trim() === "—";
  return (
    <span
      className={cn(
        "text-sm font-semibold",
        isPlaceholder
          ? tone === "premium"
            ? "text-gold-300 dark:text-gold-700/60"
            : "text-neutral-400 dark:text-neutral-600"
          : tone === "premium"
            ? "text-gold-800 dark:text-gold-200"
            : "text-neutral-900 dark:text-white"
      )}
    >
      {value}
    </span>
  );
};

/**
 * Side-by-side feature matrix for the WP.org plugin and the four paid tiers.
 * Lives below the per-tier cards and the volume strip — the cards are for
 * scanning, this is for visitors who need every row before they pick.
 *
 * Pure presentational composite. No hooks, no fetches, no i18n runtime —
 * the host app passes pre-resolved strings via `labels` and `groups`.
 *
 * Responsive layout:
 *   - `md:` and up render the 6-column table (all plans side-by-side). The
 *     table has an intrinsic 760px width and can scroll horizontally
 *     inside its rounded surface if the viewport is between md and lg.
 *   - Below `md:` the table view is hidden and replaced by a stacked
 *     per-plan accordion. Each plan becomes a native `<details>` element —
 *     no JS, works server-rendered, and Pro opens by default so the
 *     recommended tier is scannable without a tap. The accordion trades
 *     density for mobile-friendliness: no horizontal scrolling, no
 *     squinting at a 430px viewport trying to read across 6 columns.
 *
 * Spec: marketing/PRICING-PAGE-COPY-V2.md §"Feature comparison table".
 */
export const ComparisonMatrix: FC<ComparisonMatrixProps> = ({
  groups,
  labels,
  includeWpOrg = true,
}) => {
  const planKeys = includeWpOrg
    ? ALL_PLAN_KEYS
    : ALL_PLAN_KEYS.filter((key) => key !== "wpOrg");
  // colSpan for the section heading row covers the row-label column
  // plus every rendered plan column. Was hardcoded to 6 before wpOrg
  // became optional; derive so it stays correct in both states.
  const groupHeadingColSpan = planKeys.length + 1;
  return (
  <section
    aria-labelledby="comparison-matrix-title"
    // `min-w-0` is the critical bit here: inside a flex column ancestor the
    // default `min-width: auto` lets the table's intrinsic 760px width
    // leak out through `overflow-x-auto` and push the page into horizontal
    // scroll at ~430px viewports. Forcing min-width to 0 lets the table
    // container shrink below intrinsic content width so the inner
    // `overflow-x-auto` can actually do its job.
    //
    // No horizontal padding here — the host page (`app/[locale]/pricing/
    // page.tsx`) already supplies `px-6` on its section wrapper, and our
    // sibling pricing components (`AgencyVolumeStrip`, `JustThePluginSection`)
    // don't double-pad either. Match that convention.
    className="mx-auto mt-20 w-full max-w-7xl min-w-0"
  >
    <div className="mb-10 text-center">
      <p className="mb-3 text-xs font-bold tracking-widest text-brand-600 uppercase dark:text-brand-400">
        {labels.eyebrow}
      </p>
      <h2
        id="comparison-matrix-title"
        className="font-display text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl dark:text-white"
      >
        {labels.title}
      </h2>
      {labels.description && (
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {labels.description}
        </p>
      )}
    </div>

    {/* Mobile (< md): stacked per-plan accordions. The table view is too
        wide to read on a 430px viewport even with horizontal scrolling —
        users don't know there's more content to the right, and even if
        they scroll they lose the row label context. One plan at a time,
        expandable, keeps the density reasonable without sacrificing any
        row from the comparison. */}
    <div className="space-y-3 md:hidden">
      {planKeys.map((planKey) => (
        <details
          key={planKey}
          // Pro is the recommended tier — opening it by default means the
          // "most likely answer" is already visible without a tap. Agency
          // and Cloud stay collapsed to keep the page length sane.
          open={planKey === "byok"}
          className={cn(
            "group overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]",
            planKey === "cloud_pro"
              ? "border-gold-200 dark:border-gold-500/20"
              : planKey === "byok"
                ? "border-brand-300 dark:border-brand-500/30"
                : "border-neutral-200 dark:border-neutral-800"
          )}
        >
          <summary
            className={cn(
              // `list-none` removes the default disclosure marker so we
              // can render our own chevron that flips on open/close.
              "flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-bold uppercase tracking-wider",
              COLUMN_HEADER_TINT[planKey]
            )}
          >
            <span>{labels.columns[planKey]}</span>
            <span
              aria-hidden="true"
              className="text-xs transition-transform duration-fast group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="border-t border-neutral-200 dark:border-neutral-800">
            {groups.map((group) => (
              <div key={group.id}>
                <div className="bg-neutral-50/60 px-5 py-2 text-[11px] font-bold tracking-widest text-neutral-500 uppercase dark:bg-neutral-900/60 dark:text-neutral-400">
                  {group.title}
                </div>
                <dl className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {group.rows.map((row, rowIdx) => (
                    <div
                      key={`${group.id}-${rowIdx}`}
                      className="flex items-center justify-between gap-4 px-5 py-3"
                    >
                      <dt className="text-sm text-neutral-700 dark:text-neutral-200">
                        {row.label}
                      </dt>
                      <dd className="shrink-0">
                        <Cell
                          value={row[planKey]}
                          ariaIncluded={labels.cellAria.included}
                          ariaNotIncluded={labels.cellAria.notIncluded}
                          tone={planKey === "cloud_pro" ? "premium" : "default"}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>

    {/* Desktop (md+): the original 6-column table. */}
    <div className="hidden w-full overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04] md:block">
      {/* `w-full` + `max-w-full` pin the scroll container to the card's
          content box; without max-w-full Safari has been seen to let the
          intrinsic 760px table width establish the scroller's outer size
          and bubble horizontal overflow up to the page. */}
      <div className="w-full max-w-full overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/60">
              <th
                scope="col"
                className="sticky left-0 z-10 w-[34%] bg-neutral-50/60 px-6 py-5 text-xs font-bold tracking-widest text-neutral-500 uppercase dark:bg-neutral-900/60"
              >
                {labels.columns.feature}
              </th>
              {planKeys.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className={cn(
                    "px-4 py-5 text-center text-sm font-bold uppercase tracking-wider",
                    COLUMN_HEADER_TINT[key],
                    COLUMN_TINT[key]
                  )}
                >
                  {labels.columns[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.id}>
                <tr className="border-b border-neutral-200 bg-neutral-50/40 dark:border-neutral-800 dark:bg-neutral-900/40">
                  <th
                    scope="rowgroup"
                    colSpan={groupHeadingColSpan}
                    className="px-6 py-3 text-left text-[11px] font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
                  >
                    {group.title}
                  </th>
                </tr>
                {group.rows.map((row, rowIdx) => (
                  <tr
                    key={`${group.id}-${rowIdx}`}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-6 py-4 text-left text-sm font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                    >
                      {row.label}
                    </th>
                    {planKeys.map((key) => (
                      <td
                        key={key}
                        className={cn(
                          "px-4 py-4 text-center align-middle",
                          COLUMN_TINT[key]
                        )}
                      >
                        <Cell
                          value={row[key]}
                          ariaIncluded={labels.cellAria.included}
                          ariaNotIncluded={labels.cellAria.notIncluded}
                          tone={key === "cloud_pro" ? "premium" : "default"}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
  );
};
