/**
 * KeywordRow — one row of the ranked keyword bank (campaign wizard Discovery
 * step, both surfaces). Position · keyword · provenance glyph · "+N" variants
 * · volume · KD meter · intent chip · hover-reveal actions.
 *
 * Design handoff: `marketing/design_handoff_keyword_bank/keyword-bank-spec.md`
 * §2 (row anatomy), §5 (AI-estimated degrade, pending row), §7 (a11y).
 *
 * Surface-neutral by design:
 * - No i18n inside — every visible/accessible string comes from `labels`
 *   (English defaults; consumers pass `__()` / `t()` translations).
 * - Margin-free: the grid uses `gap` only, and the action buttons carry
 *   explicit resets (`border-0 bg-transparent`) so wp-admin's `forms.css`
 *   can't leak a border or background in (design guide §7.1).
 * - Narrow layout is a CONTAINER query (`@max-[600px]`, set by the list's
 *   `@container`), not a viewport one — wp-admin's ~700px content column
 *   keeps the single-line row while the portal's mobile card wraps.
 */
import { forwardRef, type ReactNode } from "react";
import {
  ArrowUpToLine,
  ListTree,
  Plus,
  Search,
  Sparkles,
  Swords,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../utils";
import { deriveKdState, MetricChip, type KdState } from "./MetricChip";
import { Skeleton } from "./Skeleton";
import { Tooltip } from "./Tooltip";

/**
 * Where a keyword came from — the UI vocabulary. The cloud's wire values
 * (`ranking` / `near_ranking` → `already_ranking`, `gap` → `competitor_gap`,
 * `suggestion` → `related_search`) are mapped by each surface's normalizer,
 * never renamed on the wire.
 */
export type KeywordProvenance =
  | "related_search"
  | "people_also_ask"
  | "competitor_gap"
  | "already_ranking"
  | "ai_generated"
  | "manual";

/**
 * Cloud wire `source` → row provenance. The wire values are never renamed
 * (`ranking`, `gap`, `suggestion` stay on the doc); this is display-only and
 * lives here so both surfaces apply ONE mapping. Unknown / absent → `manual`
 * (a hand-curated bank shows the Plus glyph, not a fake data claim).
 */
export function provenanceFromWireSource(source?: string | null): KeywordProvenance {
  switch (source) {
    case "ranking":
    case "near_ranking":
      return "already_ranking";
    case "gap":
      return "competitor_gap";
    case "suggestion":
    case "related_search":
      return "related_search";
    case "people_also_ask":
      return "people_also_ask";
    case "ai_generated":
      return "ai_generated";
    default:
      return "manual";
  }
}

/** Searcher intent the row can label. Other wire intents render no chip. */
export type KeywordIntent = "informational" | "commercial";

/** Estimated-volume bucket for AI-estimated banks (no live numbers). */
export type VolumeBucket = "high" | "medium" | "low";

/** Per-row metrics. Everything optional — a manual add has none. */
export interface KeywordRowMetrics {
  volumeNumber?: number;
  volumeBucket?: VolumeBucket;
  kd?: number;
  intent?: KeywordIntent;
}

/**
 * Visible + accessible strings the row renders. English defaults; every
 * consumer overrides with its i18n so nothing ships English-only. Sized
 * for ~30% expansion (German).
 */
export interface KeywordRowLabels {
  remove: (keyword: string) => string;
  moveToTop: (keyword: string) => string;
  provenance: Record<KeywordProvenance, string>;
  /** "+N" tooltip / aria-label. */
  variants: (count: number) => string;
  /** KD tooltip: state relative to the ceiling. */
  kd: (kd: number, state: KdState, ceiling: number | null) => string;
  /** Accessible name for the volume figure ("2.9K monthly searches"). */
  volume: (formatted: string, n: number) => string;
  intent: Record<KeywordIntent, string>;
  bucket: Record<VolumeBucket, string>;
  /** Tooltip on the estimated bucket chip. */
  bucketEstimated: string;
  /** Accessible name for the pending-metrics skeleton. */
  pending: string;
}

export const DEFAULT_KEYWORD_ROW_LABELS: KeywordRowLabels = {
  remove: (k) => `Remove ${k}`,
  moveToTop: (k) => `Move ${k} to the top of the publish order`,
  provenance: {
    related_search: "Search-suggested — from live related-search data",
    people_also_ask: "People also ask — a question searchers pair with this topic",
    competitor_gap: "Competitor gap — they rank for it, you don't yet",
    already_ranking: "Already ranking — your site has a foothold here",
    ai_generated: "AI-generated — no live search data; numbers are estimates",
    manual: "Added manually",
  },
  variants: (n) => `${n} long-tail variant${n === 1 ? "" : "s"} ready as per-post keyphrases`,
  kd: (kd, state, ceiling) =>
    `Difficulty ${kd} — ${state}` +
    (state === "pillar"
      ? ` (above your KD ≤ ${ceiling} ceiling)`
      : state === "stretch"
        ? ` (near your KD ≤ ${ceiling} ceiling)`
        : " for this site"),
  volume: (formatted) => `${formatted} monthly searches`,
  intent: { informational: "DIY", commercial: "Research" },
  bucket: { high: "High", medium: "Medium", low: "Low" },
  bucketEstimated: "Estimated volume bucket — no live search data",
  pending: "Looking up search data…",
};

const PROVENANCE_ICON: Record<KeywordProvenance, LucideIcon> = {
  related_search: Search,
  people_also_ask: Search,
  competitor_gap: Swords,
  already_ranking: TrendingUp,
  ai_generated: Sparkles,
  manual: Plus,
};

const BUCKET_TONE: Record<VolumeBucket, string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  low: "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400",
};

/**
 * Compact monthly volume for a 42px mono column: `2.9K`, `14.5K`, `980`.
 * Only the decimal separator is localized — "K" is the universal SEO-tool
 * suffix and the German "Tsd." form doesn't fit the column.
 */
export function formatCompactVolume(n: number, locale?: string): string {
  if (n < 1000) return String(Math.round(n));
  const k = Math.round(n / 100) / 10;
  const digits = Number.isInteger(k) ? 0 : 1;
  const formatted = (() => {
    try {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(k);
    } catch {
      return k.toFixed(digits);
    }
  })();
  return `${formatted}K`;
}

/** Volume → estimated bucket, for banks that carry a number but no live path. */
export function bucketForVolume(n: number): VolumeBucket {
  return n >= 1000 ? "high" : n >= 100 ? "medium" : "low";
}

export interface KeywordRowProps {
  /** 1-based publish position (global across the winnable + pillar lists). */
  position: number;
  keyword: string;
  metrics?: KeywordRowMetrics;
  /** Resolved KD ceiling; `null`/absent = authority mode (everything winnable). */
  kdCeiling?: number | null;
  source: KeywordProvenance;
  /** Long-tail variants ready for this keyword; omitted at 0. */
  variantCount?: number;
  /**
   * Render as a pillar (purple KD tint, no move-to-top). The list derives
   * this from `kd > kdCeiling`; passing it explicitly overrides.
   */
  pillar?: boolean;
  /**
   * AI-estimated bank (`meta.path === "legacy"`): degrade to position +
   * keyword + amber Sparkles + `~ High/Medium/Low` bucket chip + actions.
   * KD, intent and variants simply don't render — no empty columns.
   */
  estimated?: boolean;
  /** Just added, metrics still resolving: dimmed keyword + shimmer. */
  pending?: boolean;
  onRemove: () => void;
  /** Absent → no move-to-top action (also hidden on pillar rows). */
  onMoveToTop?: () => void;
  /** Number-format locale for the volume column. */
  locale?: string;
  /** Entrance-stagger delay in ms (list caps it at 440). */
  animationDelayMs?: number;
  labels?: Partial<KeywordRowLabels>;
  className?: string;
  /** Extra content after the actions (tests / decorations). */
  trailing?: ReactNode;
}

/** Explicit button reset + soft-glow focus (design guide §6.5, §7.1). */
const ACTION_BUTTON =
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-1.5 text-neutral-400 transition-colors duration-fast ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)] " +
  // ≥44px tap target on the wrapped (touch) layout.
  "@max-[600px]:min-h-11 @max-[600px]:min-w-11";

export const KeywordRow = forwardRef<HTMLLIElement, KeywordRowProps>(
  (
    {
      position,
      keyword,
      metrics,
      kdCeiling = null,
      source,
      variantCount = 0,
      pillar,
      estimated = false,
      pending = false,
      onRemove,
      onMoveToTop,
      locale,
      animationDelayMs,
      labels: labelOverrides,
      className,
      trailing,
    },
    ref
  ) => {
    const labels: KeywordRowLabels = { ...DEFAULT_KEYWORD_ROW_LABELS, ...labelOverrides };
    const kdState: KdState = deriveKdState(metrics?.kd, kdCeiling);
    const isPillar = pillar ?? kdState === "pillar";
    // Estimates must be visible: an AI-estimated bank shows the amber
    // Sparkles on every row regardless of the wire source.
    const provenance: KeywordProvenance = pending ? "manual" : estimated ? "ai_generated" : source;
    const ProvIcon = PROVENANCE_ICON[provenance];
    // A row with no metric at all (hand-curated bank) renders no metric cells
    // — no empty second line on the wrapped layout, no holes.
    const hasLiveMetric =
      typeof metrics?.volumeNumber === "number" ||
      typeof metrics?.kd === "number" ||
      !!metrics?.intent;
    const bucket: VolumeBucket | undefined =
      metrics?.volumeBucket ??
      (typeof metrics?.volumeNumber === "number" ? bucketForVolume(metrics.volumeNumber) : undefined);

    return (
      <li
        ref={ref}
        data-keyword={keyword}
        data-position={position}
        data-pillar={isPillar ? "" : undefined}
        data-pending={pending ? "" : undefined}
        className={cn(
          // Spec §1/§8 row rhythm. `group` drives the hover-reveal actions.
          "group grid min-h-[38px] grid-cols-[26px_minmax(0,1fr)_max-content_max-content] items-center gap-x-2.5 rounded-[10px] px-2 py-1.5 transition-colors duration-fast",
          "hover:bg-brand-600/[0.045] dark:hover:bg-white/[0.03]",
          // Hairline separators between rows (not above the first).
          "border-t border-neutral-100 first:border-t-0 dark:border-white/[0.045]",
          // Narrow (container ≤600px): metrics wrap under the keyword.
          "@max-[600px]:min-h-12 @max-[600px]:grid-cols-[26px_minmax(0,1fr)_max-content] @max-[600px]:gap-y-px @max-[600px]:py-[9px]",
          // Entrance — fadeInUp with the list's stagger; static under reduced motion.
          animationDelayMs !== undefined &&
            "animate-in [animation-fill-mode:both] motion-reduce:animate-none",
          className
        )}
        style={animationDelayMs !== undefined ? { animationDelay: `${animationDelayMs}ms` } : undefined}
      >
        <span
          aria-hidden="true"
          className="w-[26px] text-right font-mono text-[10px] tabular-nums text-neutral-300 dark:text-neutral-600 @max-[600px]:col-start-1 @max-[600px]:row-start-1"
        >
          {String(position).padStart(2, "0")}
        </span>

        <div className="flex min-w-0 items-center gap-2 @max-[600px]:col-start-2 @max-[600px]:row-start-1">
          <span
            className={cn(
              "truncate text-sm font-[450] text-neutral-900 dark:text-neutral-100",
              pending && "opacity-50"
            )}
          >
            {keyword}
          </span>
          <Tooltip title={labels.provenance[provenance]}>
            <span
              tabIndex={0}
              role="img"
              aria-label={labels.provenance[provenance]}
              data-provenance={provenance}
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-neutral-600",
                provenance === "ai_generated" && "text-amber-500 dark:text-amber-400"
              )}
            >
              <ProvIcon size={12} aria-hidden="true" />
            </span>
          </Tooltip>
          {!estimated && !pending && variantCount > 0 ? (
            <Tooltip title={labels.variants(variantCount)}>
              <span
                tabIndex={0}
                aria-label={labels.variants(variantCount)}
                data-variants={variantCount}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-sm font-mono text-[10px] text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-neutral-500"
              >
                <ListTree size={12} aria-hidden="true" />+{variantCount}
              </span>
            </Tooltip>
          ) : null}
        </div>

        <div
          data-metrics=""
          className="flex items-center gap-3 @max-[600px]:col-start-2 @max-[600px]:row-start-2 @max-[600px]:gap-2.5"
        >
          {pending ? (
            <Skeleton
              aria-hidden={undefined}
              role="status"
              aria-label={labels.pending}
              className="h-3.5 w-[130px] rounded-md"
            />
          ) : estimated ? (
            bucket ? (
              <Tooltip title={labels.bucketEstimated}>
                <span
                  tabIndex={0}
                  aria-label={`${labels.bucket[bucket]} — ${labels.bucketEstimated}`}
                  data-bucket={bucket}
                  className="inline-flex w-[64px] justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      BUCKET_TONE[bucket]
                    )}
                  >
                    ~ {labels.bucket[bucket]}
                  </span>
                </span>
              </Tooltip>
            ) : null
          ) : hasLiveMetric ? (
            // Three FIXED-width slots whenever the row has any live metric, so
            // a keyword with only a KD (or only a volume) keeps its number in
            // the same column as its neighbours instead of sliding into the
            // gap (live QA 2026-08-28, legacy banks with partial DFS data).
            <>
              <span
                data-volume-slot=""
                className="inline-flex w-[42px] justify-end font-mono text-[11px] font-medium tabular-nums text-neutral-600 dark:text-neutral-300"
              >
                {typeof metrics?.volumeNumber === "number" ? (
                  <span
                    data-volume={metrics.volumeNumber}
                    aria-label={labels.volume(
                      formatCompactVolume(metrics.volumeNumber, locale),
                      metrics.volumeNumber
                    )}
                  >
                    {formatCompactVolume(metrics.volumeNumber, locale)}
                  </span>
                ) : null}
              </span>
              <span data-kd-slot="" className="inline-flex w-[62px]">
                {typeof metrics?.kd === "number" ? (
                  <Tooltip title={labels.kd(metrics.kd, kdState, kdCeiling)}>
                    <MetricChip
                      kd={metrics.kd}
                      state={kdState}
                      aria-label={labels.kd(metrics.kd, kdState, kdCeiling)}
                    />
                  </Tooltip>
                ) : null}
              </span>
              <span data-intent-slot="" className="inline-flex w-[60px] justify-start">
                {metrics?.intent ? (
                  <span
                    data-intent={metrics.intent}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {labels.intent[metrics.intent]}
                  </span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>

        {pending ? (
          <span aria-hidden="true" />
        ) : (
          <div
            data-actions=""
            className={cn(
              "flex items-center gap-0.5 transition-opacity duration-fast",
              // Hover/focus-reveal on pointer devices; always visible on touch
              // and on the wrapped layout (spec §2 actions).
              "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
              "@max-[600px]:col-start-3 @max-[600px]:row-span-2 @max-[600px]:row-start-1 @max-[600px]:opacity-100"
            )}
          >
            {onMoveToTop && !isPillar ? (
              <button
                type="button"
                onClick={onMoveToTop}
                aria-label={labels.moveToTop(keyword)}
                title={labels.moveToTop(keyword)}
                data-kb-move-top=""
                className={cn(
                  ACTION_BUTTON,
                  "hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
                )}
              >
                <ArrowUpToLine size={14} aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              aria-label={labels.remove(keyword)}
              data-kb-remove=""
              className={cn(
                ACTION_BUTTON,
                "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              )}
            >
              <X size={14} aria-hidden="true" />
            </button>
            {trailing}
          </div>
        )}
      </li>
    );
  }
);
KeywordRow.displayName = "KeywordRow";
