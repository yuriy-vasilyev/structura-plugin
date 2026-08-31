/**
 * "Search Clicks" glance card for the wp-admin Overview stat row.
 *
 * Design handoff: marketing/design_handoff_gsc_wizard_dashboard/README.md,
 * Boards 02–03. Matches the existing `StatCard` anatomy VERBATIM (left
 * `border-l-4` accent, 10px overline, `text-3xl font-black` value, trend
 * pill, mono subtext) with the emerald SEO-category accent — plus exactly
 * one extra line its siblings don't have: the deep link into the
 * **customer portal** (naming rule — never "portal" or "dashboard").
 *
 * State machine (derived from the wire, no local state):
 *
 *   not_connected     → teaser one-liner, neutral accent, Connect → store
 *   property_pending  → teaser variant, "Finish setup" → Configure modal
 *   pulling           → skeleton (polled by the hook until it settles)
 *   ready, no data    → collecting (em-dash value so the grid never
 *                       reflows once numbers arrive; honest ~2-day lag copy)
 *   ready, data       → populated (clicks 28d + delta pill + top mover +
 *                       portal link)
 *   expired           → the existing amber one-liner reconnect pattern
 *                       (SearchPerformanceSection's), never a bespoke card
 *
 * Delta pill rule (handoff): emerald ONLY when the delta tone is "good";
 * flat AND negative both render the neutral pill — never red. This is a
 * glance card; red reads as an alarm the user can't act on here.
 */

import { __, sprintf } from "@wordpress/i18n";
import { ArrowUpRight, Plug, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Card, cn } from "@structura/ui";
import { countDelta, formatMetricCount } from "@structura/ui/search-perf";

import { useGscOverviewSummaryQuery } from "@/features/channels/api/useGscOverviewSummaryQuery";
import {
  formatShortDate,
  resolveIntlLocale,
} from "@/features/channels/components/SearchPerformanceSection";
import { GoogleGGlyph } from "@/features/channels/components/GscConnectFlow";
import type { GscOverviewSummaryResponse } from "@/features/channels/types";

/** `StatCard`'s Card classes, verbatim — the anatomy contract. */
const SHELL = "rounded-lg border-l-4 p-6! shadow-sm";

/** `StatCard`'s overline classes, verbatim. */
const OVERLINE =
  "mt-0! mb-1! text-[10px] font-bold tracking-widest text-gray-400 uppercase";

export const GscSummaryCard = () => {
  const query = useGscOverviewSummaryQuery();
  const locale = resolveIntlLocale();

  // Disabled (no usable license / invalid activation) → the hook never
  // fires; render nothing so the stat row stays its usual 3-up.
  if (query.isPending && !query.isFetching) return null;

  if (query.isLoading || query.data?.state === "pulling") {
    return <SkeletonCard />;
  }

  // A glance card quietly absent beats a red error tile (the query is
  // already opted out of the global error toast).
  if (query.isError || !query.data) return null;

  const data = query.data;

  if (data.state === "not_connected") {
    return (
      <TeaserCard
        cta={__("Connect", "structura")}
        href="#/channels/store"
      />
    );
  }

  if (data.state === "property_pending") {
    // OAuth done but no property chosen — deep-link the Configure modal's
    // property picker, never re-offer OAuth (formulafoundry.io 2026-07-18).
    return (
      <TeaserCard
        cta={__("Finish setup", "structura")}
        href={
          data.connectionId
            ? `#/channels/connections?configure=${encodeURIComponent(data.connectionId)}`
            : "#/channels/connections"
        }
      />
    );
  }

  if (data.state === "expired") {
    return <ExpiredCard freshThrough={data.freshThrough} locale={locale} />;
  }

  // state === "ready". No rows (or a zero window) → collecting: GSC lags
  // ~2 days, so an em-dash + honest copy beats a false zero (handoff
  // "Freshness honesty").
  if (!data.totals28 || data.totals28.clicks === 0) {
    return <CollectingCard />;
  }

  return <PopulatedCard data={data} locale={locale} />;
};

/* ─── Populated (Board 02) ────────────────────────────────────────── */

const PopulatedCard = ({
  data,
  locale,
}: {
  data: GscOverviewSummaryResponse;
  locale: string;
}) => {
  const totals28 = data.totals28 as NonNullable<
    GscOverviewSummaryResponse["totals28"]
  >;
  const delta = countDelta(totals28.clicks, data.prev28?.clicks ?? 0, locale);
  const topMover = data.topMover ?? null;

  return (
    <Card className={cn(SHELL, "border-l-emerald-500")}>
      <p className={OVERLINE}>{__("Search Clicks · 28d", "structura")}</p>
      <div className="flex items-baseline gap-2">
        <h2 className="m-0! text-3xl! font-black! text-neutral-900 dark:text-white">
          {formatMetricCount(totals28.clicks, locale)}
        </h2>
        {delta.label && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              // Emerald only when positive; flat AND negative render the
              // neutral pill — never red (handoff delta-pill rule).
              delta.tone === "good"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-neutral-100 text-neutral-500 dark:bg-white/[.07] dark:text-neutral-400",
            )}
          >
            {delta.label}
          </span>
        )}
      </div>
      {topMover && (
        <p className="mt-4! mb-0! truncate font-mono text-xs text-gray-500 dark:text-gray-400">
          {sprintf(
            // translators: %1$s is a post title, %2$s is a signed percent like "+31%".
            __("Top mover: “%1$s” %2$s", "structura"),
            topMover.title ?? topMover.url,
            formatMoverDelta(topMover.deltaPercent, locale),
          )}
        </p>
      )}
      {/* The one extra line vs the sibling StatCards. New context from
          wp-admin — the report lives in the customer portal. */}
      <a
        href={data.portalReportUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
      >
        {__("Full report in your customer portal", "structura")}
        <ArrowUpRight size={12} aria-hidden />
      </a>
    </Card>
  );
};

/** `deltaPercent` (positive int, e.g. `31`) → localized `+31%`. */
function formatMoverDelta(deltaPercent: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "always",
    maximumFractionDigits: 0,
  }).format(deltaPercent / 100);
}

/* ─── Teaser (Board 03) — one line, not a billboard ───────────────── */

const TeaserCard = ({ cta, href }: { cta: string; href: string }) => (
  <Card className={cn(SHELL, "border-l-neutral-300 dark:border-l-neutral-600")}>
    <p className={OVERLINE}>{__("Search Clicks", "structura")}</p>
    <div className="mt-1 flex items-center justify-between gap-3">
      <p className="m-0! flex! min-w-0 items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
        <GoogleGGlyph size={14} className="shrink-0" />
        <span className="truncate">
          {__("See your posts' Google Search clicks here.", "structura")}
        </span>
      </p>
      <Button variant="secondary" size="sm" href={href} className="shrink-0">
        <Plug size={14} aria-hidden className="mr-1.5" />
        {cta}
      </Button>
    </div>
  </Card>
);

/* ─── Collecting (Board 03) ───────────────────────────────────────── */

const CollectingCard = () => (
  <Card className={cn(SHELL, "border-l-emerald-500")}>
    <p className={OVERLINE}>{__("Search Clicks · 28d", "structura")}</p>
    <div className="flex items-baseline gap-2">
      {/* Em-dash placeholder keeps the value slot's height so the grid
          never reflows once real numbers arrive. */}
      <h2 className="m-0! text-3xl! font-black! text-neutral-300 dark:text-neutral-600">
        —
      </h2>
    </div>
    <p className="mt-4! mb-0! font-mono text-xs text-gray-500 dark:text-gray-400">
      {__("Collecting — first numbers within a couple of days", "structura")}
    </p>
  </Card>
);

/* ─── Expired — SearchPerformanceSection's amber one-liner pattern ── */

const ExpiredCard = ({
  freshThrough,
  locale,
}: {
  freshThrough?: string;
  locale: string;
}) => {
  const freshDate = freshThrough ? formatShortDate(freshThrough, locale) : null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-l-4 border-amber-200/70 border-l-amber-500 bg-amber-50/40 p-5 dark:border-amber-900/40 dark:border-l-amber-500 dark:bg-amber-950/20">
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
};

/* ─── Skeleton — pulling / first fetch ────────────────────────────── */

const SkeletonCard = () => (
  <Card className={cn(SHELL, "border-l-emerald-500")}>
    <div role="status">
      <p className={OVERLINE}>{__("Search Clicks · 28d", "structura")}</p>
      <div className="animate-pulse" aria-hidden>
        <div className="h-9 w-24 rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="mt-4 h-4 w-40 rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
      <span className="sr-only">{__("Loading search data…", "structura")}</span>
    </div>
  </Card>
);
