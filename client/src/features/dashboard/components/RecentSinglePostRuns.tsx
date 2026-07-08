import { __ } from "@wordpress/i18n";
import { Link } from "react-router";
import { Badge, Card } from "@structura/ui";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import type { RunStatusSerialized } from "@structura/types";
import { useSinglePostRunsQuery } from "@/features/progress";

/**
 * Dashboard widget — "Recent generations".
 *
 * Lists the most recent ephemeral runs (one-off `/generate` form
 * submissions), newest-first. Each row links through to the persistent
 * `/generate/runs/{runId}` receipt page so the user can re-open a
 * specific generation later — same persistence contract as campaign
 * runs, applied to one-off posts.
 *
 * Self-hides on an empty list, so safe to mount unconditionally on the
 * Overview. The list is capped at 5 rows to match the at-a-glance
 * intent of the dashboard; deeper history is not surfaced here (we
 * could add a "View all" link later if a use case for it shows up).
 *
 * Polling cadence is owned by `useSinglePostRunsQuery` — fast 30s
 * tick while in-flight rows are present, paused otherwise. The
 * generate-post mutation invalidates the cache key on success so
 * brand-new submissions appear immediately without waiting for the
 * next tick.
 */

/** Display cap — keeps the widget tidy on the Overview. */
const MAX_VISIBLE_ROWS = 5;

/** Cache-bust threshold for "title is empty" runs (early-failure cases). */
const FALLBACK_TITLE = (): string =>
  __("Single-post generation", "structura");

/**
 * Pull a friendly headline out of a single-post run. Priority:
 *   1. The cloud's own milestone-derived `headline` (e.g. "Drafting…")
 *      when the run is in flight.
 *   2. The form objective from `inputSnapshot.identity.objective` —
 *      the same field used as the title on the run-detail page.
 *   3. A neutral fallback so we never render an empty row.
 */
const deriveTitle = (run: RunStatusSerialized): string => {
  const snapshot = (run as RunStatusSerialized & {
    inputSnapshot?: Record<string, unknown>;
  }).inputSnapshot;
  if (snapshot && typeof snapshot === "object") {
    const identity = snapshot.identity;
    if (identity && typeof identity === "object") {
      const objective = (identity as Record<string, unknown>).objective;
      if (typeof objective === "string" && objective.trim()) {
        return objective.length > 80
          ? objective.slice(0, 77) + "…"
          : objective;
      }
    }
  }
  return FALLBACK_TITLE();
};

/**
 * Render the small status icon + relative time in the row's left rail.
 * Same icon/intent mapping as `SinglePostRunDetailPage` so a status pill
 * the user just saw on the detail page reads identically when they
 * land back on the dashboard.
 */
const StatusIcon = ({ status }: { status: RunStatusSerialized["status"] }) => {
  if (status === "succeeded" || status === "succeeded_with_warnings") {
    return (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
    );
  }
  if (status === "failed") {
    return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
  }
  if (status === "cancelled") {
    return <XCircle className="h-4 w-4 text-neutral-400" />;
  }
  return (
    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
  );
};

/**
 * Format the "time ago" hint — uses Intl.RelativeTimeFormat so the
 * widget speaks the user's locale automatically. Falls back to the
 * raw timestamp if the API isn't available (very old browsers).
 */
const relativeTime = (iso: string): string => {
  if (!iso) return "";
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = then - now;
    const absMs = Math.abs(diffMs);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (absMs < 60_000) return rtf.format(Math.round(diffMs / 1000), "second");
    if (absMs < 3_600_000)
      return rtf.format(Math.round(diffMs / 60_000), "minute");
    if (absMs < 86_400_000)
      return rtf.format(Math.round(diffMs / 3_600_000), "hour");
    return rtf.format(Math.round(diffMs / 86_400_000), "day");
  } catch {
    return iso;
  }
};

export const RecentSinglePostRuns = () => {
  const { data: runs = [], isLoading } = useSinglePostRunsQuery(MAX_VISIBLE_ROWS);

  // Self-hide when there's nothing to show. Mirrors the
  // NeedsAttentionWidget contract — the dashboard shouldn't grow
  // empty-state chrome for surfaces the user hasn't engaged with yet.
  // We also hide while loading so the widget doesn't pop in/out on
  // first paint.
  if (isLoading || runs.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden p-0! shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4 dark:bg-neutral-900">
        <h3 className="m-0! flex! items-center gap-2 text-xs font-bold tracking-widest text-gray-900 uppercase dark:text-white">
          <Sparkles className="text-brand-600 dark:text-brand-400 h-4 w-4" />
          {__("Recent Generations", "structura")}
        </h3>
        <Link
          to="/generate"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          <Zap size={12} />
          {__("Generate Post", "structura")}
        </Link>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
        {runs.map((run) => {
          const title = deriveTitle(run);
          const isInFlight =
            run.status === "queued" || run.status === "running";
          return (
            <li
              key={run.runId}
              className="transition-colors hover:bg-gray-50/60 dark:hover:bg-neutral-800/40"
            >
              <Link
                to={`/generate/runs/${run.runId}`}
                className="flex items-center justify-between gap-4 px-6 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0">
                    <StatusIcon status={run.status} />
                  </span>
                  <div className="min-w-0">
                    <p className="m-0! truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {title}
                    </p>
                    <p className="m-0! mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {relativeTime(run.startedAt)}
                      {run.headline && isInFlight ? ` • ${run.headline}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {run.status === "succeeded" ||
                  run.status === "succeeded_with_warnings" ? (
                    <Badge variant="solid" intent="success">
                      {__("Done", "structura")}
                    </Badge>
                  ) : run.status === "failed" ? (
                    <Badge variant="solid" intent="destructive">
                      {__("Failed", "structura")}
                    </Badge>
                  ) : run.status === "cancelled" ? (
                    <Badge variant="solid" intent="secondary">
                      {__("Cancelled", "structura")}
                    </Badge>
                  ) : (
                    <Badge variant="solid" intent="info">
                      {__("Running", "structura")}
                    </Badge>
                  )}
                  {run.resultPostUrl &&
                    (run.status === "succeeded" ||
                      run.status === "succeeded_with_warnings") && (
                      <a
                        href={run.resultPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-neutral-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
                        aria-label={__("View live post", "structura")}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
