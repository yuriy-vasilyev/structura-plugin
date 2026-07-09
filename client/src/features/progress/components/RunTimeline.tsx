import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@structura/ui";
import type { Milestone, RunStatusSerialized } from "@structura/types";
import { useLicense } from "@/features/settings";
import {
  milestoneHeadline,
  milestoneIcon,
  milestoneOrderForFlowAndTier,
  milestoneSubtext,
  resolveRunPostStatus,
} from "../milestones";
import { formatDuration } from "../formatDuration";

/**
 * Vertical milestone timeline used on two surfaces:
 *
 *   1. `RunDetailPage` — the "Process Timeline" section of the per-run
 *      receipt. Full fidelity: every milestone row visible, duration
 *      chips, error message inline on the failing step.
 *   2. `CampaignViewPage.OverviewTab` — expanded underneath the compact
 *      `CampaignRunProgress` strip, as an opt-in "bigger picture" view
 *      for site owners who want to watch the steps go by rather than
 *      just a percentage. Same component, same data source.
 *
 * Why extract this rather than inline it in RunDetailPage: the second
 * surface (Overview expand) needs identical animation behavior to the
 * first — the animated brand-gradient connector line, the active-step
 * highlight box, the duration chips — and duplicating the render would
 * be how those two surfaces quietly drift apart over a few sprints.
 * Gemini's mockup was already a "same component twice" arrangement in
 * spirit; this commit makes it literal.
 *
 * Design (from 2026-04-22 Gemini redesign):
 *   - 2px vertical rail on the left, with an absolutely-positioned
 *     animated overlay that grows top→down as milestones complete.
 *     Emerald on success, brand on in-flight, no overlay on failure
 *     (so the X icon reads unambiguously as the stopping point).
 *   - 36px circular icon "avatar" per milestone. In flight: brand-tinted
 *     ring + milestone icon. Done: emerald ring + check. Failed: red
 *     ring + milestone icon (not a generic X — the icon identifies
 *     *which* step broke so support can read the timeline at a glance).
 *     Not reached: muted neutral.
 *   - Headline text (bold) + subtext line only on the active step, the
 *     failed step (shows error userMessage inline), and the active step
 *     gets a subtle `bg-brand-50/30` highlight box so the viewer's eye
 *     lands on it immediately.
 *   - Per-step duration chip on the right — tabular-nums monospaced,
 *     only shown when `stepDurationsMs[milestone]` is present. Integer
 *     seconds because the chip's job is "roughly how long" not "precise
 *     telemetry" (the Technical Inspector accordion is for the latter).
 *
 * Accessibility: the stepper is an ordered list (`<ol>`) so assistive
 * tech can navigate milestone-by-milestone. Icons are aria-hidden —
 * the text label + duration carry the semantic payload. The animated
 * connector has `aria-hidden` because it's pure decoration.
 *
 * Spec anchor: `specs/run-detail-view.md` §5.3 (Timeline section).
 */
export interface RunTimelineProps {
  /** The run whose milestones to visualise. */
  run: RunStatusSerialized;
  /**
   * Visual density. Defaults to `"standard"`. `"compact"` trims vertical
   * padding, duration chip size, and row gap so the timeline fits more
   * comfortably under the OverviewTab's progress strip where vertical
   * space is shared with the rest of the Overview content.
   */
  density?: "standard" | "compact";
  /**
   * Optional className applied to the outer container. Use this to
   * override padding / rounding when embedding in a non-Card surface.
   */
  className?: string;
  /**
   * When `true`, wraps the stepper in a "Process Timeline" card with
   * the uppercase micro-label header. When `false`, renders the
   * stepper naked so a caller can slot it inside its own section. The
   * RunDetailPage uses the wrapped version; the Overview expand uses
   * the naked one to avoid a card-inside-a-card effect.
   *
   * Defaults to `true`.
   */
  withCard?: boolean;
}

/**
 * Render state a single milestone row resolves to.
 *
 *  - `done`        — step succeeded; show emerald check.
 *  - `skipped`     — terminal-success run, but this step never executed
 *                    (no entry in `stepDurationsMs`). Happens when the
 *                    dispatcher consumed a pre-generated stock draft and
 *                    bypassed research / drafting / etc., or when the
 *                    cloud short-circuited a step that produced no
 *                    user-visible work. Renders muted with a "Skipped"
 *                    chip — same lane as `tier_locked` visually, but
 *                    semantically "didn't need to run" rather than
 *                    "needs upgrade to run." Counts toward the fill
 *                    line height (the run did reach this position).
 *  - `active`      — step is currently in flight on a non-terminal run.
 *  - `failed`      — the step the run died on (only one in a run).
 *  - `cancelled`   — the step the run was cancelled on (manual stop).
 *                    Visually distinct from both `done` and `failed`:
 *                    the user stopped this step on purpose, it didn't
 *                    error and it didn't complete. Steps BEFORE the
 *                    cancellation still render as `done` (they really
 *                    did finish); steps AFTER render as `not_reached`.
 *  - `not_reached` — the step never started (run terminated before it).
 *  - `tier_locked` — the step was structurally inapplicable to this
 *                    run because of tier (None/Free) or single-post
 *                    flow. Renders with a muted icon + a tier badge
 *                    ("Pro" / "Free License") so the timeline stays
 *                    fully visible without misrepresenting which
 *                    steps actually ran. Does NOT participate in the
 *                    fill-line height calculation.
 */
type TimelineState =
  | "done"
  | "skipped"
  | "active"
  | "failed"
  | "cancelled"
  // Terminal-success run where THIS step (currently only `channels`) completed
  // with a non-fatal degradation — e.g. the post published but a channel
  // dispatch failed (X out of credits). Amber, with the failure named inline.
  | "warning"
  | "not_reached"
  | "tier_locked";

/**
 * Milestones whose absence from `stepDurationsMs` does NOT mean
 * "skipped" — these are bookkeeping slots the cloud may or may not
 * stamp depending on how a particular run was launched.
 *
 *   - `queued` — the priming write happens synchronously in the
 *     dispatcher; the duration write happens on the next milestone
 *     transition. Older cloud builds occasionally landed a successful
 *     run with no `queued` duration recorded. Showing "Skipped" on
 *     the very first row of a green run is misleading.
 *
 *   - `publishing` — terminal-success implies publishing finished by
 *     construction, regardless of whether the duration field landed
 *     (some terminal writes batched the duration into the same patch
 *     as `succeed`, so older docs have it missing).
 */
const SKIP_INFERENCE_EXEMPT: Set<Milestone> = new Set(["queued", "publishing"]);

/** Map an image-slot milestone to its `outputs.imageFailures` slot key. */
const IMAGE_MILESTONE_SLOT: Partial<Record<Milestone, "featured" | "body">> = {
  image_featured: "featured",
  image_body: "body",
};

/**
 * `true` when this image-slot milestone failed at the provider (recorded in
 * `outputs.imageFailures`). The slot still "ran" — it has a `stepDurationsMs`
 * entry (the provider call returned an error in ~200ms) — so without this the
 * row would render a false green check even though the post published with no
 * visuals. Mirrors the `channels` warning branch in `stateFor`.
 */
function imageSlotFailed(
  run: RunStatusSerialized,
  milestone: Milestone,
): boolean {
  const slot = IMAGE_MILESTONE_SLOT[milestone];
  if (!slot) return false;
  return (run.outputs?.imageFailures ?? []).some((f) => f.slot === slot);
}

// `channels` is deliberately NOT in the exempt set: when the dispatcher
// fired and patched the run doc we see `channelsResolvedCount` and the
// row renders as `done` with a count chip. When the field is absent on
// a terminal-success run, the dispatcher either didn't run, was
// rejected, or its write hasn't landed — every one of those is more
// honestly represented as "Skipped" than as a green check that implies
// fan-out we have no evidence of. (Yurii feedback 2026-05-20 —
// "Sharing to channels" was showing ✓ even when nothing posted to
// LinkedIn and the cloud logs were empty.)

/**
 * Tier badges shown next to a `tier_locked` row. Shape matches the
 * other "this needs an upgrade" surfaces in the SPA (`<LockedFeature>`
 * on the Generate / Wizard pages): "Free License" for features any
 * licensed install gets, "Pro" for paid-only features.
 */
const TIER_LOCK_LABELS: Partial<Record<Milestone, string>> = {
  // Pre-generation only runs for scheduled campaigns; campaigns are
  // a Free-License-and-up feature, but the more honest framing on a
  // single-post run is "this is what you'd get with a Pro/scheduled
  // setup," matching the Yurii copy direction (2026-05-10).
  stock_check: "Pro",
  // Featured images unlock at Free License; body images unlock at
  // Pro. The single badge has to pick one — Free License is the
  // strictly accurate floor (the more-restrictive Pro requirement
  // for body images shows on the GeneratePostPage block toggles).
  //
  // Legacy `images` retained for archived runs; new per-slot
  // milestones below carry their own floor. Featured image is the
  // Free License floor; body image is the Pro floor.
  images: "Free License",
  image_featured: "Free License",
  image_body: "Pro",
  // The `link_validation` server-side rule lives in the BYOK / Cloud /
  // Cloud Pro `ALWAYS_ON_RULES_BY_TIER` lists — Free + None never
  // run it. Pro is the floor.
  link_validation: "Pro",
  // Channels (the Integrations Store) is a paid-tier feature — the
  // cloud's `requireChannelsEntitlement` gate rejects Free / None
  // calls outright. Showing the locked chip on these tiers
  // doubles as the upgrade-path teaser.
  channels: "Pro",
};

/**
 * Determine which milestones structurally won't run for this specific
 * run — either because the chosen flow doesn't include the step
 * (`stock_check` on single-post) or because the user didn't opt into
 * the corresponding feature (no images requested, no link rules on).
 *
 * Inputs come off the run doc itself rather than the live license
 * tier — by the time someone re-opens an old run page, their tier
 * may have changed but the run's pipeline is frozen in time. The
 * snapshot (`isEphemeral`, `inputSnapshot.structure.*`) is the source
 * of truth for "what this run was asked to do".
 *
 * The caller decides what to do with the returned set: on Free / None
 * tiers, render the rows as `tier_locked` with a "Pro" / "Free
 * License" badge so the upgrade path is visible; on paid tiers
 * (Pro / Cloud / Cloud Pro / Cloud Agency) filter the rows out of the
 * visible order entirely so the user doesn't see a "PRO" badge on a
 * feature they already pay for (Yurii feedback 2026-05-19).
 */
function resolveInapplicableMilestones(
  run: RunStatusSerialized,
  isPaidLicense: boolean,
  isLicensed: boolean,
): {
  /**
   * Rows that are filtered on paid tiers (so paying users don't see a
   * "Pro" chip on a feature they already have) and rendered as
   * tier-locked on Free / None (with a "Pro" / "Free License" chip as
   * an upgrade-path teaser). Same conflated semantic the original
   * `inapplicable` set had; renamed to reflect that the renderer
   * applies tier-aware behavior.
   */
  tierConditional: Set<Milestone>;
  /**
   * Rows that are filtered on EVERY tier regardless of license. Use
   * this for cases where the user explicitly disabled a feature they
   * could otherwise access — e.g. a Free-tier user toggling featured
   * images off. Free has access to featured images, so the row
   * shouldn't render as tier-locked just because they chose not to
   * use it; it should disappear, same as on paid tiers (cms.xerx.io
   * 2026-05-22 feedback).
   */
  alwaysFiltered: Set<Milestone>;
} {
  const tierConditional = new Set<Milestone>();
  const alwaysFiltered = new Set<Milestone>();

  // Single-post flow — pre-generation is a campaign concept; the
  // single-post path never consumes from a stock buffer.
  // `isEphemeral` is the explicit signal (post-PR8); fall back to
  // `campaignId === 0` for older docs that pre-date the field.
  const isSinglePost =
    run.isEphemeral === true || run.campaignId === 0 || run.campaignId === "";
  if (isSinglePost) {
    tierConditional.add("stock_check");
  }

  // Image generation rows — per-slot tier-capability matrix
  // (cms.xerx.io 2026-05-22 feedback):
  //
  //   | Tier | image_featured             | image_body              |
  //   |------|----------------------------|-------------------------|
  //   | None | tier-lock "Free License"   | tier-lock "Pro"         |
  //   | Free | filter when disabled       | tier-lock "Pro"         |
  //   | Paid | filter when disabled       | filter when disabled    |
  //
  // None tier can't run featured (Free License floor) OR body
  // (Pro floor); both are tier-conditional → tier-locked on None.
  //
  // Free tier CAN run featured but can't run body; featured is
  // filtered when the user explicitly disabled it (paid behavior),
  // body is tier-locked.
  //
  // Paid tier CAN run both; either is filtered when explicitly
  // disabled in the campaign / single-post structure flags.
  const isNone = !isLicensed;
  const snapshot = run.inputSnapshot as
    | {
        structure?: { featuredImage?: boolean; bodyImages?: boolean };
        intelligence?: { seoRules?: Record<string, boolean> };
      }
    | undefined;
  const featuredField = snapshot?.structure?.featuredImage;
  const bodyField = snapshot?.structure?.bodyImages;

  if (isNone) {
    // None: both slots tier-locked (no access at this tier).
    tierConditional.add("image_featured");
    tierConditional.add("image_body");
  } else if (!isPaidLicense) {
    // Free: body is Pro-only → tier-locked.
    tierConditional.add("image_body");
    // Featured is available at Free License — filter when disabled
    // so a user who chose not to use it doesn't see an upgrade
    // chip for a feature they already have. Otherwise leave it on
    // the timeline so the cloud's stamped duration renders.
    if (featuredField === false) {
      alwaysFiltered.add("image_featured");
    }
  } else {
    // Paid: both available — filter each when explicitly disabled.
    if (featuredField === false) {
      alwaysFiltered.add("image_featured");
    }
    if (bodyField === false) {
      alwaysFiltered.add("image_body");
    }
  }

  // Legacy `images` milestone — stamped by pre-2026-05-22 runs only.
  // New runs use the per-slot pair above. Filter on every tier so
  // the row doesn't appear; old archived runs still resolve their
  // headline + duration chip through `MILESTONE_HEADLINES.images`
  // when the SPA's run-detail surface pulls them by id.
  alwaysFiltered.add("images");

  // Link validation is in the always-on rule set for BYOK / Cloud /
  // Cloud Pro / Cloud Agency tiers — on paid tiers, the step WILL
  // run regardless of the user's seoRules toggles, so it isn't
  // structurally inapplicable. On Free / None, the cloud doesn't
  // stamp `tracker.milestone("link_validation")` unless a
  // user-toggleable structural-link rule was on; absent that, the
  // step is a no-op and should show as tier-locked.
  if (!isPaidLicense) {
    const linkRulesOn =
      snapshot?.intelligence?.seoRules?.outbound_link_authority === true ||
      snapshot?.intelligence?.seoRules?.internal_link_optimization === true;
    const linkValidationRecorded = run.stepDurationsMs?.link_validation != null;
    if (!linkValidationRecorded && !linkRulesOn) {
      tierConditional.add("link_validation");
    }
    // Channels is paid-tier only (cloud's `requireChannelsEntitlement`
    // gates the dispatcher endpoint). On Free / None we keep the slot
    // visible and tier-locked so the upgrade path is signposted; on
    // paid tiers we leave it un-flagged so the row renders normally
    // and the dispatcher's `channelsResolvedCount` patch can populate
    // the chip.
    tierConditional.add("channels");
  }

  return { tierConditional, alwaysFiltered };
}

/**
 * Resolve which milestone index the timeline should treat as
 * "current" for rendering purposes.
 *
 * On a healthy run this is mostly `milestoneOrder.indexOf(run.currentStep)`,
 * but TWO classes of run leave `currentStep` outside the visible order
 * and need the same inference fallback so the timeline doesn't
 * collapse to "every row not-reached":
 *
 *   - FAILED runs — `currentStep` is the `"error"` sentinel, which
 *     isn't in any milestone-order list.
 *
 *   - IN-FLIGHT runs whose current step was filtered out of the
 *     visible order. The paid-tier branch of the dispatcher hides
 *     `images` when the campaign didn't request any images
 *     (`inputSnapshot.structure.featuredImage === false &&
 *      inputSnapshot.structure.bodyImages === false`) — but the
 *     cloud's `LiveProgressTracker` still transits through the
 *     `images` milestone on every run. The SPA used to render every
 *     row as `not_reached` for that window (cms.xerx.io
 *     2026-05-21 — every step greyed out while the header read
 *     "Generating images 88%"). Same fix as the failed case: walk
 *     `stepDurationsMs` back-to-front and use the highest-index
 *     stamped milestone as the current cursor.
 *
 * Resolution order:
 *
 *   1. `milestoneOrder.indexOf(run.currentStep)` when it returns
 *      a valid index — the common case.
 *   2. `run.failedAtStep` (failed runs only) — explicit signal
 *      from post-2026-05-02 cloud builds.
 *   3. Highest-index milestone present in `stepDurationsMs` —
 *      inference shared by failed runs and filtered-out-step
 *      in-flight runs.
 *   4. -1 (`not_reached`) — only when every signal is absent.
 */
function resolveCurrentIndexForRender(
  run: RunStatusSerialized,
  milestoneOrder: Milestone[],
): number {
  const direct = milestoneOrder.indexOf(run.currentStep);
  if (direct !== -1) return direct;

  // Failed runs prefer the explicit failedAtStep signal when present
  // — it's the only branch where the cloud knows specifically which
  // milestone died, independent of any stamped duration.
  if (run.status === "failed" && run.failedAtStep) {
    const explicit = milestoneOrder.indexOf(run.failedAtStep);
    if (explicit !== -1) return explicit;
  }

  // Inference shared by failed runs and "current step was filtered
  // out of the visible order" in-flight runs. The cloud's
  // `tracker.milestone()` and `tracker.fail()` both stamp the
  // step's elapsed time BEFORE flipping `currentStep`, so the
  // highest-index stamped key is the closest visible step to the
  // run's actual position.
  const durations = run.stepDurationsMs ?? {};
  for (let i = milestoneOrder.length - 1; i >= 0; i -= 1) {
    if (durations[milestoneOrder[i]] != null) {
      // For FAILED runs, the highest stamped step IS the failure
      // step — `tracker.fail()` writes the duration before flipping
      // `currentStep` to "error". Return the index as-is so the row
      // renders with the failure icon + error message.
      if (run.status === "failed") return i;
      // For non-failed in-flight runs (the "current step was filtered"
      // case), the highest stamped step has ALREADY finished. Advance
      // the cursor by 1 — clamped to length - 1 so we never overshoot
      // — so the "active" highlight lands on the next visible step
      // instead of decorating a step that's actually done.
      return Math.min(milestoneOrder.length - 1, i + 1);
    }
  }

  // Genuinely unparseable — preserve legacy behaviour.
  return -1;
}

/** Compute the render state for a given milestone index. */
function stateFor(
  index: number,
  currentIndex: number,
  run: RunStatusSerialized,
  milestoneOrder: Milestone[],
  tierLocked: Set<Milestone>,
): TimelineState {
  const milestone = milestoneOrder[index];

  // Tier-locked rows always render as locked, regardless of the run's
  // overall status — a successful run on Pro doesn't suddenly turn a
  // None-tier-locked chip into a green check. This early return also
  // means a `done`-flooded terminal-success run skips writing checks
  // onto rows that never participated.
  if (tierLocked.has(milestone)) return "tier_locked";

  // Terminal-failed and terminal-cancelled both freeze progression at
  // `currentStep`. The step at currentIndex is rendered with the
  // matching state; everything before it is `done`; everything after
  // is `not_reached`. Pre-2026-04-29 the cancelled branch incorrectly
  // flooded EVERY step to `done` — the bug that prompted this fix.
  if (run.status === "failed" || run.status === "cancelled") {
    if (currentIndex === -1) return "not_reached";
    if (index === currentIndex) return run.status === "failed" ? "failed" : "cancelled";
    return index < currentIndex ? "done" : "not_reached";
  }

  // Terminal success: every step we have a duration for is `done`;
  // anything missing was bypassed — typically because a stock-buffer
  // entry was consumed and the AI pipeline was skipped end-to-end.
  // The exempt set covers slots the cloud may legitimately not stamp
  // (queued, publishing) so we don't misrepresent them as skipped on
  // a green run.
  if (run.status === "succeeded" || run.status === "succeeded_with_warnings") {
    const hasDuration = run.stepDurationsMs?.[milestone] != null;
    if (!hasDuration && !SKIP_INFERENCE_EXEMPT.has(milestone)) {
      return "skipped";
    }
    // Channels fan-out can partially fail (a channel dispatch errored, e.g. X
    // CreditsDepleted) while the post still published to WP + other channels.
    // `channelsSummary.failed` is set by the post-published endpoint and the
    // run was promoted to succeeded_with_warnings — render this row amber so
    // the user isn't told everything's fine when a channel didn't post.
    if (
      milestone === "channels" &&
      (run.outputs?.channelsSummary?.failed?.length ?? 0) > 0
    ) {
      return "warning";
    }
    // An image slot that failed at the provider (e.g. Gemini aspect-ratio
    // reject) still has a duration — without this it renders a false green
    // check even though the post published with no visuals.
    if (imageSlotFailed(run, milestone)) return "warning";
    return "done";
  }

  // In-flight: step before currentIndex is done; current is active;
  // after is unreached. `currentIndex === -1` shouldn't happen for
  // an in-flight run but guard defensively.
  if (currentIndex === -1 || index === -1) return "not_reached";
  if (index < currentIndex) return "done";
  if (index > currentIndex) return "not_reached";
  return "active";
}

/**
 * Live-tick elapsed-time for the currently-active step.
 *
 * The cloud only stamps `stepDurationsMs[step]` when the step ends —
 * while a step is in flight, the SPA has nothing to render in the chip
 * unless we compute it locally. We approximate by subtracting the sum
 * of completed-step durations from the wall-clock time since `startedAt`;
 * the difference is what's elapsed on the current step. Accurate to
 * within ~1s of the truth (clock skew + the cloud's serverTimestamp
 * round-trip), which is fine for a "watching the bar fill up" UI.
 *
 * The hook ticks at 1s when the run is in flight and freezes (returning
 * `undefined`) on terminal runs — those use the recorded
 * `stepDurationsMs[currentStep]` directly. Yurii ask 2026-05-19: "make
 * them tick when processing so i can see how much time is spent for
 * the current task."
 */
function useActiveStepElapsedMs(run: RunStatusSerialized): number | undefined {
  const isInFlight = run.status === "queued" || run.status === "running";
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isInFlight) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isInFlight]);

  if (!isInFlight) return undefined;

  const startedAtMs = Date.parse(run.startedAt);
  if (!Number.isFinite(startedAtMs)) return undefined;

  const completedTotal = Object.values(run.stepDurationsMs ?? {}).reduce(
    (sum: number, ms) => sum + (typeof ms === "number" ? ms : 0),
    0,
  );

  return Math.max(0, now - startedAtMs - completedTotal);
}

export const RunTimeline = ({
  run,
  density = "standard",
  className,
  withCard = true,
}: RunTimelineProps) => {
  // Pick the step set based on which pipeline produced the run AND
  // the caller's tier. Stock-served runs collapse to 3 steps; Free /
  // None additionally drops `research` + `link_validation` because
  // those phases are no-ops on those tiers (no SERP fetch, no
  // outbound links to validate). Showing them would imply work the
  // cloud didn't do.
  const { isPaidLicense, isLicensed } = useLicense();
  const isPaid = !!isPaidLicense;
  const baseOrder = milestoneOrderForFlowAndTier(run.flow, isPaid);

  // Inapplicable milestones split into two sets:
  //
  //   - `tierConditional` — rows that are tier-locked on Free / None
  //     (rendered with a "Pro" / "Free License" chip as an
  //     upgrade-path teaser) AND filtered on paid (so paying users
  //     don't see chips on features they already have).
  //
  //   - `alwaysFiltered` — rows that are filtered on EVERY tier
  //     regardless of license. Covers the case where a user
  //     EXPLICITLY disabled a feature at a tier that supports it
  //     (e.g. a Free-tier user toggling featured images off — Free
  //     has access, so showing the row as locked would be misleading;
  //     it should disappear, same as on paid tiers).
  const { tierConditional, alwaysFiltered } = resolveInapplicableMilestones(
    run,
    isPaid,
    !!isLicensed,
  );
  const milestoneOrder = baseOrder
    .filter((m) => !alwaysFiltered.has(m))
    .filter((m) => (isPaid ? !tierConditional.has(m) : true));
  const tierLocked: Set<Milestone> = isPaid ? new Set() : tierConditional;

  // 2026-05-02 — for failed runs, `currentStep` is the `error`
  // sentinel (not in any milestone-order list). Locate the actual
  // failed milestone via `failedAtStep` (post-2026-05-02 cloud
  // builds) or, for back-compat with older docs, by inferring it
  // as the highest-index milestone present in `stepDurationsMs`
  // (the cloud records the failed step's elapsed time before the
  // terminal write, so its key is in the map).
  //
  // Without this resolution, every row renders as `not_reached`
  // and duration chips disappear — the symptom Yurii reported on
  // 2026-05-02 ("I don't see durations for each step anymore").
  const currentIndex = resolveCurrentIndexForRender(run, milestoneOrder);
  const activeElapsedMs = useActiveStepElapsedMs(run);
  const isCompact = density === "compact";
  const isTerminalSuccess = run.status === "succeeded" || run.status === "succeeded_with_warnings";
  const isFailed = run.status === "failed";
  const isCancelled = run.status === "cancelled";
  // Draft runs relabel the "Publishing to WordPress" / "Post published"
  // steps ("Saving to WordPress" / "Draft saved") — a draft never went
  // live, so the published wording was misleading (2026-07-09).
  const postStatus = resolveRunPostStatus(run);

  // Line-fill height — fraction of the stepper the filled line covers,
  // pinned to the active milestone's position. On terminal success we
  // flood 100%; on failure we stop at the failed step (the downstream
  // steps are unreached, so the line shouldn't claim otherwise).
  const fillHeightPercent = isTerminalSuccess
    ? 100
    : currentIndex === -1
      ? 0
      : (currentIndex / Math.max(1, milestoneOrder.length - 1)) * 100;

  // Failed-run split: the rail keeps the success color for every
  // segment up to (but excluding) the failed step, and turns red ONLY
  // for the segment leading INTO the failed step. Earlier the whole
  // rail flipped to red the moment `isFailed` was true, which on a
  // run that completed 9/10 steps successfully and only died on
  // channels fan-out painted the entire rail red between green
  // checkmarks — visually inconsistent with the per-step state
  // (cms.formulafoundry.io 2026-05-22 feedback).
  //
  // `redSegmentStartPercent` is the rail-% where the failed segment
  // starts (i.e. the bottom of the step BEFORE the failed one).
  // Below this point the rail is green; above it (up to
  // `fillHeightPercent`) the rail is red. On a multi-step run with
  // a mid-pipeline failure we'd render: green rail to failedIdx-1,
  // red rail through failedIdx, no rail beyond.
  const redSegmentStartPercent =
    isFailed && currentIndex > 0
      ? ((currentIndex - 1) / Math.max(1, milestoneOrder.length - 1)) * 100
      : 0;

  // Refs for measuring the LAST avatar's vertical position so the rail
  // can end exactly at its center, regardless of how tall the last row
  // grew because of an inline error message or other long content. The
  // CSS-only `bottom-[14px]` anchor assumed each row was avatar-height
  // — a failed terminal step with `error.userMessage` rendered inline
  // breaks that assumption and the rail visibly extends below the
  // last avatar (cms.formulafoundry.io 2026-05-22).
  const railWrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const [railHeightPx, setRailHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const railEl = railWrapperRef.current;
      const listEl = listRef.current;
      if (!railEl || !listEl) return;
      // Avatars are tagged with `data-avatar` inside TimelineRow so we
      // can find the last one without threading refs through children.
      const avatars = listEl.querySelectorAll<HTMLElement>("[data-avatar]");
      if (avatars.length === 0) return;
      const lastAvatar = avatars[avatars.length - 1];
      if (!lastAvatar) return;
      const railTop = railEl.getBoundingClientRect().top;
      const avatarRect = lastAvatar.getBoundingClientRect();
      const avatarCenter = avatarRect.top + avatarRect.height / 2;
      // Floor to whole pixels so we don't trigger an infinite resize
      // observer loop on sub-pixel rounding differences.
      setRailHeightPx(Math.max(0, Math.floor(avatarCenter - railTop)));
    };
    measure();
    // jsdom (the vitest browser-stub) doesn't ship ResizeObserver, so
    // guard the observe setup. Production browsers (every supported
    // wp-admin: Chrome / Firefox / Safari 13+ / Edge) all have it.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (railWrapperRef.current) ro.observe(railWrapperRef.current);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [milestoneOrder.length, run.status]);

  const stepper = (
    <div className="relative">
      {/* Rail wrapper — pinned between the centers of the first and last
          icon avatars. By sizing this wrapper exactly to "first center →
          last center", both the static neutral track AND the animated
          fill can be expressed as 100%/X% of *this* container instead of
          the outer relative div. That avoids the bug where `top-4` +
          `height: 100%` made the fill extend past the bottom of the last
          circle on terminal success. Avatar radius drives the inset:
          standard 36px avatar → 18px, compact 28px → 14px.
          The bottom anchor uses a measured pixel height (set by
          `useLayoutEffect` above) rather than the CSS `bottom-[14px]`
          shorthand — when the last row carries an inline error
          message the row grows past avatar-height and the
          CSS-only anchor leaves a trailing line below the last
          avatar. The measurement falls back to the CSS anchor while
          the first layout pass settles. */}
      <div
        ref={railWrapperRef}
        aria-hidden
        className={cn(
          "absolute w-0.5",
          isCompact ? "top-[14px] left-3.25" : "top-[18px] left-4.25",
          // Only the bottom-* utility is conditional — when the
          // measurement is available we drop it and the inline
          // `height` style takes over.
          railHeightPx === null && (isCompact ? "bottom-[14px]" : "bottom-[18px]")
        )}
        style={railHeightPx !== null ? { height: railHeightPx } : undefined}
      >
        {/* Track — static 2px neutral rail. */}
        <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800" />
        {/* Fill — animated overlay that grows top-down as milestones
            complete. `transition-[height]` on a 1s curve gives the
            "filling up" feel without the jumpy snap of a CSS transform.
            Shadow glow picks up the emerald color scheme in dark mode.
            We use emerald for both in-flight AND terminal-success: the
            fill represents "what's done", and the segments behind the
            active step are bracketed by green checkmarks on either
            end — a brand-blue line between two emerald avatars read
            as a colour clash (Yurii feedback 2026-05-01). The active
            step keeps its brand identity via the avatar ring + the
            label-cell highlight box, so we don't lose the brand
            anchor by harmonising the rail. */}
        {/* Base fill — green for everything BEFORE the failed step.
            On non-failed runs this stretches the full
            fillHeightPercent and is the only fill rendered. On
            failed runs it stops at the segment leading into the
            failed step; the red overlay below paints the remainder. */}
        <div
          className={cn(
            "absolute top-0 left-0 w-full origin-top transition-[height] duration-1000 ease-out",
            isCancelled
              ? "bg-amber-500/70"
              : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          )}
          style={{
            height: `${isFailed ? redSegmentStartPercent : fillHeightPercent}%`,
          }}
        />
        {/* Red overlay — only the failed-segment portion (from the
            step BEFORE the failure to the failed step itself). Layered
            after the green base so it stacks on top within the same
            rail container. */}
        {isFailed && (
          <div
            className="absolute left-0 w-full origin-top bg-red-500/70 transition-[height] duration-1000 ease-out"
            style={{
              top: `${redSegmentStartPercent}%`,
              height: `${Math.max(0, fillHeightPercent - redSegmentStartPercent)}%`,
            }}
          />
        )}
      </div>
      <ol
        ref={listRef}
        className={cn("relative ml-0! list-none!", isCompact ? "space-y-4!" : "space-y-6!")}
      >
        {milestoneOrder.map((milestone, index) => {
          const state = stateFor(index, currentIndex, run, milestoneOrder, tierLocked);
          // Active rows get the live-ticking counter we computed at
          // the component scope; every other row reads its recorded
          // duration from `stepDurationsMs`. On terminal runs
          // `activeElapsedMs` is undefined and the active branch
          // never matches, so the recorded value wins as it should.
          const elapsedMs =
            state === "active" ? activeElapsedMs : run.stepDurationsMs?.[milestone];
          // Channels gets a count chip ("3 channels") instead of a
          // duration chip — the chip's job is "what just happened"
          // and for fan-out that's the resolved-connection count,
          // not the wall-clock ms the dispatcher spent.
          const channelsCount =
            milestone === "channels" && typeof run.channelsResolvedCount === "number"
              ? run.channelsResolvedCount
              : undefined;
          // Names the channel(s) that failed, shown inline on a `warning`
          // channels row (e.g. "Couldn't post to x").
          const channelsFailed =
            milestone === "channels"
              ? (run.outputs?.channelsSummary?.failed ?? [])
              : [];
          // Image-slot warning copy. The full provider reason already shows in
          // the receipt's image-failure list, so the timeline row stays a short
          // status line rather than echoing the raw message.
          const warningMessage =
            state !== "warning"
              ? undefined
              : channelsFailed.length > 0
                ? sprintf(
                    __("Couldn't post to %s", "structura"),
                    channelsFailed.join(", "),
                  )
                : imageSlotFailed(run, milestone)
                  ? __("Couldn't generate this image", "structura")
                  : undefined;
          return (
            <TimelineRow
              key={milestone}
              milestoneId={milestone}
              postStatus={postStatus}
              state={state}
              density={density}
              elapsedMs={elapsedMs}
              errorUserMessage={state === "failed" ? run.error?.userMessage : undefined}
              warningMessage={warningMessage}
              tierLockLabel={state === "tier_locked" ? TIER_LOCK_LABELS[milestone] : undefined}
              channelsResolvedCount={channelsCount}
            />
          );
        })}
      </ol>
    </div>
  );

  if (!withCard) {
    return <div className={className}>{stepper}</div>;
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-neutral-300/50 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        isCompact ? "p-5" : "p-6",
        className
      )}
    >
      <SectionLabel>{__("Process Timeline", "structura")}</SectionLabel>
      <div className={isCompact ? "mt-5" : "mt-8"}>{stepper}</div>
    </div>
  );
};

/**
 * Uppercase micro-label used as the section header. Kept local to
 * this component so callers embedding the naked stepper don't pull in
 * the label style by accident. Matches the new RunDetailPage section
 * treatment exactly.
 */
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="m-0! flex! items-center gap-2 text-[10px] font-black tracking-[0.2em] text-neutral-400 uppercase">
    {/* Inline SVG replica of lucide's Activity — avoids an extra
        dependency pull on this tiny icon usage and matches the mockup's
        14px glyph exactly. */}
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.68 3.18a.5.5 0 0 0-.96 0l-2.35 8.36A2 2 0 0 1 4.44 13H2" />
    </svg>
    {children}
  </h2>
);

interface TimelineRowProps {
  milestoneId: Milestone;
  /** Effective post status — relabels the publish/done rows for drafts. */
  postStatus: "publish" | "draft";
  state: TimelineState;
  density: "standard" | "compact";
  elapsedMs?: number;
  errorUserMessage?: string;
  /**
   * Tier badge text for `tier_locked` rows ("Pro" / "Free License").
   * Undefined for every other state. The label is supplied by the
   * parent's `TIER_LOCK_LABELS` lookup so the component itself stays
   * tier-agnostic.
   */
  tierLockLabel?: string;
  /** Inline amber message for a `warning` row (e.g. "Couldn't post to x"). */
  warningMessage?: string;
  /**
   * Number of channel connections the dispatcher fanned out to. Only
   * meaningful when `milestoneId === "channels"` and the dispatcher
   * has already patched the run doc. When set, replaces the duration
   * chip with a "{count} channels" pill — see the parent computation
   * for why fan-out count beats wall-clock ms here.
   */
  channelsResolvedCount?: number;
}

const TimelineRow = ({
  milestoneId,
  postStatus,
  state,
  density,
  elapsedMs,
  errorUserMessage,
  warningMessage,
  tierLockLabel,
  channelsResolvedCount,
}: TimelineRowProps) => {
  const isDone = state === "done";
  const isActive = state === "active";
  const isFailed = state === "failed";
  const isCancelled = state === "cancelled";
  const isWarning = state === "warning";
  const isNotReached = state === "not_reached";
  const isTierLocked = state === "tier_locked";
  const isSkipped = state === "skipped";
  const isCompact = density === "compact";

  const MilestoneIcon = milestoneIcon(milestoneId);
  // On done rows we always display the check glyph — the milestone's
  // own icon is reserved for states where it's load-bearing identity
  // (active / failed / cancelled / tier_locked), and the check is
  // the universal "complete" mark.
  const avatarSize = isCompact ? 28 : 36;
  const iconSize = isCompact ? 14 : 16;

  return (
    <li>
      <div className="relative flex items-start gap-5">
        {/* Icon avatar — sits on top of the rail via `z-10` so the fill
            line is visually bisected by each milestone's icon.
            `data-avatar` lets the parent measure the LAST row's
            avatar position so the rail's bottom anchor lands at the
            avatar center even on rows that grew taller than
            avatar-size (e.g. failed step with an inline error
            message). See the parent's `useLayoutEffect`. */}
        <div
          data-avatar=""
          className={cn(
            "relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-500",
            isDone
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/20"
              : isActive
                ? "border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/20"
                : isFailed
                  ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                  : isCancelled || isWarning
                    ? "border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/20"
                    : isTierLocked || isSkipped
                      ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40"
                      : "border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          )}
          style={{ height: avatarSize, width: avatarSize }}
          aria-hidden
        >
          {isDone ? (
            <CheckCircle2 size={iconSize} className="text-emerald-600 dark:text-emerald-400" />
          ) : isWarning ? (
            <AlertTriangle size={iconSize} className="text-amber-600 dark:text-amber-400" />
          ) : (
            <MilestoneIcon
              width={iconSize}
              height={iconSize}
              className={cn(
                isActive
                  ? "text-brand-600 dark:text-brand-400"
                  : isFailed
                    ? "text-red-600 dark:text-red-400"
                    : isCancelled
                      ? "text-amber-600 dark:text-amber-400"
                      : isTierLocked || isSkipped
                        ? "text-neutral-400 dark:text-neutral-500"
                        : "text-neutral-300 dark:text-neutral-600"
              )}
            />
          )}
        </div>

        {/* Label cell — active rows get a brand-tinted highlight box so
            the viewer's eye lands on "where we are right now" without
            having to scan the column of icons. */}
        <div
          className={cn(
            "flex-1 pt-1 transition-colors duration-300",
            isActive && "bg-brand-50/30 dark:bg-brand-950/10 -mx-4 rounded-lg px-4"
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "truncate text-sm font-bold tracking-tight",
                  isNotReached || isTierLocked || isSkipped
                    ? "text-neutral-400 dark:text-neutral-500"
                    : "text-neutral-900 dark:text-neutral-100",
                  isActive && "text-brand-700 dark:text-brand-400",
                  isFailed && "text-red-700 dark:text-red-300",
                  (isCancelled || isWarning) && "text-amber-700 dark:text-amber-300"
                )}
              >
                {milestoneHeadline(milestoneId, postStatus)}
              </span>
              {/* Subtext: explanation rows for the steps that need one —
                  the failing step carries the cloud's error.userMessage,
                  the cancelled step says "Cancelled here". `not_reached`
                  rows stay silent (no point repeating "didn't run"). */}
              {isFailed && errorUserMessage && (
                <span className="mt-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                  {errorUserMessage}
                </span>
              )}
              {isCancelled && (
                <span className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  {__("Stopped on this step", "structura")}
                </span>
              )}
              {isWarning && warningMessage && (
                <span className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  {warningMessage}
                </span>
              )}
            </div>
            {/* Tier badge takes the place of the duration chip on locked
                rows — they're mutually exclusive (a tier-locked step
                never has a real duration to show). Neutral / gray
                styling so the locked indicator reads as "skipped" rather
                than "interactive feature" — matches the row state
                (Yurii ask 2026-05-19). */}
            {isTierLocked && tierLockLabel ? (
              <div className="shrink-0 rounded border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-neutral-500 uppercase dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                {tierLockLabel}
              </div>
            ) : isSkipped ? (
              // Skipped rows on a terminal-success run — typically the
              // AI pipeline steps a stock-buffer pull bypassed. Visually
              // identical to the tier-lock chip so the timeline reads as
              // "this step was not part of this run" without implying
              // any failure or upgrade prompt.
              <div className="shrink-0 rounded border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-neutral-500 uppercase dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                {__("Skipped", "structura")}
              </div>
            ) : milestoneId === "channels" &&
              typeof channelsResolvedCount === "number" ? (
              // Channels chip carries the fan-out count instead of a
              // duration. Pluralised inline rather than via @wordpress/i18n's
              // `_n` because the surrounding numbers are intentionally
              // arabic in every locale (matches the duration chip's
              // `formatDuration` output convention).
              <div
                className={cn(
                  "shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  isWarning
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300"
                    : channelsResolvedCount > 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
                )}
              >
                {channelsResolvedCount === 0
                  ? __("No channels", "structura")
                  : channelsResolvedCount === 1
                    ? __("1 channel", "structura")
                    : `${channelsResolvedCount} ${__("channels", "structura")}`}
              </div>
            ) : (
              elapsedMs != null && !isNotReached && (
                <div
                  className={cn(
                    "shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums transition-colors duration-300",
                    isDone &&
                      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300",
                    isActive &&
                      "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800/60 dark:bg-brand-950/30 dark:text-brand-300",
                    isFailed &&
                      "border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300",
                    (isCancelled || isWarning) &&
                      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300",
                    // Defensive fallback — any state we haven't enumerated
                    // (or `not_reached` slipping past the outer guard)
                    // keeps the original neutral chip so the chip doesn't
                    // disappear into the background.
                    !isDone &&
                      !isActive &&
                      !isFailed &&
                      !isCancelled &&
                      !isWarning &&
                      "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400",
                  )}
                >
                  {formatDuration(elapsedMs)}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </li>
  );
};
