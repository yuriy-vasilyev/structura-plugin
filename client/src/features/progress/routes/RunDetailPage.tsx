import { useState } from "react";
import { Link, useParams } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Minus,
  Share2,
  Sparkles,
  Terminal,
  Timer,
  UserCheck,
} from "lucide-react";
import type { BadgeProps } from "@structura/ui";
import { Badge, Button, cn, PageLoader } from "@structura/ui";
import { PageContainer } from "@/components/Layout/PageContainer";
import { PageTitle } from "@/components/Layout/PageTitle";
import type { RunStatusSerialized } from "@structura/types";
import { useCampaignRunQuery } from "../api/useCampaignRunQuery";
import { milestoneHeadline, milestoneOrderForFlow } from "../milestones";
import { formatDuration } from "../formatDuration";
import { RunTimeline } from "../components/RunTimeline";
import { usePersonasQuery } from "@/features/personas";

/**
 * Per-run receipt view. Read-only for Phase 1 — Retry, Dismiss, and the
 * Needs Attention deep-link all come in later phases (spec §10).
 *
 * Spec: `specs/run-detail-view.md` §5 (route, layout, section content).
 *
 * Three render states matter:
 *   1. Loading — first poll hasn't landed. Show a calm loader.
 *   2. Error — the plugin bridge returned 404 because the doc TTL'd
 *      (30d) or feature flag was flipped. Degrade to a helpful
 *      "we don't have this run anymore" page rather than a raw error.
 *   3. Loaded — five visual sections: header, timeline, run configuration,
 *      production results, and the always-present-but-collapsed
 *      Technical Inspector accordion.
 *
 * Why we reuse `useCampaignRunQuery` rather than a dedicated "detail"
 * hook: the wire contract is identical to the drawer's polling hook,
 * and reusing it means a live (non-terminal) run opened in a new tab
 * keeps animating with the same 1s/5s polling cadence.
 *
 * Visual redesign (2026-04-22, based on Gemini mockup): the page now
 * reads as a professional "Job Receipt" — a bold page title, an airy
 * vertical process timeline, two side-by-side intent cards ("what we
 * used" / "what we produced"), and a terminal-styled technical
 * inspector for support conversations. The earlier table-style layout
 * was readable but felt more like a config dump than a proud receipt
 * for a campaign that the user launched and watched finish.
 */
export const RunDetailPage = () => {
  const { runId } = useParams<{ runId: string }>();
  const { data, isError, isLoading } = useCampaignRunQuery(runId ?? null);

  if (!runId) {
    return <NotFoundState />;
  }

  if (isError) {
    return <NotFoundState />;
  }

  if (isLoading || !data?.run) {
    return (
      <PageContainer variant="narrow">
        <PageLoader label={__("Loading run…", "structura")} size="lg" padding="lg" />
      </PageContainer>
    );
  }

  return <RunDetailLoaded run={data.run} />;
};

/**
 * The plugin bridge returns 404 when the `CampaignRun` doc has TTL'd
 * (30 days post-terminal, per spec §2.7) or the progress-stream flag
 * was kill-switched. Either way it's a terminal condition — no retry,
 * no "pull-to-refresh". Show a calm page with a way back.
 */
const NotFoundState = () => (
  <PageContainer variant="narrow">
    <div className="rounded-2xl border border-neutral-300/50 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <AlertCircle
        className="mx-auto mb-3 h-8 w-8 text-neutral-400 dark:text-neutral-500"
        aria-hidden
      />
      <PageTitle>{__("Run not found", "structura")}</PageTitle>
      {/* mt-2!/mb-0!: wp-admin's global stylesheet sets
          `p { margin: 0 0 1em }`, which leaks into the SPA and breaks
          vertical rhythm. Every <p>/<h*> in this file declares its
          top+bottom margins with `!` so the admin cascade can't reach
          them (see CLAUDE.md / feedback_wp_admin_margin_override.md). */}
      <p className="mt-2! mb-0! text-sm text-neutral-600 dark:text-neutral-400">
        {__(
          "This run's details are no longer available. Runs are kept for 30 days after they finish.",
          "structura"
        )}
      </p>
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" size="sm" href="#/">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {__("Back to Overview", "structura")}
        </Button>
      </div>
    </div>
  </PageContainer>
);

/**
 * Loaded-state layout. Pulled into its own component so the outer
 * page can handle loading/error purely and this can assume `run`
 * is defined.
 */
const RunDetailLoaded = ({ run }: { run: RunStatusSerialized }) => (
  <PageContainer variant="narrow">
    <RunDetailHeader run={run} />
    <div className="space-y-6">
      <RunTimeline run={run} />
      <RunInputsCard run={run} />
      <RunOutputsCard run={run} />
      <RunTechnicalInspector run={run} />
    </div>
  </PageContainer>
);

// ─── Header ─────────────────────────────────────────────────────────────────

const RunDetailHeader = ({ run }: { run: RunStatusSerialized }) => {
  const startedAt = new Date(run.startedAt);
  const isSuccess = run.status === "succeeded" || run.status === "succeeded_with_warnings";
  return (
    <div className="mb-6">
      {/* Back link — small, calm, plenty of whitespace below before the title */}
      <Link
        to={`/campaigns/${run.campaignId}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        {/* translators: %s is a campaign name (e.g. "Low-carb cooking"). */}
        {sprintf(__("Back to %s", "structura"), run.campaignName)}
      </Link>

      {/* Title + meta on the left, CTA on the right. `items-start` on
          mobile (everything stacked), `items-center` on md+ so the CTA
          aligns to the vertical centre of the title block — `items-end`
          (the previous setting) anchored the CTA to the bottom of the
          title and made the layout feel collapsed when the meta row was
          short. `gap-3` on mobile vs `gap-6` on md+ keeps the stacked
          layout breathable without ballooning the desktop view. */}
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
        {/* space-y-4: the meta row (badge + timestamps) needs real
            breathing room under the title. `space-y-2.5` left the badge
            sitting on top of the heading and made the header read as a
            single dense block; bumping to 16px gives the title its own
            visual line and the meta row reads as a separate, calmer
            sub-header. */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* m-0!: wp-admin sets `h1 { margin: …; padding: 9px 0 4px }` on
              admin pages, which collides with our tracking + `space-y-*`.
              Every <h*>/<p> on this page pins its margins explicitly with
              the `!` suffix (Tailwind 4) so the admin cascade can't leak in.
              Stepped down from text-3xl → text-2xl: 30px was overpowering
              the rest of the header chrome (badge + meta row felt cramped
              underneath an oversized title). */}
          <h1 className="m-0! truncate text-2xl leading-tight font-black tracking-tight text-[#1d2327] dark:text-white">
            {run.campaignName}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <RunStatusBadge status={run.status} />
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
              <Clock className="h-3 w-3 opacity-60" aria-hidden />
              <span>{formatAbsoluteTime(startedAt)}</span>
            </div>
            {run.durationMs != null && (
              <div className="flex items-center gap-1.5 border-l border-neutral-200 pl-3 text-xs font-medium text-neutral-500 dark:border-neutral-800">
                <Timer className="h-3 w-3 opacity-60" aria-hidden />
                <span>
                  {/* translators: %s is a duration like "3m 42s". */}
                  {sprintf(__("Finished in %s", "structura"), formatDuration(run.durationMs))}
                </span>
              </div>
            )}
            {/* Phase 1.6 — surface stock-served runs so the sub-second
                publish latency is explained, not mysterious. The badge
                reads as a positive ("we had this ready for you")
                rather than a technical detail. Only renders when the
                run came from the pre-generation pipeline; sync runs
                leave the field absent and the badge is omitted. */}
            {run.servedFromStock && (
              <div className="border-l border-neutral-200 pl-3 dark:border-neutral-800">
                <span className="bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {__("Pre-generated", "structura")}
                </span>
              </div>
            )}
          </div>
        </div>

        {isSuccess && run.resultPostUrl && (
          // Use the @structura/ui Button primitive instead of a hand-rolled
          // anchor. The previous version was px-6 py-3 rounded-xl with a
          // heavy `shadow-lg` — too chunky next to the slim badge + meta
          // row, and inconsistent with every other CTA in the SPA which
          // goes through `Button`. `size="sm"` resolves to px-3 py-1.5
          // text-xs rounded-lg per `packages/ui/src/variants/button.ts`,
          // and `variant="primary"` already includes the WP-admin link-
          // cascade overrides (text-white!, hover:text-white!, etc.) so
          // the manual cascade-busting on the old anchor is no longer
          // needed.
          <Button
            href={run.resultPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            size="sm"
            className="shrink-0"
          >
            <span className="m-0!">{__("View Published Post", "structura")}</span>
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Status chip rendered atop the run-detail header. Bound to the design-
 * system `Badge` so the chip stays in lockstep with every other status
 * surface (campaign rows, recent-runs widget, drawer header) — the
 * previous bespoke `<div>` had drifted from the system's typography +
 * dark-mode pairing.
 *
 * Each run status maps to one `Badge` intent so the colour story stays
 * consistent with the dashboard's `RecentSinglePostRuns` and the run
 * timeline's row states:
 *   - `succeeded` / `succeeded_with_warnings` → success / warning
 *   - `failed` → destructive
 *   - `cancelled` → default (neutral)
 *   - `running` → indigo (brand, matches the timeline's in-flight rail)
 *   - `queued` → default (neutral)
 *
 * The spinner on `running` keeps the in-flight animation parity with the
 * drawer's active state.
 */
const RunStatusBadge = ({ status }: { status: RunStatusSerialized["status"] }) => {
  const variants: Record<
    RunStatusSerialized["status"],
    {
      label: string;
      intent: NonNullable<BadgeProps["intent"]>;
      Icon: React.ComponentType<{ className?: string }>;
      spin?: boolean;
    }
  > = {
    succeeded: {
      label: __("Succeeded", "structura"),
      intent: "success",
      Icon: CheckCircle2,
    },
    succeeded_with_warnings: {
      label: __("Warnings", "structura"),
      intent: "warning",
      Icon: AlertCircle,
    },
    failed: {
      label: __("Stopped", "structura"),
      intent: "destructive",
      Icon: AlertTriangle,
    },
    cancelled: {
      label: __("Cancelled", "structura"),
      intent: "default",
      Icon: Minus,
    },
    running: {
      label: __("In Progress", "structura"),
      intent: "indigo",
      Icon: Loader2,
      spin: true,
    },
    awaiting_pull: {
      // The cloud finished but couldn't reach the site directly, so the post
      // is being delivered via the backup pull path — still in flight.
      label: __("Delivering", "structura"),
      intent: "indigo",
      Icon: Loader2,
      spin: true,
    },
    queued: {
      label: __("Queued", "structura"),
      intent: "default",
      Icon: Timer,
    },
  };
  const variant = variants[status] ?? variants.queued;
  const Icon = variant.Icon;
  return (
    <Badge intent={variant.intent} variant="solid">
      <Icon className={cn("h-3 w-3", variant.spin && "animate-spin")} />
      {variant.label}
    </Badge>
  );
};

// ─── Run Configuration (Inputs) ─────────────────────────────────────────────

/**
 * Safe label for an authority chip. `authorities[].title` is *supposed* to be
 * a string, but a run generated from a doubly-nested `authorityDomains` doc
 * (cloud bug fixed in cluster-adapter, 2026-07-01) persisted the whole
 * `{domain, description, tier, ...}` object as `title`. Rendering that object
 * directly threw React #31 and white-screened the entire run view — so this
 * receipt could never be opened to read the failure. Coerce defensively:
 * string wins, then a nested `.domain`, then derive from the URL.
 */
export function authorityChipLabel(a: { url?: unknown; title?: unknown }): string {
  if (typeof a.title === "string" && a.title) return a.title;
  const t = a.title;
  if (t && typeof t === "object" && typeof (t as { domain?: unknown }).domain === "string") {
    return (t as { domain: string }).domain;
  }
  if (typeof a.url === "string") {
    return a.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || a.url;
  }
  return "";
}

const RunInputsCard = ({ run }: { run: RunStatusSerialized }) => {
  const inputs = run.inputs;
  // Pre-inputs-snapshot fallback: runs older than this feature's ship
  // date don't have an `inputs` blob. Render a calm empty state so the
  // card doesn't look broken. Once the 30d TTL window has elapsed this
  // branch becomes unreachable.
  if (!inputs) {
    return (
      <SectionCard label={__("Run Configuration", "structura")} Icon={Cpu}>
        <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
          {__(
            "This run predates the inputs snapshot, so its request details aren't available.",
            "structura"
          )}
        </p>
      </SectionCard>
    );
  }

  // Persona resolution: the run doc carries only the Firestore
  // nanoid (changed 2026-05-01 — Yurii feedback after the prompt
  // text was leaking into a denormalized `name` field). Resolve it
  // through `usePersonasQuery` so the receipt always shows the
  // current display name. The hook is cached for the SPA lifetime
  // so the lookup is essentially free; if the persona was deleted
  // we fall through to a "—" placeholder.
  const personaId = inputs.persona?.personaId;
  const { data: personas = [] } = usePersonasQuery();
  // `Persona.id` is typed as `number` for legacy reasons but actually
  // carries the Firestore nanoid string after the v2 sweep — compare
  // via `String(p.id)` so the lookup works regardless. See
  // `Persona_Shape_Transformer::cloud_to_wp` plugin-side.
  const personaName = personaId
    ? (personas.find((p) => String(p.id) === personaId)?.name ?? null)
    : null;

  const hasKeywords = (inputs.keywords?.length ?? 0) > 0;
  const hasPersona = !!personaId;
  const textProvider = inputs.providers?.text;
  const imageProvider = inputs.providers?.image;
  const textFallback = inputs.fallbackProviders?.text;
  const imageFallback = inputs.fallbackProviders?.image;
  const hasAnyProvider = textProvider || imageProvider || textFallback || imageFallback;
  const hasAudience = !!inputs.targetAudience;
  const hasRhythm = !!inputs.rhythm;
  const hasAuthorities = (inputs.authorities?.length ?? 0) > 0;

  return (
    <SectionCard label={__("Run Configuration", "structura")} Icon={Cpu}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Left column — Topic & Strategy */}
        <div className="space-y-6">
          {hasKeywords && (
            <FieldBlock label={__("Target Keywords", "structura")}>
              <div className="flex flex-wrap gap-2">
                {inputs.keywords!.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-bold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </FieldBlock>
          )}
          {hasAuthorities && (
            <FieldBlock label={__("Authorities", "structura")}>
              <div className="flex flex-wrap gap-2">
                {inputs.authorities!.map((a, i) => (
                  <span
                    key={typeof a.url === "string" ? a.url : i}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-bold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {authorityChipLabel(a)}
                  </span>
                ))}
              </div>
            </FieldBlock>
          )}
          {hasPersona && (
            <FieldBlock label={__("Content Persona", "structura")}>
              <div className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-950/30">
                <div className="bg-brand-100 text-brand-600 dark:bg-brand-900/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <UserCheck size={20} aria-hidden />
                </div>
                <p className="m-0! text-sm font-bold dark:text-white">
                  {personaName ?? __("Persona deleted", "structura")}
                </p>
              </div>
            </FieldBlock>
          )}
        </div>

        {/* Right column — Providers & Logic */}
        <div className="space-y-6">
          {hasAnyProvider && (
            <FieldBlock label={__("AI Intelligence", "structura")}>
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {textProvider && (
                  <ProviderRow
                    slotLabel={__("Text Provider", "structura")}
                    providerId={textProvider.id}
                    model={textProvider.model}
                  />
                )}
                {imageProvider && (
                  <ProviderRow
                    slotLabel={__("Image Provider", "structura")}
                    providerId={imageProvider.id}
                    model={imageProvider.model}
                  />
                )}
                {/* Only render fallback rows when they actually fired —
                    spec §5.4: "Show the fallback provider only if it was
                    actually used — an unused fallback is noise." */}
                {textFallback && (
                  <ProviderRow
                    slotLabel={__("Text Fallback (used)", "structura")}
                    providerId={textFallback.id}
                    model={textFallback.model}
                    secondary
                  />
                )}
                {imageFallback && (
                  <ProviderRow
                    slotLabel={__("Image Fallback (used)", "structura")}
                    providerId={imageFallback.id}
                    model={imageFallback.model}
                    secondary
                  />
                )}
              </div>
            </FieldBlock>
          )}
          {(hasAudience || hasRhythm) && (
            <div className="flex gap-4">
              {hasAudience && (
                <FieldBlock className="flex-1" label={__("Audience", "structura")}>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/30 p-3 dark:border-neutral-800 dark:bg-neutral-950/20">
                    <p className="m-0! text-xs font-bold dark:text-neutral-200">
                      {inputs.targetAudience}
                    </p>
                  </div>
                </FieldBlock>
              )}
              {hasRhythm && (
                <FieldBlock className="flex-1" label={__("Rhythm", "structura")}>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/30 p-3 dark:border-neutral-800 dark:bg-neutral-950/20">
                    <p className="m-0! font-mono text-xs font-bold dark:text-neutral-200">
                      {inputs.rhythm}
                    </p>
                  </div>
                </FieldBlock>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

/**
 * Small micro-labeled field block used throughout the Inputs card.
 * Micro-label is intentionally 12px / normal weight (not the
 * heavier uppercase treatment reserved for section headers) so the
 * visual hierarchy reads as "section → field → value" rather than
 * three competing all-caps bars.
 */
const FieldBlock = ({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("space-y-2", className)}>
    <label className="text-xs font-bold text-neutral-400">{label}</label>
    {children}
  </div>
);

/**
 * Provider slot row — "Text Provider: Gemini (1.5 Pro)". `secondary`
 * dims the treatment a touch to communicate "this is the fallback
 * row, not the primary".
 */
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  anthropic: "Anthropic",
};

const ProviderRow = ({
  slotLabel,
  providerId,
  model,
  secondary,
}: {
  slotLabel: string;
  providerId: string;
  model: string;
  secondary?: boolean;
}) => {
  const name = PROVIDER_LABELS[providerId] ?? providerId;
  return (
    <div
      className={cn(
        "flex items-center justify-between bg-neutral-50/30 p-3 dark:bg-neutral-950/20",
        secondary && "opacity-80"
      )}
    >
      <span className="text-xs font-medium text-neutral-500">{slotLabel}</span>
      <span className="text-xs font-bold dark:text-neutral-200">
        {name}{" "}
        <span className="font-mono text-[11px] font-normal text-neutral-500 dark:text-neutral-400">
          ({model})
        </span>
      </span>
    </div>
  );
};

// ─── Production Results (Outputs) ───────────────────────────────────────────

const RunOutputsCard = ({ run }: { run: RunStatusSerialized }) => {
  const isSuccess = run.status === "succeeded" || run.status === "succeeded_with_warnings";
  const isFailed = run.status === "failed";

  return (
    <SectionCard label={__("Production Results", "structura")} Icon={Share2}>
      {isFailed && <FailureOutputs run={run} />}
      {isSuccess && <SuccessOutputs run={run} />}
      {!isSuccess && !isFailed && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
            <FileText size={24} aria-hidden />
          </div>
          <p className="m-0! text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {__("Output will appear here once the run reaches completion.", "structura")}
          </p>
        </div>
      )}
    </SectionCard>
  );
};

/** Does the outputs blob carry anything beyond a published post url? */
function hasAnyOutputContent(outputs: RunStatusSerialized["outputs"]): boolean {
  if (!outputs) return false;
  if (outputs.post?.id) return true;
  if (outputs.images && outputs.images.length > 0) return true;
  return false;
}

const FailureOutputs = ({ run }: { run: RunStatusSerialized }) => {
  const stoppedAt = milestoneHeadline(run.currentStep);
  const hasPartial = hasAnyOutputContent(run.outputs);
  const imageCount = run.outputs?.images?.length ?? 0;
  // The cloud's classifier-driven user-facing message (added
  // 2026-05-01). Carries actionable copy for the categories the
  // run-doc surface can resolve — "try again in a minute" for
  // transient, "re-enter your API key" for auth, etc. We prefer
  // this over the milestone-headline fallback because "Generation
  // stopped" tells the user WHERE it stopped but not WHY, and the
  // why is what they need to act on. Yurii feedback 2026-05-01.
  const userMessage = run.error?.userMessage?.trim();
  // Keep the "stopped at <step>" hint as a secondary breadcrumb so
  // support conversations can still pin down the failure point at
  // a glance.
  const stoppedAtHint = sprintf(__("Stopped at %s.", "structura"), stoppedAt);

  if (!hasPartial) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        {userMessage ? (
          <>
            <p className="m-0! text-sm font-medium text-red-900 dark:text-red-200">{userMessage}</p>
            <p className="m-0! mt-1 text-xs text-red-700/80 dark:text-red-300/70">
              {stoppedAtHint}
            </p>
          </>
        ) : (
          <p className="m-0! text-sm text-red-800 dark:text-red-300">
            {/* translators: %s is a milestone name like "Generating images". */}
            {sprintf(
              __("This run stopped at %s, before producing output.", "structura"),
              stoppedAt
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        {userMessage ? (
          <>
            <p className="m-0! text-sm font-medium text-amber-900 dark:text-amber-100">
              {userMessage}
            </p>
            <p className="m-0! mt-1 text-xs text-amber-800/80 dark:text-amber-200/70">
              {stoppedAtHint}
            </p>
          </>
        ) : (
          <p className="m-0! text-sm text-amber-800 dark:text-amber-200">
            {/* translators: %s is the stopping step name. */}
            {sprintf(
              __("This run stopped at %s before the post was published.", "structura"),
              stoppedAt
            )}
          </p>
        )}
      </div>
      {imageCount > 0 && (
        <p className="m-0! text-sm text-neutral-600 dark:text-neutral-300">
          {/* translators: %d is a number of images (e.g. 1). */}
          {sprintf(
            __(
              "Generated %d image(s) before stopping — they weren't attached to a post.",
              "structura"
            ),
            imageCount
          )}
        </p>
      )}
    </div>
  );
};

const SuccessOutputs = ({ run }: { run: RunStatusSerialized }) => {
  const channelsSummary = run.outputs?.channelsSummary;
  const imageFailures = run.outputs?.imageFailures;
  const showWarningsNote = run.status === "succeeded_with_warnings";
  const hasChannels =
    channelsSummary &&
    (channelsSummary.succeeded.length > 0 ||
      channelsSummary.failed.length > 0 ||
      channelsSummary.skipped.length > 0);
  const hasImageFailures = !!imageFailures && imageFailures.length > 0;

  // Pick the warning headline based on what actually went wrong. The
  // pre-1.0h copy assumed "distribution channels had a problem" was
  // the only reachable warning surface; with cloud-side inline image
  // gen (Spec §1.0h Phase 2) we can also land here from a partial
  // image-gen result. Picking the right headline matters because the
  // body of the receipt below itemizes only the matching kind.
  const warningHeadline =
    hasImageFailures && !channelsSummary?.failed?.length
      ? __(
          "The post was published, but one or more images couldn't be generated. Details below.",
          "structura"
        )
      : hasImageFailures && channelsSummary?.failed?.length
        ? __(
            "The post was published, but some images and distribution channels had a problem. Details below.",
            "structura"
          )
        : __(
            "The post was published, but one or more distribution channels had a problem. Details below.",
            "structura"
          );

  return (
    <div className="space-y-8">
      {showWarningsNote && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          {warningHeadline}
        </div>
      )}
      {run.resultPostUrl ? (
        <a
          href={run.resultPostUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border-brand-100 bg-brand-50/20 dark:border-brand-900/30 dark:bg-brand-950/10 hover:border-brand-200 flex items-center justify-between gap-4 rounded-xl border-2 p-4 transition-colors"
        >
          <div className="flex min-w-0 items-center gap-4">
            <div className="text-brand-600 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
              <Globe size={24} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="m-0! text-sm font-bold dark:text-white">
                {__("WordPress Published Post", "structura")}
              </p>
              <p className="m-0! truncate text-xs text-neutral-500">{run.resultPostUrl}</p>
            </div>
          </div>
          <ChevronRight
            className="hover:text-brand-600 h-5 w-5 shrink-0 text-neutral-400 transition-colors"
            aria-hidden
          />
        </a>
      ) : (
        <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
          {__("Waiting for WordPress to confirm the published post.", "structura")}
        </p>
      )}

      {hasChannels && <ChannelsGrid summary={channelsSummary!} />}
      {hasImageFailures && <ImageFailuresList failures={imageFailures!} />}
    </div>
  );
};

/**
 * Lists the image slots the cloud-side inline image-gen path tried but
 * couldn't produce (Spec §1.0h Phase 2). Each row shows the slot name
 * and the raw provider/error string. The post still landed and the
 * succeeded slots show on the post itself — this list is purely the
 * "why your post is missing a hero image" explanation.
 *
 * Visual treatment matches the warnings banner above (amber tint) so
 * it reads as a single block of "here's what went sideways" rather than
 * three disjoint UI elements.
 */
const ImageFailuresList = ({
  failures,
}: {
  failures: NonNullable<NonNullable<RunStatusSerialized["outputs"]>["imageFailures"]>;
}) => (
  <div className="space-y-3">
    <h3 className="m-0! text-sm font-bold text-neutral-700 dark:text-neutral-200">
      {__("Image generation issues", "structura")}
    </h3>
    <ul className="m-0! list-none space-y-2 p-0!">
      {failures.map((failure) => (
        <li
          key={failure.slot}
          className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/20"
        >
          <p className="m-0! font-bold text-amber-900 dark:text-amber-200">
            {failure.slot === "featured"
              ? __("Featured image", "structura")
              : __("Body image", "structura")}
          </p>
          <p className="m-0! mt-1 text-amber-800 dark:text-amber-200/80">{failure.reason}</p>
        </li>
      ))}
    </ul>
  </div>
);

/**
 * Grid of channel chips with a pulsing status dot per channel. The dot
 * is colour-coded: emerald for succeeded, red for failed, muted for
 * skipped — so the grid reads as "a mission-control dashboard of your
 * distribution channels" rather than a bulleted list. The pulsing
 * glow on success is a deliberate bit of delight: this is the moment
 * the user most wants to admire what they just shipped.
 */
const ChannelsGrid = ({
  summary,
}: {
  summary: NonNullable<NonNullable<RunStatusSerialized["outputs"]>["channelsSummary"]>;
}) => (
  <div className="space-y-4">
    <label className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
      {__("Distribution Channels", "structura")}
    </label>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {summary.succeeded.map((id) => (
        <ChannelChip key={`ok-${id}`} id={id} intent="success" />
      ))}
      {summary.failed.map((id) => (
        <ChannelChip key={`fail-${id}`} id={id} intent="failure" />
      ))}
      {summary.skipped.map((id) => (
        <ChannelChip key={`skip-${id}`} id={id} intent="skipped" />
      ))}
    </div>
  </div>
);

const ChannelChip = ({ id, intent }: { id: string; intent: "success" | "failure" | "skipped" }) => {
  const dotClass =
    intent === "success"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
      : intent === "failure"
        ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
        : "bg-neutral-400";
  const textClass =
    intent === "skipped" ? "text-neutral-500 dark:text-neutral-400" : "dark:text-neutral-200";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/30 p-3 dark:border-neutral-800 dark:bg-neutral-950/20">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} />
      <span className={cn("truncate text-xs font-bold", textClass)}>{id}</span>
    </div>
  );
};

// ─── Technical Inspector (accordion) ────────────────────────────────────────

const RunTechnicalInspector = ({ run }: { run: RunStatusSerialized }) => {
  const [expanded, setExpanded] = useState(false);
  const truncatedRunId = run.runId.length > 12 ? `${run.runId.substring(0, 12)}…` : run.runId;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-300/50 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group flex w-full items-center justify-between p-5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        <div className="flex items-center gap-3">
          <div className="group-hover:text-brand-500 flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 transition-colors dark:bg-neutral-800">
            <Terminal size={16} aria-hidden />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="text-sm leading-tight font-bold text-neutral-900 dark:text-neutral-100">
              {__("Technical Inspector", "structura")}
            </span>
            <span className="font-mono text-[10px] tracking-tighter text-neutral-400 uppercase dark:text-neutral-500">
              {/* translators: %s is a short run id prefix like "9c1f4e30-7a2b". */}
              {sprintf(__("ID: %s", "structura"), truncatedRunId)}
            </span>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            "text-neutral-400 transition-transform duration-300",
            expanded && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {expanded && <TechnicalInspectorBody run={run} />}
    </div>
  );
};

const TechnicalInspectorBody = ({ run }: { run: RunStatusSerialized }) => (
  <div className="space-y-6 border-t border-neutral-100 bg-neutral-50/30 p-6 dark:border-neutral-800 dark:bg-[#0c0c0c]">
    <div className="grid gap-6 font-mono text-[11px] sm:grid-cols-2">
      <div>
        <p className="mt-0! mb-1! font-bold text-neutral-400 uppercase">
          {__("Correlation Trace", "structura")}
        </p>
        <p className="m-0! rounded border border-neutral-200 bg-white p-2 break-all dark:border-neutral-800 dark:bg-neutral-900">
          {run.runId}
        </p>
      </div>
      <div>
        <p className="mt-0! mb-1! font-bold text-neutral-400 uppercase">
          {__("System Error Reference", "structura")}
        </p>
        <p className="m-0! rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
          {run.error?.code ?? "null"}
          {run.error?.errorKind && (
            <span className="ml-2 text-neutral-400">· {run.error.errorKind}</span>
          )}
        </p>
        {run.error?.devMessage && (
          <p className="mt-1.5 mb-0! text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
            {run.error.devMessage}
          </p>
        )}
      </div>
    </div>
    {run.stepDurationsMs && Object.keys(run.stepDurationsMs).length > 0 && (
      <div>
        <p className="mt-0! mb-2! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
          {__("Step Timings", "structura")}
        </p>
        <dl className="space-y-1">
          {milestoneOrderForFlow(run.flow)
            .filter((m) => run.stepDurationsMs?.[m] != null)
            .map((m) => (
              <div key={m} className="grid grid-cols-[140px_1fr] items-baseline gap-4">
                <dt className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{m}</dt>
                <dd className="font-mono text-xs text-neutral-800 dark:text-neutral-200">
                  {formatDuration(run.stepDurationsMs?.[m] ?? 0)}
                </dd>
              </div>
            ))}
        </dl>
      </div>
    )}
  </div>
);

// ─── Shared section card ────────────────────────────────────────────────────

/**
 * The card shell used by every section on this page, so the visual
 * rhythm reads as "header · stack of identical cards · accordion".
 * Each card gets the same micro-label (`14px` icon + uppercase tracked
 * label) that the Gemini mockup established.
 */
const SectionCard = ({
  label,
  Icon,
  children,
}: {
  label: string;
  // Accept the broader lucide-react icon shape (`size?: string | number`)
  // so callers can pass any lucide icon without widening the narrower
  // "numeric size only" contract back up here. Spec §5.1: every section
  // on the detail page uses a lucide icon as its micro-label glyph.
  Icon: React.ComponentType<{
    size?: string | number;
    className?: string;
  }>;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-neutral-300/50 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <h2 className="mt-0! mb-6! flex! items-center gap-2 text-[10px] font-black tracking-[0.2em] text-neutral-400 uppercase">
      <Icon size={14} />
      {label}
    </h2>
    {children}
  </div>
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a Date as "Apr 22, 2026 · 4:12 PM" in the user's locale.
 * Intl.DateTimeFormat covers the four supported locales (en/de/es/fr)
 * without an external dep.
 */
function formatAbsoluteTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    // Defensive: Intl.DateTimeFormat is universally available in
    // modern browsers but we've seen weird sandbox envs reject
    // options keys.
    return d.toISOString();
  }
}

// Re-export for tests that need the sub-components directly. Prefer
// rendering the full page in tests, but status-badge / channel chip
// unit tests have a legitimate need for the smaller surface area.
export { RunStatusBadge, ChannelChip };

export default RunDetailPage;
