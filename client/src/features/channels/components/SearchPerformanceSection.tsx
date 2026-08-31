/**
 * "Search performance" section for the run-detail receipt pages.
 *
 * Renders one post's Google Search Console numbers (28-day window) as a
 * single-column section that slots after the result banner on
 * `SinglePostRunDetailPage` and into the campaign `RunDetailPage` flow.
 * Callers gate the mount — the section only makes sense for runs that
 * produced a *published* post (drafts have no search data).
 *
 * Design: marketing/design_handoff_gsc_post_performance/README.md,
 * Boards 10 (populated) and 11 (not connected / expired), with the
 * collecting / zero states as quiet one-row variants per Board 11's
 * pattern (Board 04/05 copy essence). The index badge slot stays empty
 * this slice: only the `unknown` verdict exists, and the handoff omits
 * the badge entirely for unknown.
 *
 * State machine (spec: specs/gsc-integration.md; handoff "State
 * Management"): loading/pulling → skeleton · not_connected → connect
 * row · expired → amber row · ready+data → populated · ready+no data →
 * collecting (fresh post) or zero. Note loading ≠ collecting: pulling
 * is the first mirror pull in flight; collecting is a successful fetch
 * where GSC simply has nothing yet for a recently published post.
 */

import { useEffect, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  History,
  Hourglass,
  Plug,
  RefreshCw,
  Search,
  Telescope,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Button, cn } from "@structura/ui";
import {
  countDelta,
  formatCtr,
  formatMetricCount,
  formatPosition,
  positionDelta,
} from "@structura/ui/search-perf";
import { useGscPostStatsQuery } from "../api/useGscPostStatsQuery";
import type { GscPageStats, GscTopQuery } from "../types";

/**
 * Posts younger than this with no GSC rows are "collecting" (Google
 * reports lag ~2 days); older ones are honest "zero". Handoff state
 * machine: collecting = published < ~3 days.
 */
const COLLECTING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** How many of the top queries the receipt shows (Board 10: 3 rows, by clicks). */
const TOP_QUERY_ROWS = 3;

export interface SearchPerformanceSectionProps {
  /** Permalink of the published post (`run.resultPostUrl`). */
  pageUrl: string;
  /**
   * ISO timestamp the post went live (run end/start time is close
   * enough). Drives the collecting-vs-zero branch when GSC has no rows
   * yet; absent → treated as old, i.e. the honest zero state.
   */
  publishedAt?: string;
  /** Extra classes for the outer `<section>` (e.g. `mb-6` on pages without a spaced flow). */
  className?: string;
}

export const SearchPerformanceSection = ({
  pageUrl,
  publishedAt,
  className,
}: SearchPerformanceSectionProps) => {
  const query = useGscPostStatsQuery(pageUrl);
  const locale = resolveIntlLocale();

  // Disabled (no usable license / invalid activation) → the hook never
  // fires; render nothing rather than a permanent skeleton.
  if (query.isPending && !query.isFetching) return null;

  if (query.isLoading || query.data?.state === "pulling") {
    return <LoadingSkeleton className={className} />;
  }

  if (query.isError || !query.data) {
    return (
      <QuietRow className={className}>
        <AlertCircle
          size={16}
          className="shrink-0 text-neutral-400 dark:text-neutral-500"
          aria-hidden
        />
        <p className="m-0! min-w-0 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
          {__("Couldn't load search data for this post.", "structura")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={14} aria-hidden />
          {__("Retry", "structura")}
        </Button>
      </QuietRow>
    );
  }

  const { state, page, freshThrough } = query.data;
  const freshDate = freshThrough ? formatShortDate(freshThrough, locale) : null;

  if (state === "not_connected") {
    return (
      <QuietRow className={className}>
        {/* No Google glyph asset ships in the plugin bundle — lucide
            Search keeps the row consistent with the SPA's iconography. */}
        <Search
          size={16}
          className="shrink-0 text-neutral-400 dark:text-neutral-500"
          aria-hidden
        />
        <p className="m-0! min-w-0 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
          {__(
            "See this post's Google Search clicks and queries here.",
            "structura",
          )}
        </p>
        <Button
          variant="secondary"
          size="sm"
          href="#/channels/store"
          className="shrink-0"
        >
          <Plug size={14} aria-hidden />
          {__("Connect Search Console", "structura")}
        </Button>
      </QuietRow>
    );
  }

  if (state === "property_pending") {
    // OAuth completed but no property picked (auto-match found nothing).
    // Deep-link the Configure modal — its picker AND no-property guidance
    // both live there. Never re-offer OAuth here (formulafoundry.io
    // incident, 2026-07-18).
    const configureHref = query.data.connectionId
      ? `#/channels/connections?configure=${encodeURIComponent(query.data.connectionId)}`
      : "#/channels/connections";
    return (
      <QuietRow className={className}>
        <Search
          size={16}
          className="shrink-0 text-neutral-400 dark:text-neutral-500"
          aria-hidden
        />
        <p className="m-0! min-w-0 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
          {__(
            "Search Console is connected — one step left: choose the property this site reads.",
            "structura",
          )}
        </p>
        <Button variant="secondary" size="sm" href={configureHref} className="shrink-0">
          {__("Choose property", "structura")}
        </Button>
      </QuietRow>
    );
  }

  if (state === "expired") {
    return (
      <section
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-5 dark:border-amber-900/40 dark:bg-amber-950/20",
          className,
        )}
      >
        <TriangleAlert
          size={16}
          className="shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <p className="m-0! min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-200">
          {freshDate
            ? // translators: %s is a date like "Jul 9, 2026".
              sprintf(
                __(
                  "Google connection expired — search stats paused %s. Your history is safe.",
                  "structura",
                ),
                freshDate,
              )
            : __(
                "Google connection expired — search stats are paused. Your history is safe.",
                "structura",
              )}
        </p>
        <Button
          variant="secondary"
          size="sm"
          href="#/channels/connections"
          className="shrink-0"
        >
          <RefreshCw size={14} aria-hidden />
          {__("Reconnect", "structura")}
        </Button>
      </section>
    );
  }

  // state === "ready" from here. Any impressions in the window →
  // populated; otherwise branch on publish recency (never render a dead
  // grid of zeros — handoff Board 05 rule).
  if (page && page.last28.impressions > 0) {
    return (
      <PopulatedSection
        page={page}
        freshDate={freshDate}
        locale={locale}
        className={className}
      />
    );
  }

  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;
  const isCollecting =
    Number.isFinite(publishedMs) &&
    Date.now() - publishedMs < COLLECTING_WINDOW_MS;

  if (isCollecting) {
    return (
      <QuietRow className={className}>
        <Hourglass
          size={16}
          className="shrink-0 text-neutral-400 dark:text-neutral-500"
          aria-hidden
        />
        <p className="m-0! min-w-0 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
          {__(
            "Collecting search data — Google reports lag about 2 days. First numbers usually appear within a few days of publishing.",
            "structura",
          )}
        </p>
        <FreshnessCue date={freshDate} />
      </QuietRow>
    );
  }

  return (
    <QuietRow className={className}>
      <Telescope
        size={16}
        className="shrink-0 text-neutral-400 dark:text-neutral-500"
        aria-hidden
      />
      <p className="m-0! min-w-0 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
        {__(
          "No search traffic yet — that's normal, most posts take a few weeks to start ranking. We check every day.",
          "structura",
        )}
      </p>
      <FreshnessCue date={freshDate} />
    </QuietRow>
  );
};

// ─── Populated (Board 10) ───────────────────────────────────────────────────

const PopulatedSection = ({
  page,
  freshDate,
  locale,
  className,
}: {
  page: GscPageStats;
  freshDate: string | null;
  locale: string;
  className?: string;
}) => {
  const { last28, prev28 } = page;

  const clicksDelta = countDelta(last28.clicks, prev28.clicks, locale);
  const impressionsDelta = countDelta(
    last28.impressions,
    prev28.impressions,
    locale,
  );
  const posDelta = positionDelta(last28.position, prev28.position, locale);

  // Wire order is by impressions (≤25); the receipt shows the top 3 by
  // clicks (Board 10) — the "what is this post actually earning" cut.
  const topQueries = [...page.topQueries]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, TOP_QUERY_ROWS);

  const clicksSeries = page.series.map((p) => p.clicks);

  return (
    <section
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0! text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {__("Search performance · last 28 days", "structura")}
        </h2>
        {/* Index badge slot (Board 10 top-right). Intentionally empty this
            slice — only the "unknown" verdict exists and the handoff omits
            the badge for unknown. */}
      </div>

      <dl className="m-0! mt-4! grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={__("Clicks", "structura")}
          value={formatMetricCount(last28.clicks, locale)}
          chip={<CountDeltaChip delta={clicksDelta} />}
        />
        <Stat
          label={__("Impressions", "structura")}
          value={formatMetricCount(last28.impressions, locale)}
          chip={<CountDeltaChip delta={impressionsDelta} />}
        />
        <Stat
          label={__("CTR", "structura")}
          value={formatCtr(last28.ctr, locale)}
          chip={<CtrDeltaChip last28={last28} prev28={prev28} locale={locale} />}
        />
        <Stat
          label={__("Position", "structura")}
          value={formatPosition(last28.position, locale)}
          chip={<PositionDeltaChip delta={posDelta} />}
        />
      </dl>

      {clicksSeries.length > 1 && (
        <div className="mt-4 rounded-xl bg-neutral-50 p-2 ring-1 ring-neutral-200/60 dark:bg-white/[.04] dark:ring-white/[.06]">
          {/* Decorative — the dl grid above carries the accessible data. */}
          <ClicksSparkline points={clicksSeries} />
        </div>
      )}

      {topQueries.length > 0 && (
        <div className="mt-5">
          <h3 className="m-0! text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {__("Top queries", "structura")}
          </h3>
          <ul className="m-0! mt-1! list-none divide-y divide-neutral-100 p-0! dark:divide-neutral-800">
            {topQueries.map((row) => (
              <QueryRow key={row.q} row={row} locale={locale} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <FreshnessCue date={freshDate} />
        {/* "Full report in your customer portal ↗" is deferred: the client
            has no helper that can deep-link to a specific site's portal
            report page, and hardcoding a guessed URL is worse than no
            link (see utils/portalLinks.ts for the intent contract). */}
      </div>
    </section>
  );
};

/** One `<dt>/<dd>` stat, matching the Inputs section's Field pattern. */
const Stat = ({
  label,
  value,
  chip,
}: {
  label: string;
  value: string;
  chip?: React.ReactNode;
}) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {label}
    </dt>
    <dd className="m-0! mt-1! flex items-baseline gap-2 text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
      {value}
      {chip}
    </dd>
  </div>
);

// ─── Delta chips ────────────────────────────────────────────────────────────

type ChipTone = "good" | "bad" | "flat";

const CHIP_TONE_CLASSES: Record<ChipTone, string> = {
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  bad: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  flat: "bg-neutral-100 text-neutral-500 dark:bg-white/[.07] dark:text-neutral-400",
};

const DeltaChip = ({
  tone,
  icon: Icon,
  children,
}: {
  tone: ChipTone;
  // Broader lucide icon shape (`size?: string | number`) so any lucide
  // icon can be passed without narrowing friction (same pattern as
  // RunDetailPage's SectionCard).
  icon?: React.ComponentType<{ size?: string | number; className?: string }>;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold leading-none",
      CHIP_TONE_CLASSES[tone],
    )}
  >
    {Icon && <Icon size={10} aria-hidden />}
    {children}
  </span>
);

/** Clicks / impressions chip — `+18%` with a trend icon. */
const CountDeltaChip = ({
  delta,
}: {
  delta: ReturnType<typeof countDelta>;
}) => {
  if (delta.label == null) return null;
  const Icon =
    delta.tone === "good"
      ? TrendingUp
      : delta.tone === "bad"
        ? TrendingDown
        : undefined;
  return (
    <DeltaChip tone={delta.tone} icon={Icon}>
      {delta.label}
    </DeltaChip>
  );
};

/**
 * CTR chip — percentage-point difference (`+0.1 pt`), always flat-toned.
 * A point move on a ratio metric is week-to-week noise more often than
 * signal, and the handoff's reference chip renders it flat.
 */
const CtrDeltaChip = ({
  last28,
  prev28,
  locale,
}: {
  last28: GscPageStats["last28"];
  prev28: GscPageStats["prev28"];
  locale: string;
}) => {
  if (prev28.impressions <= 0) return null;
  const pts = (last28.ctr - prev28.ctr) * 100;
  const label = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(pts);
  return (
    <DeltaChip tone="flat">
      {
        // translators: %s is a signed number of percentage points, e.g. "+0.1". "pt" = percentage points.
        sprintf(__("%s pt", "structura"), label)
      }
    </DeltaChip>
  );
};

/**
 * Average-position chip. LOWER IS BETTER — always words ("2.1 better"),
 * never a signed number in green/red; the arrow encodes goodness
 * direction, not numeric direction (handoff "Delta chips").
 */
const PositionDeltaChip = ({
  delta,
}: {
  delta: ReturnType<typeof positionDelta>;
}) => {
  if (delta.direction === "flat" || delta.magnitude == null) return null;
  const better = delta.direction === "better";
  return (
    <DeltaChip tone={better ? "good" : "bad"} icon={better ? ArrowUp : ArrowDown}>
      {better
        ? // translators: %s is a number of ranking positions gained, e.g. "2.1".
          sprintf(__("%s better", "structura"), delta.magnitude)
        : // translators: %s is a number of ranking positions lost, e.g. "1.4".
          sprintf(__("%s worse", "structura"), delta.magnitude)}
    </DeltaChip>
  );
};

// ─── Top-queries row (Board 08/10 position-pill row) ────────────────────────

const QueryRow = ({ row, locale }: { row: GscTopQuery; locale: string }) => (
  <li className="m-0! flex items-center gap-2 py-2">
    <span className="inline-flex w-9 shrink-0 justify-center rounded-md bg-neutral-100 px-1 py-0.5 font-mono text-[10px] font-semibold text-neutral-500 dark:bg-white/[.07] dark:text-neutral-400">
      #{formatPosition(row.position, locale)}
    </span>
    <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
      {row.q}
    </span>
    <span className="shrink-0 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
      {formatMetricCount(row.clicks, locale)}
    </span>
    <CopyQueryButton query={row.q} />
  </li>
);

/**
 * Ghost copy affordance with the check-flip confirmation (~1.4s) — the
 * plugin SPA's copy pattern (see CaptionPackage): wp-admin has no toast
 * for copy, the flip IS the confirmation.
 */
const CopyQueryButton = ({ query }: { query: string }) => {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const onCopy = () => {
    // Flip regardless of the promise so the affordance responds even
    // where the Clipboard API is restricted.
    void navigator.clipboard?.writeText(query).catch(() => undefined);
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      // translators: %s is a search query, e.g. "programmatic seo for saas".
      aria-label={sprintf(__("Copy query: %s", "structura"), query)}
      className="shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-neutral-300 transition-colors hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-300"
    >
      {copied ? (
        <Check size={12} className="text-emerald-500" aria-hidden />
      ) : (
        <Copy size={12} aria-hidden />
      )}
    </button>
  );
};

// ─── Sparkline ──────────────────────────────────────────────────────────────

/**
 * Tiny clicks-only sparkline — brand 2px line over an 8% area fill in
 * the inset panel (~52px tall, Board 10). Purely decorative
 * (`aria-hidden`); the stat grid carries the accessible data.
 * Hand-rolled because the plugin SPA has no charting dependency and one
 * polyline doesn't justify adding one.
 */
const ClicksSparkline = ({ points }: { points: number[] }) => {
  const W = 100;
  const H = 20;
  const max = Math.max(...points, 1);
  const step = W / (points.length - 1);
  // 1px top/bottom padding in viewBox units so the line never clips.
  const coords = points.map((v, i) => [
    i * step,
    H - 1 - (v / max) * (H - 2),
  ]);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="gsc-clicks-sparkline"
      className="text-brand-600 dark:text-brand-400 block h-[52px] w-full"
    >
      <path d={area} fill="currentColor" opacity={0.08} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        // Keep the stroke 2 device px despite the non-uniform viewBox scale.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

// ─── Shared shells ──────────────────────────────────────────────────────────

/** One-row quiet section card (Board 11 pattern) for the non-populated states. */
const QuietRow = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <section
    className={cn(
      "flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
      className,
    )}
  >
    {children}
  </section>
);

/**
 * Freshness cue — mono 10px + history icon, on every non-loading state
 * (handoff Shared specs). `date` is already localized; null renders the
 * em-dash placeholder (Board 02 collecting variant).
 */
const FreshnessCue = ({ date }: { date: string | null }) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-wide text-neutral-400 dark:text-neutral-500">
    <History size={11} aria-hidden />
    {
      // translators: %s is a date like "Jul 16, 2026" (or "—" when unknown).
      sprintf(
        __("Data through %s · Google reports lag ~2 days", "structura"),
        date ?? "—",
      )
    }
  </span>
);

/**
 * Skeleton mirroring the populated anatomy (stat row + sparkline panel)
 * — never blank space, per the handoff's loading rule. Shown both for
 * the initial fetch and while the mirror's first pull runs
 * (`state === "pulling"`, polled by the hook).
 */
const LoadingSkeleton = ({ className }: { className?: string }) => (
  <section
    role="status"
    className={cn(
      "rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
      className,
    )}
  >
    <h2 className="m-0! text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {__("Search performance · last 28 days", "structura")}
    </h2>
    <div className="mt-4 animate-pulse" aria-hidden>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="h-3 w-16 rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="mt-2 h-5 w-20 rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ))}
      </div>
      <div className="mt-4 h-[52px] rounded-xl bg-neutral-50 ring-1 ring-neutral-200/60 dark:bg-white/[.04] dark:ring-white/[.06]" />
    </div>
    <span className="sr-only">{__("Loading search data…", "structura")}</span>
  </section>
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Locale for `Intl` formatting. wp-admin stamps `<html lang>` from
 * `get_user_locale()` (BCP-47 hyphens), but underscore variants have
 * been seen in the wild — normalize, and fall back to `en` if the tag
 * still doesn't parse. Exported for the dashboard's GSC glance card so
 * both GSC surfaces resolve the locale identically.
 */
export function resolveIntlLocale(): string {
  const raw =
    typeof document !== "undefined"
      ? document.documentElement.lang
      : "";
  const candidate = (raw || "en").replace(/_/g, "-");
  try {
    new Intl.NumberFormat(candidate);
    return candidate;
  } catch {
    return "en";
  }
}

/**
 * `YYYY-MM-DD` → localized "Jul 16, 2026". Parsed as local time (the
 * `T00:00:00` suffix) so the date can't slip a day west of UTC.
 * Exported for the dashboard's GSC glance card (expired one-liner).
 */
export function formatShortDate(ymd: string, locale: string): string {
  const parsed = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  } catch {
    return ymd;
  }
}

export default SearchPerformanceSection;
