/**
 * Tests for `<RunTimeline>` tier-lock rendering — focused on the
 * 2026-05-19 fix that stops showing a "PRO" badge on `stock_check`
 * (and other structurally-inapplicable rows) for paid-tier users.
 *
 * Pre-fix: every single-post run rendered `stock_check` as
 * `tier_locked` with a "PRO" chip, regardless of plan. Yurii on
 * Cloud Agency: "i'm on cloud agency now, so everything should be
 * available for me." The chip implied the user was missing a feature
 * they already pay for.
 *
 * Post-fix:
 *   - Paid tiers (Pro / Cloud / Cloud Pro / Cloud Agency) never see
 *     a tier-lock chip. Steps that won't run (stock_check on a
 *     single-post run, images when none requested) are filtered out
 *     of the visible order entirely.
 *   - Free / None tiers keep the existing "show the row as locked
 *     with an upgrade chip" behaviour as an upsell signal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { RunStatusSerialized } from "@structura/types";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

// Mutable license flag so each describe block can flip the tier
// without leaking into the others. `vi.mock` is hoisted; the factory
// closes over the module-scope variable.
let mockIsPaidLicense = true;
// `isLicensed` distinguishes None (anonymous, no license key) from
// Free / Paid. Default to `true` so tests that target Free / Paid
// behaviour don't need to set it; the None-tier suite below flips
// it to `false` to exercise the "Free License" tier-lock chip.
let mockIsLicensed = true;
vi.mock("@/features/settings", () => ({
  useLicense: () => ({
    isPaidLicense: mockIsPaidLicense,
    isLicensed: mockIsLicensed,
  }),
}));

import { RunTimeline } from "../components/RunTimeline";

const baseSinglePostRun = (
  overrides: Partial<RunStatusSerialized> = {},
): RunStatusSerialized => ({
  schemaVersion: 1,
  runId: "run-single",
  campaignId: 0,
  campaignName: "Single-post run",
  status: "running",
  currentStep: "drafting",
  progressPercent: 40,
  headline: "Writing the draft",
  subtext: undefined,
  startedAt: new Date("2026-05-19T10:00:00Z").toISOString(),
  updatedAt: new Date("2026-05-19T10:00:30Z").toISOString(),
  durationMs: 30_000,
  stepDurationsMs: {
    queued: 200,
    research: 17_000,
    outlining: 2_000,
  },
  flow: "sync",
  isEphemeral: true,
  inputSnapshot: {
    structure: { featuredImage: true, bodyImages: true },
  },
  ...overrides,
});

describe("<RunTimeline> — paid tier (Cloud Agency etc.)", () => {
  it("does not render stock_check on a single-post run", () => {
    mockIsPaidLicense = true;
    render(<RunTimeline run={baseSinglePostRun()} />);

    // The "Pulling pre-generated draft" row is the stock_check
    // headline (see milestones.ts). It must not appear at all on a
    // single-post paid-tier run — the step doesn't run, and showing
    // it as locked would imply the user is missing a feature they
    // already pay for.
    expect(
      screen.queryByText("Pulling pre-generated draft"),
    ).not.toBeInTheDocument();
  });

  it("does not render a 'PRO' tier-lock badge anywhere on the timeline", () => {
    mockIsPaidLicense = true;
    render(<RunTimeline run={baseSinglePostRun()} />);

    // The tier-lock chip text is the literal label ("Pro" / "Free
    // License"). Neither should appear on a paid-tier run, full
    // stop. We grep the rendered DOM rather than asserting on a
    // specific row so a future-added tier-lock target gets caught too.
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByText("Free License")).not.toBeInTheDocument();
  });

  it("filters the images row when no images were requested", () => {
    mockIsPaidLicense = true;
    const run = baseSinglePostRun({
      inputSnapshot: {
        structure: { featuredImage: false, bodyImages: false },
      },
    });
    render(<RunTimeline run={run} />);

    // Per-slot split (2026-05-22): featured + body are independent
    // milestones with their own headlines. With BOTH explicitly
    // disabled (`=== false`), each row gets filtered. The legacy
    // single-bucket `images` row is also filtered on all runs now,
    // so its headline ("Generating images") never renders either.
    expect(
      screen.queryByText("Generating featured image"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Generating body image"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Generating images")).not.toBeInTheDocument();
  });

  it("keeps the requested per-slot image row visible (featured only)", () => {
    mockIsPaidLicense = true;
    const run = baseSinglePostRun({
      inputSnapshot: {
        structure: { featuredImage: true, bodyImages: false },
      },
    });
    render(<RunTimeline run={run} />);

    // Only featured was requested → that row renders; body is
    // filtered out as inapplicable.
    expect(
      screen.getByText("Generating featured image"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Generating body image"),
    ).not.toBeInTheDocument();
  });
});

describe("<RunTimeline> — active-step live tick (2026-05-19)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks the active step's chip every second on an in-flight run", () => {
    mockIsPaidLicense = true;
    const startedAt = new Date("2026-05-19T10:00:00Z");
    // After 200ms queued + 17s research + 2s outlining (= 19.2s), the
    // active step starts. Advance another 5 seconds.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(startedAt.getTime() + 19_200 + 5_000));

    const run: RunStatusSerialized = {
      schemaVersion: 1,
      runId: "run-tick",
      campaignId: 0,
      campaignName: "Single-post run",
      status: "running",
      currentStep: "drafting",
      progressPercent: 40,
      headline: "Writing the draft",
      startedAt: startedAt.toISOString(),
      updatedAt: new Date(startedAt.getTime() + 19_200).toISOString(),
      durationMs: 24_200,
      stepDurationsMs: {
        queued: 200,
        research: 17_000,
        outlining: 2_000,
      },
      flow: "sync",
      isEphemeral: true,
      inputSnapshot: {
        structure: { featuredImage: true, bodyImages: true },
      },
    };

    render(<RunTimeline run={run} />);

    // 5s elapsed on the active step at mount time.
    expect(screen.getByText("5s")).toBeInTheDocument();

    // Advance the tick by 3 seconds — the chip should follow.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText("8s")).toBeInTheDocument();
  });

  it("does not tick on terminal-success runs (chip frozen at the recorded value)", () => {
    mockIsPaidLicense = true;
    // Use real timers — `useActiveStepElapsedMs` exits early for
    // non-in-flight runs, so there's no interval to wait on.
    const run: RunStatusSerialized = {
      schemaVersion: 1,
      runId: "run-succeeded",
      campaignId: 0,
      campaignName: "Single-post run",
      status: "succeeded",
      currentStep: "done",
      progressPercent: 100,
      headline: "Post published",
      startedAt: new Date("2026-05-19T10:00:00Z").toISOString(),
      updatedAt: new Date("2026-05-19T10:11:00Z").toISOString(),
      endedAt: new Date("2026-05-19T10:11:00Z").toISOString(),
      durationMs: 660_000,
      stepDurationsMs: {
        queued: 200,
        research: 17_000,
        outlining: 2_000,
        drafting: 191_000,
      },
      flow: "sync",
      isEphemeral: true,
      inputSnapshot: {
        structure: { featuredImage: true, bodyImages: true },
      },
    };

    render(<RunTimeline run={run} />);

    // Recorded drafting duration is 191_000ms → "3m 11s". This is the
    // frozen value from stepDurationsMs, not a live tick.
    expect(screen.getByText("3m 11s")).toBeInTheDocument();
  });
});

describe("<RunTimeline> — free / none tier", () => {
  // The per-tier matrix branches on isLicensed too (None: no
  // license, Free: licensed but not paid). Default to Free between
  // tests; the None-specific case below flips this to `false`.
  beforeEach(() => {
    mockIsLicensed = true;
  });

  it("renders stock_check as a tier-locked PRO row on single-post", () => {
    mockIsPaidLicense = false;
    render(<RunTimeline run={baseSinglePostRun()} />);

    // The step is visible (upsell signal) AND carries the "Pro" chip.
    // `getAllByText` rather than `getByText` because the `channels`
    // tail-step is also "Pro"-locked on Free / None; the assertion
    // here just needs at least one matching chip.
    expect(screen.getByText("Pulling pre-generated draft")).toBeInTheDocument();
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
  });

  it("renders BOTH image rows tier-locked on None (single-post)", () => {
    // None tier has neither Free License (featured floor) nor Pro
    // (body floor) → both per-slot rows surface as tier-locked
    // chips that double as the upgrade-path teaser.
    mockIsPaidLicense = false;
    mockIsLicensed = false;
    const run = baseSinglePostRun({
      inputSnapshot: {
        structure: { featuredImage: false, bodyImages: false },
      },
    });
    render(<RunTimeline run={run} />);

    expect(
      screen.getByText("Generating featured image"),
    ).toBeInTheDocument();
    expect(screen.getByText("Free License")).toBeInTheDocument();
    expect(
      screen.getByText("Generating body image"),
    ).toBeInTheDocument();
    // "Pro" chip appears both on body-image and other Pro-gated
    // rows (stock_check, channels) — just assert presence.
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
  });

  it("filters the featured-image row but tier-locks body on Free tier", () => {
    // Free tier has featured access (Free License floor) but NOT
    // body access (Pro floor). When the user explicitly disabled
    // featured (`featuredImage: false`), the row should disappear
    // entirely — Free CAN have featured, they just chose not to,
    // so a tier-lock chip would falsely suggest the feature
    // requires upgrade. Body, however, stays as tier-locked "Pro".
    mockIsPaidLicense = false;
    mockIsLicensed = true;
    const run = baseSinglePostRun({
      inputSnapshot: {
        structure: { featuredImage: false, bodyImages: false },
      },
    });
    render(<RunTimeline run={run} />);

    expect(
      screen.queryByText("Generating featured image"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Generating body image"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    // Free tier should NOT show a "Free License" chip on the image
    // section (only None does).
    expect(screen.queryByText("Free License")).not.toBeInTheDocument();
  });
});
