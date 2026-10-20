import { FC, Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "../utils";
import { VolumeSelect, type VolumeSelectProps } from "./VolumeSelect";

/**
 * One cell in the comparison table. The shape is intentionally narrow so the
 * caller can decide what each value means semantically:
 *
 *   - `true`  → check, "Included"
 *   - `false` → muted dash, "Not included"
 *   - `string` → render as text. Used for everything that isn't a binary
 *                yes/no — allowances ("30"), tier text ("White-glove"),
 *                placeholders ("—").
 *
 * `null`/`undefined` is treated as "not included" so callers can omit a key
 * for any column the row doesn't apply to.
 */
export type ComparisonCell = boolean | string | null;

export interface ComparisonRow {
  /** Row label rendered in the first column. */
  label: string;
  wpOrg: ComparisonCell;
  free: ComparisonCell;
  byok: ComparisonCell;
  /**
   * The Cloud cell for the selected volume option. Volume-dependent rows
   * (posts, images, videos, rates) are resolved by the caller from the
   * selection; the matrix only renders them.
   */
  cloud: ComparisonCell;
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
  /**
   * The Cloud column follows one volume option. `selector` renders a compact
   * labelled select beside the title, bound to the same selection as the
   * Cloud plan card; `columnNote` sits under the Cloud header (e.g. "100
   * posts selected"). Absent → a static Cloud column.
   */
  cloudVolume?: {
    selector: VolumeSelectProps;
    columnNote: string;
  };
}

type PlanKey = "wpOrg" | "free" | "byok" | "cloud";

const ALL_PLAN_KEYS: ReadonlyArray<PlanKey> = ["wpOrg", "free", "byok", "cloud"];

/**
 * Renders one cell value. Booleans become icons; strings are rendered as-is
 * with a slightly bolder weight so plan-specific detail ("30", "White-glove")
 * stands out from the surrounding checks.
 */
const Cell: FC<{
  value: ComparisonCell;
  ariaIncluded: string;
  ariaNotIncluded: string;
}> = ({ value, ariaIncluded, ariaNotIncluded }) => {
  if (value === true) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
        <Check size={14} strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{ariaIncluded}</span>
      </span>
    );
  }

  if (value === false || value == null) {
    return (
      <span className="inline-flex size-6 items-center justify-center text-neutral-500 dark:text-neutral-400">
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
        isPlaceholder ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-white"
      )}
    >
      {value}
    </span>
  );
};

/**
 * Side-by-side feature matrix for the WP.org plugin and the Free, BYOK and
 * Cloud plans. Lives below the plan cards and the volume strip — the cards
 * are for scanning, this is for visitors who need every row before they pick.
 *
 * Since 2026-10-12 (specs/cloud-volume-pricing-design.md "Comparison
 * matrix") there is one Cloud column that follows the selected volume, and
 * the Cloud Pro column is gone.
 *
 * Pure presentational composite. No fetches, no i18n runtime — the host app
 * passes pre-resolved strings via `labels` and `groups`.
 *
 * Responsive layout, no horizontal scrolling at any width:
 *   - `md:` and up render the table, every plan side by side.
 *   - Below `md:` each feature becomes a labelled block with one value per
 *     plan, so a value is never separated from its plan name.
 *
 * Spec: marketing/PRICING-PAGE-COPY-V2.md §"Feature comparison table".
 */
export const ComparisonMatrix: FC<ComparisonMatrixProps> = ({
  groups,
  labels,
  includeWpOrg = true,
  cloudVolume,
}) => {
  const planKeys = includeWpOrg
    ? ALL_PLAN_KEYS
    : ALL_PLAN_KEYS.filter((key) => key !== "wpOrg");
  // colSpan for the section heading row covers the row-label column plus
  // every rendered plan column.
  const groupHeadingColSpan = planKeys.length + 1;
  return (
    <section
      aria-labelledby="comparison-matrix-title"
      // No horizontal padding here — the host page supplies it, like the
      // sibling pricing components (`AgencyVolumeStrip`,
      // `JustThePluginSection`).
      className="mx-auto mt-20 w-full max-w-6xl min-w-0"
    >
      <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {/* The eyebrow carries the query and is the heading; the display line
              is copy. Same rule as www's SectionHeading (site-wide since
              2026-09-26) — kept inline here because this package cannot import
              from www. */}
          <h2
            id="comparison-matrix-title"
            className="mb-3 text-xs font-bold tracking-widest text-brand-700 uppercase dark:text-brand-300"
          >
            {labels.eyebrow}
          </h2>
          <p className="font-display text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            {labels.title}
          </p>
          {labels.description && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {labels.description}
            </p>
          )}
        </div>
        {cloudVolume && (
          <VolumeSelect {...cloudVolume.selector} className="w-full shrink-0 md:w-60" />
        )}
      </div>

      {/* Phones (< md): one labelled block per feature with a value per plan.
          A table squeezed to 390px loses the row label or forces horizontal
          scrolling; neither is acceptable (design handoff 2026-10-12). */}
      <div className="md:hidden">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`comparison-${group.id}-mobile`}>
            <h3
              id={`comparison-${group.id}-mobile`}
              className="border-t border-neutral-200 pt-6 pb-2 text-[11px] font-bold tracking-widest text-neutral-600 uppercase dark:border-neutral-800 dark:text-neutral-400"
            >
              {group.title}
            </h3>
            {group.rows.map((row, rowIdx) => (
              <div
                key={`${group.id}-${rowIdx}`}
                className="border-t border-neutral-100 py-4 first-of-type:border-t-0 dark:border-neutral-800/60"
              >
                <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
                  {row.label}
                </p>
                <dl
                  className={cn(
                    "grid gap-x-3 gap-y-3",
                    planKeys.length === 4 ? "grid-cols-2 xs:grid-cols-4" : "grid-cols-3"
                  )}
                >
                  {planKeys.map((key) => (
                    <div key={key} className="min-w-0">
                      <dt className="mb-1 text-xs text-neutral-600 dark:text-neutral-400">
                        {labels.columns[key]}
                      </dt>
                      <dd className="break-words">
                        <Cell
                          value={row[key]}
                          ariaIncluded={labels.cellAria.included}
                          ariaNotIncluded={labels.cellAria.notIncluded}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* md+: the table. Fixed layout so the columns share the width instead
          of growing past the container. */}
      <div className="hidden w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-raised md:block dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/60">
              <th
                scope="col"
                className="w-[34%] px-6 py-5 text-xs font-bold tracking-widest text-neutral-600 uppercase dark:text-neutral-400"
              >
                {labels.columns.feature}
              </th>
              {planKeys.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className={cn(
                    "px-4 py-5 text-center align-bottom text-sm font-bold text-neutral-900 dark:text-white",
                    key === "cloud" && "bg-brand-50/70 dark:bg-brand-500/5"
                  )}
                >
                  {labels.columns[key]}
                  {key === "cloud" && cloudVolume && (
                    <span className="mt-1 block text-xs font-normal text-neutral-600 dark:text-neutral-400">
                      {cloudVolume.columnNote}
                    </span>
                  )}
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
                    className="px-6 py-3 text-left text-[11px] font-bold tracking-widest text-neutral-600 uppercase dark:text-neutral-400"
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
                      className="px-6 py-4 text-left text-sm font-medium text-neutral-700 dark:text-neutral-200"
                    >
                      {row.label}
                    </th>
                    {planKeys.map((key) => (
                      <td
                        key={key}
                        className={cn(
                          "px-4 py-4 text-center align-middle break-words",
                          key === "cloud" && "bg-brand-50/70 dark:bg-brand-500/5"
                        )}
                      >
                        <Cell
                          value={row[key]}
                          ariaIncluded={labels.cellAria.included}
                          ariaNotIncluded={labels.cellAria.notIncluded}
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
    </section>
  );
};
