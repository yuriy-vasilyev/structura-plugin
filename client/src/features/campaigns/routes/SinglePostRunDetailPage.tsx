import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { __ } from "@wordpress/i18n";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PencilLine,
  RefreshCw,
} from "lucide-react";
import { Badge, Button, cn } from "@structura/ui";
import { PageContainer } from "@/components/Layout/PageContainer";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import type { RunStatusSerialized } from "@structura/types";
import { useCampaignRunQuery } from "@/features/progress/api/useCampaignRunQuery";
import { RunTimeline } from "@/features/progress/components/RunTimeline";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import type { CampaignFormData } from "@/features/campaigns/types";

/**
 * Detail page for a single ad-hoc generation kicked off via the
 * `/generate` form. Mounted at `/generate/runs/:runId`.
 *
 * Slimmed-down vs. the campaign `RunDetailPage` because there's no
 * campaign context to pivot from and no tabs to host:
 *   - One page, one column.
 *   - Status pill + headline, then the timeline, then the inputs
 *     snapshot, then the result CTA.
 *   - No "Channels" section (single posts don't fan out to channels).
 *   - No "campaign" link in the header (there's no parent campaign).
 *
 * The page polls the same `useCampaignRunQuery` hook the campaign
 * detail page uses. Once the run reaches a terminal state, polling
 * stops and the user sees the receipt — including a status-aware
 * result banner (published / draft / pending, each with the right
 * CTA) when `resultPostId` lands, and a "Run again" button that
 * replays this run's exact `inputSnapshot` params as a fresh run
 * rather than dropping the user on a blank form.
 */
/**
 * Grace window during which a 404 from `useCampaignRunQuery` is treated
 * as "the run doc is still being created" rather than "the run is gone".
 *
 * Why: when the user submits the `/generate` form we navigate to
 * `/generate/runs/{runId}` *immediately*, but the cloud writes the
 * run doc through Action Scheduler — there's a window where the doc
 * doesn't exist yet. The poll hook returns 404 for that whole window,
 * which used to flash `<NotFoundState />` once per second until the
 * doc landed.
 *
 * Bumped from 30s → 90s on 2026-05-19 after Yurii reproduced the
 * "Run not found" flash on Cloud Agency. WP default cron + Action
 * Scheduler can take 30–60s to actually fire the dispatch task on a
 * site with no recent activity (every page request fires AS, but a
 * fresh-load Generate-Now is the only request that ticks AS, and the
 * cloud's fire-and-forget POST has to land on a cold function). 90s
 * is comfortably above the worst case and still well below the 24h
 * TTL on completed run docs, so the trade-off — a slightly delayed
 * "actually not found" message for docs that never appear — is the
 * right one. Anything truly stuck would be obvious from the absence
 * of progress in the timeline anyway.
 */
const INITIAL_GRACE_WINDOW_MS = 90_000;

export const SinglePostRunDetailPage = () => {
  const { runId } = useParams<{ runId: string }>();
  const { data, isError, isLoading } = useCampaignRunQuery(runId ?? null);

  // Pin the page-mount timestamp on first render. The `useState`
  // initializer runs once — subsequent renders (driven by the 1s poll
  // tick) reuse the same value, so the grace window is anchored to
  // when the user landed on the page, not to "right now".
  const [mountedAt] = useState(() => Date.now());

  // Sticky "we've seen the run doc at least once" flag. Once a poll
  // succeeds, any subsequent transient 404 (cloud cache eviction,
  // serverless cold restart, network blip) must NEVER demote the page
  // back to <NotFoundState/>. The doc existed; the next poll tick will
  // recover. Without this, the page can flicker Loaded → NotFound →
  // Loaded when a poll fails right after a success and the grace
  // window has already expired. Mutation in render is intentional and
  // safe — the ref is read on the same render, not depended on for
  // subscriptions.
  const hasSeenRunRef = useRef(false);
  if (data?.run) {
    hasSeenRunRef.current = true;
  }

  // Bail out only when there's no runId at all. A bare 404-from-jitter
  // on a real id flows into the "queueing" placeholder below.
  if (!runId) {
    return <NotFoundState />;
  }

  // Within the grace window, surface a "starting up" placeholder
  // regardless of whether the hook is currently isLoading or has just
  // resolved with isError (the 1s poll alternates between those two
  // states until the doc lands). The placeholder is sticky across
  // attempts — same DOM node — so we don't blink between renders.
  const inGraceWindow = Date.now() - mountedAt < INITIAL_GRACE_WINDOW_MS;
  if (!data?.run) {
    // If we've seen the run before, this is a transient blip — keep
    // the queueing placeholder up rather than the alarmist NotFound
    // state. The next poll tick will recover.
    if (hasSeenRunRef.current) {
      return <QueueingState runId={runId} />;
    }
    if (isLoading || inGraceWindow) {
      return <QueueingState runId={runId} />;
    }
    if (isError) {
      // Outside the grace window with no doc and a hard error → the
      // run is genuinely gone (TTL'd, never existed, kill-switch).
      return <NotFoundState />;
    }
    // Should be unreachable (no data + no error + not loading + not in
    // grace window), but defensively keep the placeholder so we never
    // render a blank page.
    return <QueueingState runId={runId} />;
  }

  return <SinglePostRunDetailLoaded run={data.run} />;
};

/**
 * Placeholder shown for the first ~30s after landing on a run page,
 * when the cloud's run doc may still be in the AS jitter window. Same
 * visual rhythm as the in-flight banner on the loaded view so the
 * transition into the timeline feels like a continuation rather than
 * a context switch.
 */
const QueueingState = ({ runId: _runId }: { runId: string }) => (
  <PageContainer variant="narrow">
    <div className="mb-6 flex items-start gap-3">
      <Link
        to="/generate"
        className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
        aria-label={__("Back to Generate", "structura")}
      >
        <ArrowLeft size={16} />
      </Link>
      <div>
        <PageTitle>{__("Single-post generation", "structura")}</PageTitle>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="solid" intent="info">
            {__("queueing", "structura")}
          </Badge>
        </div>
      </div>
    </div>

    <section className="flex items-center gap-3 rounded-2xl border border-blue-200/60 bg-blue-50/40 p-6 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
      <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
      <p className="m-0! text-sm text-blue-900 dark:text-blue-100">
        {__(
          "Setting up your run — this only takes a few seconds.",
          "structura",
        )}
      </p>
    </section>
  </PageContainer>
);

const NotFoundState = () => (
  <PageContainer variant="narrow">
    <div className="rounded-2xl border border-neutral-300/50 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <AlertCircle
        className="mx-auto mb-3 h-8 w-8 text-neutral-400 dark:text-neutral-500"
        aria-hidden
      />
      <PageTitle>{__("Run not found", "structura")}</PageTitle>
      <PageDescription>
        {__(
          "We don't have this run anymore. Run docs are kept for 30 days after completion.",
          "structura",
        )}
      </PageDescription>
      <Link to="/generate" className="mt-4 inline-block">
        <Button variant="secondary">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {__("Back to Generate", "structura")}
        </Button>
      </Link>
    </div>
  </PageContainer>
);

const TERMINAL_STATUSES = new Set([
  "succeeded",
  "succeeded_with_warnings",
  "failed",
  "cancelled",
]);

const SinglePostRunDetailLoaded = ({ run }: { run: RunStatusSerialized }) => {
  const navigate = useNavigate();
  const { generatePost, isGenerating } = useCampaignMutations();
  const isTerminal = TERMINAL_STATUSES.has(run.status);
  const isSuccess =
    run.status === "succeeded" || run.status === "succeeded_with_warnings";

  const inputs = (run as RunStatusSerialized & {
    inputSnapshot?: Record<string, unknown>;
  }).inputSnapshot;

  // Pull headline values out of the inputSnapshot for the inputs card.
  // The snapshot mirrors the cluster shape the GeneratePostPage form
  // produced: `identity.objective`, `intelligence.textProvider`, etc.
  // Reads are defensive — older runs (pre-2026-05-01) have no
  // snapshot at all and we just hide that card.
  const objective = readString(inputs, "identity", "objective");
  const campaignMode = readString(inputs, "identity", "campaignMode");
  const textProvider = readString(inputs, "intelligence", "textProvider");
  const imageProvider = readString(inputs, "intelligence", "imageProvider");
  const language = readString(inputs, "intelligence", "language");
  const personaName = readString(inputs, "intelligence", "personaName");

  // The status the user *requested* for the post — the only source that
  // distinguishes draft/pending/publish (`outputs.post.status` can't
  // represent "pending"). Drives the success banner wording + CTA below.
  // Defaults to "publish" for older runs with no snapshot.
  const requestedStatus =
    readString(inputs, "structure", "postStatus") || "publish";

  // "Run again" replays the EXACT params of this run rather than dropping
  // the user on a blank Generate form. `inputSnapshot` already IS the
  // clustered `CampaignFormData` the original submission produced, so we
  // hand it straight to the same mutation the form uses and navigate to
  // the freshly-minted run. Falls back to the blank form only for legacy
  // runs (pre-2026-05-01) that carry no snapshot to replay.
  const handleRunAgain = async () => {
    if (!inputs) {
      navigate("/generate");
      return;
    }
    try {
      const result = await generatePost({
        data: inputs as unknown as CampaignFormData,
      });
      const newRunId = (result as { run_id?: string })?.run_id;
      navigate(newRunId ? `/generate/runs/${newRunId}` : "/generate");
    } catch {
      // Error toast is surfaced by the mutation itself.
    }
  };

  return (
    <PageContainer variant="narrow">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/generate"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
            aria-label={__("Back to Generate", "structura")}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <PageTitle>
              {objective.length > 60
                ? objective.slice(0, 57) + "…"
                : objective || __("Single-post generation", "structura")}
            </PageTitle>
            <div className="mt-2 flex items-center gap-2">
              <StatusPill status={run.status} />
              {run.headline && (
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {run.headline}
                </span>
              )}
            </div>
          </div>
        </div>

        {isTerminal && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRunAgain}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <RefreshCw size={14} className="mr-1.5" />
            )}
            {__("Run again", "structura")}
          </Button>
        )}
      </div>

      {/* ── In-flight banner (above the timeline) ─────────────
          For non-terminal runs we surface "Working on your post —
          this usually takes 4–5 minutes." right below the header so
          the user's first read on landing is "yes, it's still
          working". Originally we placed this BELOW the timeline;
          Yurii feedback 2026-05-01 — when most of the timeline is
          empty stub steps it reads as the page is broken. Moving to
          the top inverts the reading order to "status → progress
          steps → details", which is the same hierarchy as the
          campaign run-detail page.

          Estimate updated 2026-05-02 from "30-60 seconds" to "4-5
          minutes" — the original number was lifted from the
          synchronous text-only path; with cloud-side image gen now
          serving inline (Phase 1.0h) a typical sync run is
          dominated by the image phase (~7m for a body image, ~3m
          for featured-only). 4-5m is the honest p50 for a featured-
          plus-body run. */}
      {!isTerminal && (
        <section className="mb-6 flex items-center gap-3 rounded-2xl border border-blue-200/60 bg-blue-50/40 p-6 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="m-0! text-sm text-blue-900 dark:text-blue-100">
            {__("Working on your post — this usually takes 4–5 minutes.", "structura")}
          </p>
        </section>
      )}

      {/* ── Timeline ─────────────────────────────────────────── */}
      <div className="mb-6">
        <RunTimeline run={run} />
      </div>

      {/* ── Inputs snapshot ──────────────────────────────────── */}
      {inputs && (
        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 m-0!">
            {__("Inputs", "structura")}
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {campaignMode && (
              <Field label={__("Mode", "structura")} value={String(campaignMode)} />
            )}
            {textProvider && (
              <Field
                label={__("Text provider", "structura")}
                value={String(textProvider)}
              />
            )}
            {imageProvider && (
              <Field
                label={__("Image provider", "structura")}
                value={String(imageProvider)}
              />
            )}
            {language && (
              <Field label={__("Language", "structura")} value={String(language)} />
            )}
            {personaName && (
              <Field label={__("Persona", "structura")} value={String(personaName)} />
            )}
          </dl>
        </section>
      )}

      {/* ── Result ───────────────────────────────────────────── */}
      {isSuccess && run.resultPostId ? (
        <SuccessResult
          requestedStatus={requestedStatus}
          postId={run.resultPostId}
          postUrl={run.resultPostUrl}
        />
      ) : run.status === "failed" ? (
        <FailureResult error={run.error} />
      ) : null}
      {/* The non-terminal "Working on your post…" banner used to live
          here as a fallback after the success / failed branches; it
          moved above the timeline as of 2026-05-01 (see the comment up
          there). Don't re-add it: a duplicated banner is what we just
          removed. */}
    </PageContainer>
  );
};

/**
 * Status-aware success banner. A run that finished doesn't necessarily
 * mean the post is *published* — the user may have asked for a draft, in
 * which case "Post published" is a lie and the "View post" permalink
 * lands on a preview/404. We branch on the requested `postStatus` so the
 * headline + CTA match reality: published gets "View post" (front-end
 * permalink); draft gets "Review draft" pointing at the wp-admin editor.
 * ("pending" was removed 2026-07-09; any legacy value is treated as a
 * draft — which is what WP stored it as.)
 */
const SuccessResult = ({
  requestedStatus,
  postId,
  postUrl,
}: {
  requestedStatus: string;
  postId: number | string;
  postUrl?: string;
}) => {
  const isPublished = requestedStatus === "publish";

  const title = isPublished
    ? __("Post published", "structura")
    : __("Draft created", "structura");

  const helper = isPublished
    ? null
    : __("It's saved as a draft — nothing is live yet.", "structura");

  const editUrl = buildEditPostUrl(postId);

  return (
    <section className="mb-6 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <div className="flex-1">
          <p className="m-0! font-medium text-emerald-900 dark:text-emerald-100">
            {title}
          </p>
          {helper && (
            <p className="mt-1 text-sm text-emerald-800/90 dark:text-emerald-200/90 m-0!">
              {helper}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* Published → the live permalink is the useful CTA. */}
            {isPublished && postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
              >
                {__("View post", "structura")}
                <ExternalLink size={13} />
              </a>
            )}
            {/* Draft → the editor is where the user reviews it. */}
            {!isPublished && editUrl && (
              <a
                href={editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
              >
                {__("Review draft", "structura")}
                <PencilLine size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * Failed-run banner. Shows the real cause inline rather than telling the
 * user to "check the logs" — anonymous/"none" installs have no logs
 * surface at all (the System Logs page was retired 2026-05-25), and even
 * on licensed installs sending someone off to a separate page for an
 * error we already hold is poor UX. We render `userMessage` when present,
 * fall back to the operator-safe `devMessage`, and always surface a small
 * technical line (`code · kind`) so there's something concrete to report.
 */
const FailureResult = ({
  error,
}: {
  error: RunStatusSerialized["error"];
}) => {
  const primary = error?.userMessage || error?.devMessage;
  const techBits = [error?.code, error?.errorKind].filter(Boolean);

  return (
    <section className="mb-6 rounded-2xl border border-red-200/70 bg-red-50/40 p-6 shadow-sm dark:border-red-900/40 dark:bg-red-950/20">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400" />
        <div className="flex-1">
          <p className="m-0! font-medium text-red-900 dark:text-red-100">
            {__("Generation failed", "structura")}
          </p>
          <p className="mt-2 text-sm text-red-800 dark:text-red-200 m-0!">
            {primary ||
              __(
                "The run stopped before the post was created. Try Run again, or adjust your inputs and retry.",
                "structura",
              )}
          </p>
          {techBits.length > 0 && (
            <p className="mt-2 font-mono text-[11px] text-red-700/80 dark:text-red-300/70 m-0!">
              {techBits.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

/* ── helpers ───────────────────────────────────────────────── */

/**
 * Build a wp-admin post-editor URL from a post id. The SPA is served
 * from `…/wp-admin/admin.php?page=structura`, so the admin base is the
 * current path with the trailing `admin.php` stripped — this survives
 * subdirectory installs, custom admin slugs, and reverse proxies where
 * deriving from `structuraConfig.domain` alone would lose the path.
 * Returns "" in non-browser contexts (Vitest) so callers can guard.
 */
const buildEditPostUrl = (postId: number | string): string => {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  const adminDir = pathname.replace(/admin\.php$/, "");
  return `${origin}${adminDir}post.php?post=${encodeURIComponent(
    String(postId),
  )}&action=edit`;
};

const StatusPill = ({ status }: { status: RunStatusSerialized["status"] }) => {
  const intent =
    status === "succeeded" || status === "succeeded_with_warnings"
      ? "success"
      : status === "failed" || status === "cancelled"
      ? "destructive"
      : "info";
  return (
    <Badge variant="solid" intent={intent}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {label}
    </dt>
    <dd className={cn("mt-1 text-sm text-neutral-900 dark:text-neutral-100 m-0!")}>
      {value}
    </dd>
  </div>
);

/**
 * Defensive helper for the inputSnapshot reads. Returns "" when the path
 * doesn't resolve to a string — the caller can then use `if (value)` to
 * decide whether to render the field at all. Older runs (pre-2026-05-01)
 * have no snapshot, so every read goes through this guard rather than
 * blowing up the whole page on a single missing key.
 */
const readString = (
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): string => {
  let cur: unknown = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? cur : "";
};

export default SinglePostRunDetailPage;
