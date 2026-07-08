import { __, sprintf } from "@wordpress/i18n";
import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  Loader2,
  Minus,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge, Button, Card, PageLoader, cn } from "@structura/ui";
import type { RunStatusSerialized } from "@structura/types";
import { useCampaignRunsQuery } from "@/features/progress/api/useCampaignRunsQuery";
import { formatDuration } from "@/features/progress/formatDuration";

/**
 * Campaign detail "Runs" tab — historical receipt view.
 *
 * Answers "what happened with this campaign?" for the site owner. Each
 * row shows the minimum a support conversation hinges on: status,
 * started/ended time, duration, and (for a failed row) the
 * cloud-surfaced `userMessage` inline so the user doesn't have to
 * drill into the detail page to understand a red row.
 *
 * Deliberately narrow: deeper context (timeline, inputs, outputs) lives
 * on the `RunDetailPage` that each row links to. The tab's job is
 * triage-at-a-glance, not the full receipt.
 *
 * Mirrors the `PostRow` visual weight used by the Posts tab so the two
 * tabs feel like siblings rather than two different products bolted
 * together. Spec: `specs/progress-stream.md` §8 (surfaces inventory).
 */
export const CampaignRunsTab = ({ campaignId }: { campaignId: string | number }) => {
  const { data, isLoading, isError, refetch, isFetching } =
    useCampaignRunsQuery(campaignId);

  if (isError) {
    // A genuine fetch failure — transport blip, plugin-bridge 5xx, or a
    // cloud-side 500. We used to surface this as "Progress history is
    // disabled" because the only reason `isError` could fire was the
    // progress-stream kill-switch; that flag was removed on 2026-04-22
    // and masking real failures as "feature off" was laundering incidents
    // out of the System Logs (the user shipped a bug report that traced
    // back to a listRunsForCampaign 500 we'd been silently swallowing).
    // Be honest: this is "we couldn't load", plus a retry affordance so
    // the user can recover without a page reload.
    return (
      <Card className="overflow-hidden border-neutral-200/60 p-8 text-center">
        <AlertCircle
          className="mx-auto mb-3 h-8 w-8 text-neutral-400 dark:text-neutral-500"
          aria-hidden
        />
        <p className="m-0! text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {__("Couldn’t load run history", "structura")}
        </p>
        <p className="m-0! mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          {__(
            "Something went wrong reaching the cloud. Try again in a moment.",
            "structura",
          )}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void refetch();
          }}
          disabled={isFetching}
          className="mt-4"
        >
          <RefreshCw
            size={12}
            className={cn("mr-1.5", isFetching && "animate-spin")}
            aria-hidden
          />
          {isFetching ? __("Retrying…", "structura") : __("Try again", "structura")}
        </Button>
      </Card>
    );
  }

  if (isLoading) {
    // Use `PageLoader` instead of `AppLoader`: AppLoader is the full-bleed
    // Structura boot surface and announces "the whole app is starting",
    // which misleads the user when only a single list is resolving. The
    // in-page loader is centered, labeled, and sized to the Card that
    // contains it. Spec: RunDetailPage applied the same swap on
    // 2026-04-22; this brings the Runs tab in line.
    return (
      <Card className="overflow-hidden border-neutral-200/60 p-0!">
        <PageLoader
          label={__("Loading runs…", "structura")}
          size="lg"
          padding="lg"
        />
      </Card>
    );
  }

  const runs = data ?? [];

  return (
    <Card className="overflow-hidden border-neutral-200/60 p-0!">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/50 px-5 py-3 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950/30">
        <span className="text-xs font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {runs.length > 0
            ? /* translators: %s is a count of runs (e.g. "12"). */
              sprintf(__("%s runs", "structura"), runs.length.toString())
            : __("Runs", "structura")}
        </span>
      </div>

      {runs.length === 0 ? (
        <div className="py-16 text-center">
          <Activity
            size={32}
            className="mx-auto mb-3 text-neutral-200 dark:text-neutral-700"
            aria-hidden
          />
          <p className="m-0! text-sm text-neutral-400 dark:text-neutral-500">
            {__(
              "No runs recorded for this campaign yet.",
              "structura",
            )}
          </p>
          <p className="m-0! mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            {__(
              "A run will appear here the next time this campaign generates a post.",
              "structura",
            )}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {runs.map((run) => (
            <RunRow key={run.runId} run={run} />
          ))}
        </div>
      )}
    </Card>
  );
};

// ─── Run row ───────────────────────────────────────────────────────────

/**
 * One historical run. Status chip on the left, time range + duration in
 * the middle, chevron on the right, with an optional inline red strip
 * carrying the failure message underneath.
 *
 * The whole row is a link to the detail page — clicking anywhere except
 * the action area navigates. We use a plain anchor (`href="#/runs/…"`)
 * rather than React Router's `Link` here so the navigation intent is
 * clear from the DOM for a11y / middle-click users, and because the
 * campaign view already uses hash-anchor navigation elsewhere.
 */
const RunRow = ({ run }: { run: RunStatusSerialized }) => {
  const startedAt = new Date(run.startedAt);
  const endedAt = run.endedAt ? new Date(run.endedAt) : null;
  // Prefer the cloud-computed durationMs — it's the authoritative
  // wall-clock reading from the scheduler, so it matches what the
  // detail page shows. Compute a fallback from timestamps only when
  // durationMs is missing (in-flight rows, or legacy docs written
  // before the field landed).
  const computedDurationMs =
    run.durationMs ??
    (endedAt ? endedAt.getTime() - startedAt.getTime() : undefined);
  const isTerminal =
    run.status !== "queued" && run.status !== "running";

  return (
    <a
      href={`#/runs/${encodeURIComponent(run.runId)}`}
      className={cn(
        "group flex flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-neutral-50/60 sm:px-6 dark:hover:bg-neutral-800/30",
        "no-underline",
      )}
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <RunStatusChip status={run.status} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="m-0! text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {formatAbsoluteTime(startedAt)}
          </p>
          <p className="m-0! mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            {isTerminal && computedDurationMs != null
              ? /* translators: %s is a duration like "3m 42s". */
                sprintf(
                  __("Completed in %s", "structura"),
                  formatDuration(computedDurationMs),
                )
              : !isTerminal
                ? /* translators: %s is a human step name like "Generating images". */
                  sprintf(
                    __("In progress · %s", "structura"),
                    humanizeStep(run.currentStep),
                  )
                : __("Duration unavailable", "structura")}
          </p>
        </div>

        <ChevronRight
          size={14}
          className="shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-400"
          aria-hidden
        />
      </div>

      {/*
        Inline failure message — only for `failed` runs, and only when
        the cloud surfaced a userMessage. `succeeded_with_warnings`
        deliberately omits this strip: the row is green on purpose,
        and the warning detail lives on the detail page where the
        channels-fan-out context makes the warning actionable.
        Fixed indent on sm+ aligns the strip under the row's text
        column (chip ≈ 7rem + gap-4) without dragging a CSS var
        through the component tree.
      */}
      {run.status === "failed" && run.error?.userMessage && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:ml-28 dark:bg-red-950/40 dark:text-red-300">
          {run.error.userMessage}
        </div>
      )}
    </a>
  );
};

// ─── Status chip ───────────────────────────────────────────────────────

/**
 * Row-level status chip — smaller and less chromatic than the
 * `RunStatusBadge` on the detail page. Having the two treatments
 * diverge is deliberate: the detail page is a hero block where the
 * status drives the eye; the row is triage-dense where the chip is
 * one of three scanning columns.
 *
 * Mirrors the badge intents used elsewhere in the campaign view
 * (see `getBadgeIntentByCampaignStatus`) so the product feels
 * coherent across tabs.
 */
const RunStatusChip = ({
  status,
}: {
  status: RunStatusSerialized["status"];
}) => {
  switch (status) {
    case "succeeded":
      return (
        <Badge variant="solid" intent="success" className="shrink-0">
          <Check size={11} className="mr-1" aria-hidden />
          {__("Succeeded", "structura")}
        </Badge>
      );
    case "succeeded_with_warnings":
      return (
        <Badge variant="solid" intent="warning" className="shrink-0">
          <AlertCircle size={11} className="mr-1" aria-hidden />
          {__("Warnings", "structura")}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="solid" intent="destructive" className="shrink-0">
          <X size={11} className="mr-1" aria-hidden />
          {__("Stopped", "structura")}
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="solid" intent="default" className="shrink-0">
          <Minus size={11} className="mr-1" aria-hidden />
          {__("Cancelled", "structura")}
        </Badge>
      );
    case "running":
      return (
        <Badge variant="solid" intent="info" className="shrink-0">
          <Loader2 size={11} className="mr-1 animate-spin" aria-hidden />
          {__("Running", "structura")}
        </Badge>
      );
    case "awaiting_pull":
      // Cloud finished; the post is being delivered to the site via the
      // backup pull path. Still in flight, not queued.
      return (
        <Badge variant="solid" intent="info" className="shrink-0">
          <Loader2 size={11} className="mr-1 animate-spin" aria-hidden />
          {__("Delivering", "structura")}
        </Badge>
      );
    case "queued":
    default:
      return (
        <Badge variant="solid" intent="default" className="shrink-0">
          {__("Queued", "structura")}
        </Badge>
      );
  }
};

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * "Apr 22, 2026 · 4:12 PM" in the user's locale. Same helper as the
 * detail page — lifted to module scope so both tabs read identically,
 * but not exported because the row formatting is tab-local (the
 * detail page has a taller header that uses a slightly different
 * layout around the timestamp).
 */
function formatAbsoluteTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Translate a Milestone token to human copy without going through the
 * full `milestoneHeadline()` helper, which is phrased as "Generating
 * images" / "Drafting post". That phrasing works in a hero position
 * but looks redundant in a dense row next to "In progress ·". Strip
 * the gerund form down to its noun — "images", "post", "keywords" —
 * so the row reads "In progress · Images" instead of "In progress ·
 * Generating images".
 *
 * Fallback is the raw token itself, so an unknown future milestone
 * renders cleanly rather than as an empty cell.
 */
function humanizeStep(step: string): string {
  switch (step) {
    case "queued":
      return __("Queued", "structura");
    case "authority_fetch":
      return __("Authorities", "structura");
    case "keyword_research":
      return __("Keywords", "structura");
    case "topic_selection":
      return __("Topic", "structura");
    case "drafting":
      return __("Draft", "structura");
    case "images":
    case "image_featured":
    case "image_body":
      return __("Images", "structura");
    case "publish":
      return __("Publishing", "structura");
    case "channels_fanout":
      return __("Channels", "structura");
    default:
      return step;
  }
}
