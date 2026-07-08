import { useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@structura/ui";
import { useRuns } from "../context/RunsContext";
import { useCampaignRunQuery } from "../api/useCampaignRunQuery";
import { useLicense } from "@/features/settings";
import {
  milestoneHeadline,
  milestoneIcon,
  milestoneOrderForFlowAndTier,
  milestoneSubtext,
} from "../milestones";
import { RunTimeline } from "./RunTimeline";

/**
 * Inline progress strip that surfaces an in-flight campaign run directly
 * on the surface the user is already looking at — the Campaigns list card
 * footer and the campaign detail header.
 *
 * Why it lives here instead of a global floating drawer:
 *   - A global drawer announces "something is happening across
 *     Structura". It does *not* answer "which of my eight campaign
 *     cards is the one that just kicked off?".
 *   - The inline strip co-locates progress with the specific campaign
 *     the user launched from, so the moment of feedback ("yes, THIS
 *     one") matches the moment of action. The motion itself (texture
 *     overlay, growing fill, milestone dot strip, headline cross-fade)
 *     provides the "something magical is happening right now"
 *     affordance the card list otherwise lacks.
 *
 * The off-screen case — user navigated away from the originating page
 * before the run terminates — is handled by `RunStatusToastHost` at
 * the App root. It fires a terminal-status toast through the app's own
 * `toast` provider, so an admin on `/settings` when their run finishes
 * still hears about it.
 *
 * Design (redesign 2026-04-22 based on Gemini mockup):
 *   - Three stacked layers inside a pill- or card-shaped container:
 *       1. Background — subtle brand-tinted surface.
 *       2. Fill       — grows in width from 0→`progressPercent`, with a
 *                       texture overlay (see `texture` prop below) giving
 *                       the "live right now" feeling.
 *       3. Label      — pinned over the top: milestone icon + headline
 *                       + subtext + trailing percent / terminal glyph.
 *                       Re-keyed on the step so it cross-fades via
 *                       `animate-fade-in`.
 *   - A 2px strip of milestone-canon dots anchored at the bottom edge.
 *     Lights up dot-by-dot as `progressPercent` crosses each milestone's
 *     canonical percent. Intentionally low-opacity (`opacity-20`) — it's
 *     an ambient breadcrumb, not the primary progress indicator.
 *   - Two variants:
 *       * `"card"`     — 44px tall, attached to the bottom of a
 *                        CampaignCard as a pseudo-footer. Auto-collapses
 *                        ~4s after terminal to keep the card calm.
 *       * `"page"`     — full-width card with 20px padding and a rounded
 *                        container, for the campaign detail OverviewTab
 *                        header. Also renders the headline and subtext
 *                        at a larger size.
 *
 * Self-gating: returns `null` when no run is active OR the active run's
 * `campaignId` does not match this component's `campaignId` prop. That
 * lets every CampaignCard mount this unconditionally — the one matching
 * the running campaign lights up; the others stay quiet.
 *
 * Terminal states:
 *   - `succeeded` / `succeeded_with_warnings`: emerald-tinted frame with
 *     a check glyph, then collapses (variant `"card"`) after ~4s.
 *   - `failed` / `cancelled`: red-tinted frame with the warning icon;
 *     does NOT auto-collapse (failure deserves sticky feedback here too).
 *
 * Accessibility: the label is wrapped in an `aria-live="polite"` region
 * with stable outer node so screen readers announce milestone changes
 * without duplicating the drawer's own polite region. We set
 * `aria-hidden` on the fill, texture, and dot strip (pure decoration)
 * and expose semantic progress via `role="progressbar"` + `aria-valuenow`.
 *
 * Spec anchors: `specs/progress-stream.md` §8 (surfaces inventory — this
 * is the "inline on the originating card" surface), §9 (copy rules —
 * inherited via `milestoneHeadline`), §11 Q5 (a11y — `polite` live
 * region, never `assertive`).
 */
export interface CampaignRunProgressProps {
  /**
   * The campaign this strip belongs to. The strip self-gates on a match
   * against the active run's `campaignId` — parent cards can mount one
   * per campaign without worrying about which one is "live".
   */
  campaignId: string | number;
  /**
   * Visual density. `"card"` for the compact footer strip, `"page"` for
   * the hero-sized header strip. Defaults to `"card"` which is what
   * most call sites need.
   */
  variant?: "card" | "page";
  /**
   * Texture overlay played on top of the fill while the run is in flight.
   *
   *   - `"lines"` (default) — diagonal 45° stripes drifting left→right.
   *     Strongest "conveyor belt" affordance; best for surfaces where we
   *     want the motion to be noticed (detail header, Overview hero).
   *   - `"grid"` — radial-dot matrix drifting diagonally. Subtle; reads
   *     as "technical texture" rather than active motion.
   *   - `"flow"` — translucent brand-gradient sweep. The "classic"
   *     treatment used before the redesign; kept for parity.
   *   - `"pulse"` — soft opacity oscillation of a brand-500 tint. The
   *     most ambient option; good for low-traffic card-strip surfaces.
   *
   * All textures are pointer-events-none decorations and freeze on
   * terminal states (the fill switches to a flat emerald / red tint).
   */
  texture?: "lines" | "pulse" | "flow" | "grid";
  /**
   * Optional className for the outer container — lets parents tune
   * rounding / margin / border-integration (e.g. a CampaignCard needs
   * only the top corners rounded so the strip flushes into the card's
   * bottom edge).
   */
  className?: string;
  /**
   * When `true`, appends an "Expand" toggle below the strip that, when
   * activated, reveals a `RunTimeline` with every milestone of the
   * in-flight run. Only makes sense on the campaign detail page (not
   * on campaign cards — too much vertical space). Defaults to `false`.
   *
   * Auto-collapse: once the run reaches a terminal status, the expanded
   * timeline closes on its own after the same linger window as the
   * strip itself. The rationale: the strip's entire existence is as a
   * live-activity affordance, so the expanded timeline should share
   * its life cycle rather than stick around as a static receipt (the
   * `RunDetailPage` is where a static receipt lives).
   */
  expandable?: boolean;
}

/** Non-terminal statuses that keep the texture animation on. */
const IN_FLIGHT_STATUSES = new Set(["queued", "running", "awaiting_pull"]);

/**
 * Milliseconds to keep the success confirmation visible before the
 * component returns `null`. Picked empirically — long enough to read
 * "Post published" + the check icon, short enough not to crowd the
 * card while the user moves on. Does NOT apply to failure states
 * (those stay sticky; see docblock).
 */
const SUCCESS_LINGER_MS = 4_000;

/**
 * Canonical per-milestone percent thresholds used to light up the bottom
 * dot strip. Intentionally duplicated from the cloud's milestone catalog
 * — this is a *presentational* breakdown, not a source of truth for the
 * run's actual progress. If the cloud shifts a milestone's canonical
 * percent, update here too so the strip doesn't lie.
 *
 * Values mirror `MILESTONE_DEFAULTS` in `functions/src/runs/store.ts`.
 * Keeping them inline avoids a runtime dependency on the cloud catalog
 * in the client bundle, which is what the spec §9 calls out.
 *
 * `stock_check` is 5 (not the old 25) to match the cloud's low default:
 * on the sync fall-through it's an early "we checked" beat that must
 * stay under `research` (10). On the stock-served flow the cloud emits
 * the milestone at 85 via a percent override, which still clears this
 * threshold — so a single low value lights the dot correctly on both
 * flows. See the stock_check rationale in store.ts.
 */
const MILESTONE_THRESHOLDS: Record<string, number> = {
  queued: 2,
  stock_check: 5,
  research: 10,
  outlining: 22,
  drafting: 55,
  link_validation: 75,
  images: 88,
  assembling: 94,
  publishing: 98,
};

/**
 * Outer gate. Reads only the lightweight `useRuns()` context — no
 * TanStack Query call — so the component is safe to mount inside
 * isolated unit tests (e.g. CampaignCard specs) that don't wrap
 * renders in a `QueryClientProvider`. Only when there's actually an
 * active run for THIS campaign do we descend into the inner matcher,
 * which is where the poll hook lives. Without this split, CampaignCard
 * unit tests would have to either mount a QueryClientProvider
 * (unnecessary coupling to the progress feature) or the tests would
 * crash on `useQuery`'s "No QueryClient set" guard.
 *
 * Matching on `activeCampaignId` here (rather than in the inner
 * matcher against the cloud-returned `run.campaignId`) is what lets
 * us show a "Starting…" placeholder during the Action Scheduler
 * jitter window — the window where the run doc doesn't yet exist in
 * Firestore and every poll 404s.
 */
export const CampaignRunProgress = (props: CampaignRunProgressProps) => {
  const { activeRunId, activeCampaignId } = useRuns();
  if (!activeRunId) return null;
  if (activeCampaignId !== null && activeCampaignId !== props.campaignId) {
    return null;
  }
  return <CampaignRunProgressMatcher {...props} activeRunId={activeRunId} />;
};

/**
 * Inner component. By the time this mounts we already know there's an
 * active run, so firing up the 1s poll via `useCampaignRunQuery` is
 * warranted. All the gating that depends on *which* campaign the run
 * is for — and all the visual rendering — lives here.
 */
const CampaignRunProgressMatcher = ({
  campaignId,
  variant = "card",
  texture = "lines",
  className,
  expandable = false,
  activeRunId,
}: CampaignRunProgressProps & { activeRunId: string }) => {
  const { data } = useCampaignRunQuery(activeRunId);

  // Terminal-success linger: once the run succeeds we keep the strip
  // alive for SUCCESS_LINGER_MS so the user registers "done ✓" on the
  // originating surface, then collapse.
  const [lingerExpired, setLingerExpired] = useState(false);
  // Expand state for the optional timeline reveal. Defaults to collapsed
  // so the Overview hero stays calm unless the user actually asks for
  // "more detail". Auto-collapsed back when a run terminates (see effect
  // below) — an expanded static timeline would overlap with
  // `RunDetailPage`'s responsibility as the canonical receipt.
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const runStatus = data?.run?.status ?? null;
  const runIdKey = data?.run?.runId ?? null;
  useEffect(() => {
    if (runStatus !== "succeeded" && runStatus !== "succeeded_with_warnings") {
      // Reset on any non-terminal-success transition so a new run in
      // the same session re-arms the timer.
      setLingerExpired(false);
      return;
    }
    const t = window.setTimeout(() => setLingerExpired(true), SUCCESS_LINGER_MS);
    return () => window.clearTimeout(t);
  }, [runStatus, runIdKey]);

  // Auto-collapse the timeline reveal on terminal statuses. The strip
  // itself lingers (success) or stays sticky (failure); the expanded
  // timeline should close so the surface reverts to the compact state
  // before the strip eventually goes away.
  useEffect(() => {
    if (
      runStatus === "succeeded" ||
      runStatus === "succeeded_with_warnings" ||
      runStatus === "failed" ||
      runStatus === "cancelled"
    ) {
      setTimelineExpanded(false);
    }
  }, [runStatus, runIdKey]);

  // Auto-dismiss `activeRunId` from RunsContext when the run reaches a
  // SUCCESS terminal status + the linger window expires. Without this
  // CampaignViewPage's "Stop Run" / "Run Now" toggle button — gated on
  // `activeRunId` — stayed stuck on "Stop Run" forever after a successful
  // run, and the user couldn't trigger a follow-up Run Now without first
  // clicking Stop Run (which would no-op against an already-terminal run).
  //
  // Failed / cancelled runs intentionally do NOT dismiss here. Spec:
  // "failure deserves persistent feedback on the originating card until
  // the user visits the run detail" (pinned by
  // `CampaignRunProgress.test.tsx` "renders terminal-failure copy and
  // does NOT auto-collapse"). The Stop Run button staying visible on a
  // failed run is a known UX wart that needs a different fix — likely
  // a separate `inFlightRunId` context value or a retry-aware button —
  // tracked as a follow-up.
  const { dismiss } = useRuns();
  useEffect(() => {
    if (
      (runStatus === "succeeded" || runStatus === "succeeded_with_warnings") &&
      lingerExpired
    ) {
      dismiss();
    }
  }, [runStatus, lingerExpired, dismiss]);

  // Tier feeds the dot-strip + (transitively) the timeline so Free /
  // None installs don't see milestones the cloud's pipeline skips for
  // their tier (research, link_validation). See
  // `milestoneOrderForFlowAndTier` for the gate's rationale.
  const { isPaidLicense } = useLicense();

  const run = data?.run;
  if (!run) {
    // Pre-first-poll state. See `StartingStrip` below for why.
    return (
      <StartingStrip variant={variant} texture={texture} className={className} />
    );
  }
  if (run.campaignId !== campaignId) return null;
  if (runStatus === "succeeded" && lingerExpired) return null;

  const isPage = variant === "page";
  const isSuccess =
    runStatus === "succeeded" || runStatus === "succeeded_with_warnings";
  const isFailure = runStatus === "failed" || runStatus === "cancelled";
  const isInFlight = IN_FLIGHT_STATUSES.has(runStatus ?? "");
  // Webhook-delivery fallback: the cloud finished but couldn't reach the site
  // directly, so the post is being delivered via the backup pull path. Its
  // cloud-written headline is an English default (see store.ts), so we localize
  // it here rather than letting the milestone copy ("Publishing…") show.
  const isAwaitingPull = runStatus === "awaiting_pull";

  const percent = Math.max(0, Math.min(100, Math.round(run.progressPercent)));

  // Icon in the headline row. On terminal states we substitute the check
  // / warning glyph so the icon itself reads as the receipt.
  const StepIcon = isSuccess
    ? CheckCircle2
    : isFailure
      ? AlertTriangle
      : milestoneIcon(run.currentStep);

  // Label copy: the cloud always writes its English-default `headline`
  // from `MILESTONE_DEFAULTS` in `functions/src/runs/store.ts`, which
  // bypasses @wordpress/i18n entirely — so a German install was seeing
  // "Writing the draft" instead of "Den Entwurf schreiben". Use the
  // SPA's localised mapping as the canonical source; fall through to
  // `run.headline` only when the SPA doesn't know the milestone id
  // (forward-compat: cloud emits a new milestone before the bundle
  // ships copy for it).
  const label = isSuccess
    ? __("Post published", "structura")
    : isFailure
      ? __("Generation stopped", "structura")
      : isAwaitingPull
        ? __("Delivering via a backup method", "structura")
        : milestoneHeadline(run.currentStep) || run.headline;

  // Subtext only in-flight — terminal subtexts are carried by the
  // dedicated toast / receipt surfaces. Same localisation story as
  // `label`: prefer the SPA mapping, fall through to the cloud's
  // English default when we don't have a translated subtext for this
  // milestone yet.
  const subtext =
    !isSuccess && !isFailure
      ? isAwaitingPull
        ? __(
            "Your site blocked direct delivery, so we're delivering this post another way. It may take a few minutes.",
            "structura",
          )
        : milestoneSubtext(run.currentStep) ?? run.subtext
      : undefined;

  // Trailing metric on the right side. Percent while in flight; no glyph
  // needed on terminal because the headline icon already reads as one.
  const trailing = isInFlight ? (
    <span
      className={cn(
        "font-black tabular-nums",
        isPage
          ? "text-[13px] text-brand-700 dark:text-brand-400"
          : "text-xs text-brand-700 dark:text-brand-400",
      )}
    >
      {percent}%
    </span>
  ) : null;

  // Fill background — brand tint in flight, emerald on success, red on
  // failure. Values intentionally low-opacity so the texture overlay
  // still reads on top of them.
  const fillBackground = isFailure
    ? "rgba(239, 68, 68, 0.08)"
    : isSuccess
      ? "rgba(16, 185, 129, 0.08)"
      : "rgba(99, 102, 241, 0.06)";

  const fillBorderColor = isFailure
    ? "rgba(239, 68, 68, 0.2)"
    : isSuccess
      ? "rgba(16, 185, 129, 0.2)"
      : "rgba(99, 102, 241, 0.25)";

  const strip = (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden transition-all duration-500",
        isPage
          ? "h-auto rounded-xl border border-neutral-300/50 bg-white p-5 shadow-sm dark:border-neutral-800/40 dark:bg-neutral-900"
          : "h-11 border-t border-neutral-200/60 bg-neutral-50/40 dark:border-neutral-800/40 dark:bg-neutral-950",
        // When expandable + expanded, the strip's rounded bottom merges
        // into the reveal panel below. Killing the bottom rounding here
        // makes the transition read as "one continuous surface".
        expandable && timelineExpanded && isPage && "rounded-b-none",
        !expandable && className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={__("Campaign run progress", "structura")}
    >
      {/* Fill layer — width transitions driven by `percent`. Right border
          traces the leading edge of the fill while in-flight, matching the
          Gemini mockup's "current position" affordance. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 z-10 transition-[width] duration-700 ease-out",
          !isSuccess && !isFailure && "border-r",
        )}
        style={{
          width: isSuccess || isFailure ? "100%" : `${percent}%`,
          background: fillBackground,
          borderColor: fillBorderColor,
        }}
      >
        {/* Texture overlay — only while in-flight. Pointer-events-none so
            it never intercepts the card's click target. */}
        {isInFlight && <TextureOverlay texture={texture} />}
      </div>

      {/* Milestone-canon dot strip. Low opacity (ambient breadcrumb) —
          the primary progress indicator is still the fill width.
          Picks the per-flow step set so stock-served runs render three
          dots (queued / stock_check / publishing) instead of eight. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-0.5 gap-0.5 px-0.5 opacity-20"
      >
        {milestoneOrderForFlowAndTier(run.flow, !!isPaidLicense).map((step) => {
          const threshold = MILESTONE_THRESHOLDS[step] ?? 0;
          const isPassed = isSuccess || percent >= threshold;
          return (
            <div
              key={step}
              className={cn(
                "h-full flex-1 transition-all duration-1000",
                isPassed
                  ? "bg-brand-500"
                  : "bg-neutral-300 dark:bg-neutral-700",
              )}
            />
          );
        })}
      </div>

      {/* Label layer — pinned foreground. The outer wrapper is the
          `aria-live` region and stays mounted across milestone changes
          (stable identity so assistive tech registers updates instead
          of treating each as a new region). The inner nodes are keyed on
          the step so they remount + re-fire `animate-fade-in`. Spec §11 Q5. */}
      <div
        className={cn(
          "relative z-30 flex h-full items-center justify-between gap-3",
          isPage ? "" : "px-4",
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <StepIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-colors duration-500",
                isInFlight
                  ? "text-brand-500/70 dark:text-brand-400/70"
                  : isSuccess
                    ? "text-emerald-600 dark:text-emerald-500"
                    : "text-red-600 dark:text-red-500",
              )}
              aria-hidden
            />
            <h4
              key={`crp-label-${run.currentStep}-${runStatus}`}
              className={cn(
                "m-0! animate-fade-in truncate font-bold leading-tight tracking-tight",
                isPage ? "text-base" : "text-[12.5px]",
                isFailure
                  ? "text-red-900 dark:text-red-300"
                  : isSuccess
                    ? "text-emerald-900 dark:text-emerald-300"
                    : "text-neutral-900 dark:text-neutral-100",
              )}
            >
              {label}
            </h4>
          </div>
          {subtext && (
            <p
              key={`crp-subtext-${subtext}`}
              className={cn(
                "m-0! mt-0.5 animate-fade-in truncate font-medium",
                // Dimmed per 2026-04-23 review: the subtext is ambient
                // context ("Writing section 2 of 4"), not information the
                // eye needs to race to. Keeping it the same weight as the
                // headline made the strip feel busy; dropping one neutral
                // step down restores the hierarchy the Gemini mockup
                // intended.
                isPage
                  ? "text-sm text-neutral-500 dark:text-neutral-400"
                  : "hidden text-[11px] text-neutral-500 sm:block dark:text-neutral-400",
              )}
            >
              {subtext}
            </p>
          )}
        </div>
        {trailing && (
          <div className="flex shrink-0 items-center gap-3">
            {trailing}
            {/* Expandability affordance — only on the interactive variant.
                Always-visible chevron signals "there's more here"; the
                hover chip (rendered as a sibling of the strip below, so
                it can escape the strip's `overflow-hidden`) explains the
                interaction in words. Rotates on expand so the glyph
                itself reads as open/closed. */}
            {expandable && isPage && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-300 dark:text-neutral-500",
                  timelineExpanded && "rotate-180",
                )}
                aria-hidden
              />
            )}
          </div>
        )}
      </div>
    </div>
  );

  // No expand feature — the strip IS the whole thing. Return it straight.
  if (!expandable) return strip;

  // Expandable mode — only offered on the page variant. The strip ITSELF
  // is the click target (wrapped in a `<button>`) — the old separate
  // "SHOW ALL STEPS" row below the bar was visual noise once the strip
  // got its own texture + chevron affordances. The reveal panel opens
  // beneath with merged rounding so the whole stack reads as a single
  // continuous surface. Only rendered on the page variant because the
  // card variant has no room to grow into.
  //
  // Accessibility: the `<button>` owns the disclosure semantics
  // (`aria-expanded` + `aria-controls`), while the inner strip retains
  // `role="progressbar"` for progress semantics. A heading inside a
  // button is allowed by HTML (phrasing-content restriction applies to
  // interactive descendants, not headings), and screen readers announce
  // both the button label and the progress value on focus.
  const toggleLabel = timelineExpanded
    ? __("Hide steps", "structura")
    : __("Show all steps", "structura");
  return (
    <div className={cn("space-y-0", className)}>
      <button
        type="button"
        onClick={() => setTimelineExpanded((v) => !v)}
        aria-expanded={timelineExpanded}
        aria-controls="crp-timeline-reveal"
        aria-label={toggleLabel}
        className={cn(
          "group relative block w-full rounded-xl text-left transition-all duration-200",
          // Subtle visual affordance: on hover the whole card lifts its
          // shadow a touch and the border reads slightly warmer. Cursor
          // pointer reinforces clickability the moment the user's mouse
          // enters the bar.
          "cursor-pointer hover:shadow-md",
          // Keyboard focus ring — required per a11y spec since the
          // clickable surface is large and has no other focus treatment.
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950",
          // Kill bottom rounding when expanded so the strip merges
          // visually into the reveal panel below.
          timelineExpanded && "rounded-b-none",
        )}
      >
        {strip}
        {/* Hover-reveal hint chip — floats just above the bar's top edge,
            centered horizontally, so it hovers over nothing important.
            Rendered here (sibling of `{strip}`, inside the button) rather
            than inside the strip because the strip's `overflow-hidden`
            would clip it. `pointer-events-none` so mouseover the chip
            itself doesn't interfere with the button's click semantics.
            Always present in the DOM (so the copy is in `textContent`
            for assistive tech + tests); opacity-driven reveal. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1",
            "bg-neutral-900 text-[11px] font-semibold tracking-wide text-white shadow-lg",
            "opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100",
            "group-hover:-translate-y-0 group-focus-visible:-translate-y-0",
            "dark:bg-neutral-50 dark:text-neutral-900",
          )}
        >
          {timelineExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden />
              {__("Hide steps", "structura")}
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden />
              {__("Show all steps", "structura")}
            </>
          )}
        </div>
      </button>
      {/* Reveal panel. Collapsed: the wrapper is entirely removed — an
          always-rendered container was leaving a ~2px sliver of
          border+shadow underneath the bar even at `max-h-0`. Rendering
          conditionally means no stray chrome in the collapsed state;
          the trade-off is losing the max-height slide-in animation, but
          the content itself still fades in via `animate-fade-in` on its
          descendant rows. */}
      {timelineExpanded && (
        <div
          id="crp-timeline-reveal"
          className={cn(
            "overflow-hidden rounded-b-xl border border-t-0 border-neutral-300/50 bg-white shadow-sm dark:border-neutral-800/40 dark:bg-neutral-900",
            "animate-fade-in",
          )}
        >
          <div className="border-t border-neutral-200/60 px-5 pt-5 pb-5 dark:border-neutral-800/60">
            <RunTimeline run={run} density="compact" withCard={false} />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Texture overlay dispatched off the `texture` prop. Each branch is a
 * single absolutely-positioned layer that piggybacks on a CSS keyframe
 * declared in `packages/tailwind-config/theme.css`. See that file for
 * the motivation behind each keyframe's period / easing.
 *
 * Why a component rather than an inline switch: extracting it keeps the
 * main render flat and makes it trivial to assert-by-role in tests
 * (`data-testid` probes per branch below).
 */
const TextureOverlay = ({
  texture,
}: {
  texture: "lines" | "pulse" | "flow" | "grid";
}) => {
  switch (texture) {
    case "grid":
      return (
        <div
          data-testid="crp-texture-grid"
          className="animate-progress-grid absolute inset-0 opacity-[0.1] dark:opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(#6366f1 1px, transparent 0)",
            backgroundSize: "8px 8px",
          }}
        />
      );
    case "pulse":
      return (
        <div
          data-testid="crp-texture-pulse"
          className="animate-pulse-subtle absolute inset-0 bg-brand-500/10"
        />
      );
    case "flow":
      return (
        <div
          data-testid="crp-texture-flow"
          className="animate-progress-flow absolute inset-0 opacity-20"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.3) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      );
    case "lines":
    default:
      return (
        <div
          data-testid="crp-texture-lines"
          className="animate-progress-lines absolute inset-0 opacity-[0.08] dark:opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #6366f1 25%, transparent 25%, transparent 50%, #6366f1 50%, #6366f1 75%, transparent 75%, transparent)",
            backgroundSize: "32px 32px",
          }}
        />
      );
  }
};

/**
 * Placeholder strip rendered during the AS-jitter window before the
 * first poll lands. Same visual shell as the in-flight variant but
 * with a tiny indeterminate fill (4% rather than a measured width) so
 * the user sees "yes, this kicked off" without the bar pretending to
 * measure real progress it can't yet know.
 *
 * Honors the same `texture` prop as the real strip so the visual
 * language stays consistent as the first poll transitions us over.
 */
const StartingStrip = ({
  variant = "card",
  texture = "lines",
  className,
}: {
  variant?: "card" | "page";
  texture?: "lines" | "pulse" | "flow" | "grid";
  className?: string;
}) => {
  const isPage = variant === "page";
  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden",
        isPage
          ? "h-auto rounded-xl border border-neutral-300/50 bg-white p-5 shadow-sm dark:border-neutral-800/40 dark:bg-neutral-900"
          : "h-11 border-t border-neutral-200/60 bg-neutral-50/40 dark:border-neutral-800/40 dark:bg-neutral-950",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-label={__("Campaign run starting", "structura")}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 z-10 border-r transition-[width] duration-700 ease-out"
        style={{
          width: "4%",
          background: "rgba(99, 102, 241, 0.06)",
          borderColor: "rgba(99, 102, 241, 0.25)",
        }}
      >
        <TextureOverlay texture={texture} />
      </div>
      <div
        className={cn(
          "relative z-30 flex h-full items-center justify-between gap-3",
          isPage ? "" : "px-4",
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        <p
          className={cn(
            "m-0! animate-fade-in truncate font-bold tracking-tight text-neutral-900 dark:text-neutral-100",
            isPage ? "text-base" : "text-[12.5px]",
          )}
        >
          {__("Connecting to cloud — first run can take up to 30 seconds…", "structura")}
        </p>
      </div>
    </div>
  );
};
