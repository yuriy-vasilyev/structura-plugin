/**
 * Tests for `<RunTimeline>` — focused on the failed-run behaviour
 * that the 2026-05-02 fix repairs.
 *
 * Pre-fix, a failed run had `currentStep: "error"` (the cloud's
 * terminal sentinel, not in any milestone-order list). The timeline
 * called `milestoneOrder.indexOf("error")` → `-1`, every row then
 * computed to `not_reached`, and per-step duration chips disappeared
 * even though `stepDurationsMs` had real numbers in it. Yurii: "I
 * don't see durations for each step anymore."
 *
 * Post-fix, the cloud writes `failedAtStep` carrying the actual
 * milestone the run died on, and the timeline prefers it over
 * `currentStep` for failed runs. For older cloud builds without the
 * field, we infer the failed step from the highest-index milestone
 * present in `stepDurationsMs`.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RunStatusSerialized } from "@structura/types";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  // formatDuration uses sprintf for the "%ds" / "%1$dm %2$ds" copy.
  // Mirror the simple positional/sequential placeholder behaviour
  // the real sprintf provides; same minimal mock shape RunDetailPage
  // tests use.
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

// RunTimeline now reads `isPaidLicense` from `useLicense()` to
// filter Free-tier-hidden milestones (research, link_validation)
// from the rendered step list. These tests don't care about the
// tier filter — they cover failed-run rendering with a Pro-shape
// stepDurationsMs payload, so stub useLicense to a paid tier and
// let the test fixtures remain untouched.
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ isPaidLicense: true, isLicensed: true }),
}));

import { RunTimeline } from "../components/RunTimeline";

const baseFailedRun = (overrides: Partial<RunStatusSerialized> = {}): RunStatusSerialized => ({
  schemaVersion: 1,
  runId: "run-fail",
  campaignId: 0,
  campaignName: "Single-post run",
  status: "failed",
  currentStep: "error",
  progressPercent: 95,
  headline: "Generation stopped",
  subtext: "Webhook rejected the delivery.",
  startedAt: new Date("2026-05-02T07:06:00Z").toISOString(),
  updatedAt: new Date("2026-05-02T07:18:00Z").toISOString(),
  endedAt: new Date("2026-05-02T07:18:00Z").toISOString(),
  durationMs: 720_000,
  // Realistic failure shape: cloud completed text + image phases (4
  // and 7 minutes respectively per Yurii's observation) and died on
  // `publishing`. fail() recorded each step's duration before
  // flipping currentStep to "error".
  stepDurationsMs: {
    queued: 200,
    research: 4500,
    outlining: 8200,
    drafting: 240_000,
    link_validation: 12_000,
    // Per-slot image milestones (2026-05-22 split). Featured +
    // body together still sum to ~7 min so the test's "7m 0s"
    // assertion remains meaningful — just split across two
    // rows instead of one `images` bucket.
    image_featured: 210_000,
    image_body: 210_000,
    assembling: 100,
    publishing: 5_000,
  },
  flow: "sync",
  // Phase 1.8 PR8 — the timeline reads `inputSnapshot.structure` to
  // decide whether to render `images` as a real step (run requested
  // images) or as a tier-locked upsell row (no images requested).
  // This fixture asserts a real 7m 0s duration on the images row, so
  // the snapshot must say images WERE requested. Otherwise the row
  // collapses to a "Free License" badge with no duration chip.
  isEphemeral: true,
  inputSnapshot: {
    structure: { featuredImage: true, bodyImages: true },
  },
  error: {
    code: "webhook_400",
    userMessage: "Could not reach your site to deliver the post.",
    logRunId: "log-run-1",
  },
  ...overrides,
});

describe("<RunTimeline> — failed-run rendering", () => {
  it("uses run.failedAtStep when present (post-2026-05-02 cloud build)", () => {
    const run = baseFailedRun({ failedAtStep: "publishing" });

    render(<RunTimeline run={run} />);

    // Every step before `publishing` should render its duration
    // chip — they all completed successfully and have entries in
    // stepDurationsMs. Pre-fix none of these rendered because the
    // resolver fell through to `not_reached` for every row.
    // formatDuration emits "Xs" under a minute, "Xm Ys" otherwise.
    expect(screen.getByText("8s")).toBeInTheDocument();      // outlining
    expect(screen.getByText("4m 0s")).toBeInTheDocument();   // drafting (240_000 ms)
    expect(screen.getByText("12s")).toBeInTheDocument();     // link_validation
    // Per-slot image rows (2026-05-22 split): featured + body each
    // stamped at 3m 30s (was a single 7m `images` bucket pre-split).
    expect(screen.getAllByText("3m 30s").length).toBeGreaterThanOrEqual(2);
    // research (4500ms → "5s") and publishing (5000ms → "5s")
    // collide on label text — assert via the count instead so the
    // test pins both rows landing chips even though they read the
    // same.
    expect(screen.getAllByText("5s").length).toBeGreaterThanOrEqual(2);

    // The failure message lands on the `publishing` row.
    expect(
      screen.getByText("Could not reach your site to deliver the post."),
    ).toBeInTheDocument();
  });

  it("infers the failed step from stepDurationsMs when failedAtStep is absent", () => {
    // Older cloud build — no `failedAtStep` written. Highest-index
    // milestone in MILESTONE_ORDER with a duration entry is
    // `publishing`, so the inference must land there.
    const run = baseFailedRun({ failedAtStep: undefined });

    render(<RunTimeline run={run} />);

    // Same chips as above — inference reaches the same conclusion.
    expect(screen.getByText("4m 0s")).toBeInTheDocument();   // drafting
    // Per-slot image rows replace the old single 7m `images` bucket.
    expect(screen.getAllByText("3m 30s").length).toBeGreaterThanOrEqual(2);
    // research and publishing both round to "5s" — assert on count.
    expect(screen.getAllByText("5s").length).toBeGreaterThanOrEqual(2);

    expect(
      screen.getByText("Could not reach your site to deliver the post."),
    ).toBeInTheDocument();
  });

  it("falls back to legacy not_reached behaviour when both signals are unparseable", () => {
    // Genuinely-broken doc: no failedAtStep, empty stepDurationsMs,
    // currentStep is the error sentinel. Nothing to render against
    // — preserve the pre-fix behaviour rather than guessing.
    const run = baseFailedRun({
      failedAtStep: undefined,
      stepDurationsMs: {},
    });

    render(<RunTimeline run={run} />);

    // Failure message still renders SOMEWHERE — but no row gets the
    // duration chip because no durations were recorded.
    // We don't assert the message position because in this fallback
    // case there's no failed step to attach it to; the receipt
    // copy elsewhere on the page handles the user-facing failure
    // explanation.
    expect(screen.queryByText("4m 0s")).not.toBeInTheDocument();
    expect(screen.queryByText("7m 0s")).not.toBeInTheDocument();
  });

  it("non-failed runs use live-ticking elapsed for the active step (post-2026-05-19)", () => {
    // The active row's chip no longer reads `stepDurationsMs[currentStep]`
    // — that field is only populated at milestone boundaries and would
    // be empty for the in-flight step in real runs. Instead the row
    // shows a live counter computed from `Date.now() - startedAt -
    // sum(completed)`. Pin a deterministic wall clock so the result
    // lands on a predictable label.
    const startedAt = new Date("2026-05-02T07:06:00Z");
    const completedTotal = 200 + 4500 + 8200; // queued + research + outlining
    vi.useFakeTimers();
    vi.setSystemTime(new Date(startedAt.getTime() + completedTotal + 32_000));

    try {
      const inFlight: RunStatusSerialized = {
        ...baseFailedRun(),
        status: "running",
        currentStep: "drafting",
        startedAt: startedAt.toISOString(),
        // Real in-flight runs only carry durations for completed
        // steps — the cloud writes the entry on step exit, not while
        // it's mid-flight. The base fixture pre-populates every step
        // because it represents a terminal failure; trim it here.
        stepDurationsMs: {
          queued: 200,
          research: 4500,
          outlining: 8200,
        },
        error: undefined,
        failedAtStep: undefined,
      };

      render(<RunTimeline run={inFlight} />);

      // Steps before `drafting` (research/outlining) render duration
      // chips because they completed.
      expect(screen.getByText("5s")).toBeInTheDocument();      // research
      expect(screen.getByText("8s")).toBeInTheDocument();      // outlining
      // Active row shows the live-computed elapsed — 32s after the
      // last completed milestone boundary.
      expect(screen.getByText("32s")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("<RunTimeline> — channel partial failure", () => {
  it("renders the channels step as a warning naming the failed channel", () => {
    // A run that published to WP + LinkedIn but X failed (e.g. out of
    // credits). The post-published endpoint promotes it to
    // succeeded_with_warnings and writes channelsSummary.failed=["x"].
    const run = baseFailedRun({
      runId: "run-warn",
      status: "succeeded_with_warnings",
      currentStep: "channels",
      error: undefined,
      channelsResolvedCount: 1,
      stepDurationsMs: {
        queued: 100,
        drafting: 1000,
        publishing: 5_000,
        channels: 22_000,
      },
      outputs: {
        channelsSummary: { succeeded: ["linkedin"], failed: ["x"], skipped: [] },
      },
    });

    render(<RunTimeline run={run} />);

    // The "Sharing to channels" row is present and flagged, not a silent ✓.
    expect(screen.getByText("Sharing to channels")).toBeInTheDocument();
    expect(screen.getByText("Couldn't post to x")).toBeInTheDocument();
  });

  it("flags a failed image slot as a warning instead of a green check", () => {
    // Inline image gen failed at the provider (e.g. Gemini aspect-ratio
    // reject). The slot still ran (~200ms) so it has a duration entry and
    // would otherwise render a false green check; the run is
    // succeeded_with_warnings with outputs.imageFailures. Only the featured
    // slot failed here, so exactly one warning shows.
    const run = baseFailedRun({
      runId: "run-img-warn",
      status: "succeeded_with_warnings",
      currentStep: "done",
      error: undefined,
      stepDurationsMs: {
        queued: 100,
        drafting: 42_000,
        image_featured: 200,
        image_body: 210,
        publishing: 5_000,
      },
      outputs: {
        imageFailures: [
          {
            slot: "featured",
            reason:
              "[Gemini Image Synthesis] Aspect ratio is not enabled for this model",
          },
        ],
      },
    });

    render(<RunTimeline run={run} />);
    expect(
      screen.getAllByText("Couldn't generate this image"),
    ).toHaveLength(1);
  });

  it("keeps the channels step green when every channel succeeded", () => {
    const run = baseFailedRun({
      runId: "run-ok",
      status: "succeeded",
      currentStep: "channels",
      error: undefined,
      channelsResolvedCount: 2,
      stepDurationsMs: { queued: 100, publishing: 5_000, channels: 8_000 },
      outputs: {
        channelsSummary: { succeeded: ["linkedin", "x"], failed: [], skipped: [] },
      },
    });

    render(<RunTimeline run={run} />);
    expect(screen.queryByText(/Couldn't post to/)).not.toBeInTheDocument();
  });
});
