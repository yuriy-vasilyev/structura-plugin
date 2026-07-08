/**
 * Render-branch tests for the Phase 4.4b Cycle Usage widget.
 *
 * We pin:
 *   - cycleUsage.kind = managed renders THIS SITE's per-activation
 *     tokens + images (matched via structuraConfig.activation_id),
 *     never the synthetic workspace pool, and never a "By site" list
 *     — quotas are per activation; the multi-site rollup lives in
 *     the customer portal (2026-06-07 re-scope)
 *   - workspace aggregate only as the back-compat fallback when the
 *     own row can't be matched
 *   - within-quota state shows the purple rail (no warning copy)
 *   - 80%+ utilisation flips to amber; at-limit flips to red
 *   - cycleUsage.kind = byok renders the BYOK card with post count
 *   - cycleUsage.kind = none renders the empty / inactive state
 *
 * Rendering only — query-layer behaviour (when the hook fetches,
 * what URL it hits) is exercised in `useUsageAnalytics` tests
 * separately.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  _n: (single: string, plural: string, count: number) =>
    count === 1 ? single : plural,
  sprintf: (format: string, ...args: unknown[]) => {
    // Handle %% (literal percent) → %, then positional %1$d / %2$s
    // and unindexed %d / %s in order. The replace order matters
    // because `%d%% Used` would otherwise consume "%%U" before
    // collapsing the escape.
    let i = 0;
    return format
      .replace(/%(\d+)\$[sd]/g, (_m, idx) => String(args[Number(idx) - 1]))
      .replace(/%[sd]/g, () => String(args[i++]))
      .replace(/%%/g, "%");
  },
}));

const useUsageAnalyticsMock = vi.fn();
vi.mock("@/features/dashboard/api/useUsageAnalytics", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/dashboard/api/useUsageAnalytics")
  >("@/features/dashboard/api/useUsageAnalytics");
  return {
    ...actual,
    useUsageAnalytics: () => useUsageAnalyticsMock(),
  };
});

const useLicenseMock = vi.fn();
vi.mock("@/features/settings", () => ({
  useLicense: () => useLicenseMock(),
}));

import { IntelligenceUsage } from "../components/IntelligenceUsage";

function Wrap({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function setHook(data: unknown, isLoading = false) {
  useUsageAnalyticsMock.mockReturnValue({ data, isLoading });
}

beforeEach(() => {
  // Default to "no activation id" so threshold tests exercise the
  // workspace fallback; per-activation tests set their own.
  setActivationId(undefined);
});

// ---------------------------------------------------------------------------
//  managed branch
// ---------------------------------------------------------------------------

// Managed-cycle quota framing migrated from posts-with-overage to
// token-only-with-no-overage in 2026-05. The widget no longer
// renders per-post counters or dollar overage estimates; the rail
// color and the "X% Used" chip carry the threshold signal. Tests
// updated to match — assertions pin the chip + the colored
// left-border (`border-l-purple-500` / `-amber-500` / `-red-500`),
// which is the actual visual differential the user sees.
//
// Threshold tests pass empty `activations` and no `activation_id`
// config — the back-compat fallback path — so they exercise the rail
// rules off the workspace numbers without caring about row matching.
function managedFixture(
  percent: number,
  opts: {
    daysLeftInCycle?: number;
    activations?: Array<{
      activationId: string;
      label: string;
      tokensUsed: number;
      tokensIncluded: number;
      imagesUsed: number;
      imagesIncluded: number;
      utilizationPercent: number;
    }>;
  } = {},
) {
  return {
    success: true,
    plan: "cloud" as const,
    cycleUsage: {
      kind: "managed",
      cycleMonth: "2026-05",
      cycleResetsAt: Date.parse("2026-06-01T00:00:00Z"),
      daysLeftInCycle: opts.daysLeftInCycle ?? 17,
      workspace: {
        tokensUsed: 12_000,
        tokensIncluded: 25_000,
        imagesUsed: 4,
        imagesIncluded: 20,
        utilizationPercent: percent,
      },
      activations: opts.activations ?? [],
    },
  };
}

/** Stub the PHP-rendered config the widget matches its own row by. */
function setActivationId(id: string | undefined) {
  window.structuraConfig = (id ? { activation_id: id } : {}) as Window["structuraConfig"];
}

describe("IntelligenceUsage — managed cycle (within quota)", () => {
  it("renders the utilization chip + purple rail with no warning state", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud" });
    setHook(managedFixture(47));

    const { container } = render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(screen.getByText("Cycle Usage")).toBeTruthy();
    expect(screen.getByText("47% Used")).toBeTruthy();
    // Purple = within-quota. The colored left border is the
    // load-bearing visual cue; if the threshold rules drift, the
    // class assertion catches it.
    expect(container.querySelector(".border-l-purple-500")).toBeTruthy();
    expect(container.querySelector(".border-l-amber-500")).toBeNull();
    expect(container.querySelector(".border-l-red-500")).toBeNull();
  });
});

describe("IntelligenceUsage — managed cycle (approaching limit)", () => {
  it("flips to amber at 80%+ utilization", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud" });
    setHook(managedFixture(87, { daysLeftInCycle: 5 }));

    const { container } = render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(screen.getByText("87% Used")).toBeTruthy();
    expect(container.querySelector(".border-l-amber-500")).toBeTruthy();
    expect(container.querySelector(".border-l-purple-500")).toBeNull();
    expect(container.querySelector(".border-l-red-500")).toBeNull();
  });
});

describe("IntelligenceUsage — managed cycle (at limit)", () => {
  it("flips to red when utilization hits 100%", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud_pro" });
    setHook(managedFixture(100, { daysLeftInCycle: 2 }));

    const { container } = render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(screen.getByText("100% Used")).toBeTruthy();
    expect(container.querySelector(".border-l-red-500")).toBeTruthy();
    expect(container.querySelector(".border-l-amber-500")).toBeNull();
    expect(container.querySelector(".border-l-purple-500")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  managed branch — per-activation scope (2026-06-07 re-scope)
// ---------------------------------------------------------------------------

describe("IntelligenceUsage — managed cycle (per-activation scope)", () => {
  // Two-site workspace: own site at 87% of ITS 1M cap, sibling at 0.
  // The synthetic workspace pool says 44% of 2M — the widget must
  // ignore it and render the calling site's numbers.
  const twoSites = () =>
    managedFixture(44, {
      activations: [
        {
          activationId: "act-sibling",
          label: "sibling-site.example",
          tokensUsed: 0,
          tokensIncluded: 1_000_000,
          imagesUsed: 0,
          imagesIncluded: 90,
          utilizationPercent: 0,
        },
        {
          activationId: "act-own",
          label: "own-site.example",
          tokensUsed: 870_000,
          tokensIncluded: 1_000_000,
          imagesUsed: 12,
          imagesIncluded: 90,
          utilizationPercent: 87,
        },
      ],
    });

  it("renders ONLY the current site's tokens, images, and utilization", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud" });
    setActivationId("act-own");
    setHook(twoSites());

    const { container } = render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    // Own per-activation numbers — not the 44%-of-2M workspace pool.
    expect(screen.getByText("87% Used")).toBeTruthy();
    expect(screen.getByText("870K")).toBeTruthy();
    expect(screen.getByText(/1M/)).toBeTruthy();
    expect(screen.getByText("12 / 90 images this cycle")).toBeTruthy();
    // Own utilization drives the rail too (87% → amber).
    expect(container.querySelector(".border-l-amber-500")).toBeTruthy();

    // No multi-site UI in wp-admin — that's the portal's job.
    expect(screen.queryByText(/By site/)).toBeNull();
    expect(screen.queryByText("sibling-site.example")).toBeNull();
    expect(screen.queryByText("own-site.example")).toBeNull();
  });

  it("falls back to the workspace aggregate when the own row can't be matched", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud" });
    // Plugin build predating the activation_id config field.
    setActivationId(undefined);
    setHook(twoSites());

    render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(screen.getByText("44% Used")).toBeTruthy();
    expect(screen.queryByText(/By site/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  byok branch
// ---------------------------------------------------------------------------

describe("IntelligenceUsage — byok cycle", () => {
  it("renders the BYOK card with posts + tokens + images from the cycle rollup", () => {
    useLicenseMock.mockReturnValue({ plan: "byok" });
    setHook({
      success: true,
      plan: "byok",
      cycleUsage: {
        kind: "byok",
        cycleMonth: "2026-05",
        cycleResetsAt: Date.parse("2026-06-01T00:00:00Z"),
        daysLeftInCycle: 17,
        postsUsed: 8,
        tokensUsed: 25_000,
        imagesUsed: 3,
      },
    });

    render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(screen.getByText("BYOK")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText(/posts this cycle/)).toBeTruthy();
    // Token + image counters now come straight from the cycle
    // rollup; no more legacy 30-day usage_logs reduction.
    expect(screen.getByText(/25,000 tokens · 3 images this cycle/)).toBeTruthy();
    // No "Used" pill — the BYOK shape doesn't render utilization.
    expect(screen.queryByText(/% Used/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  none branch
// ---------------------------------------------------------------------------

describe("IntelligenceUsage — none / inactive", () => {
  it("renders the empty/inactive state", () => {
    useLicenseMock.mockReturnValue({ plan: "free" });
    setHook({
      success: true,
      plan: "free",
      cycleUsage: { kind: "none", reason: "license status: disconnected" },
    });

    render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(
      screen.getByText(
        /Connect a license to start tracking your monthly usage/,
      ),
    ).toBeTruthy();
    // Doesn't leak the technical reason — the higher-level
    // connection banner handles the explanation.
    expect(screen.queryByText(/disconnected/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  empty / loading branches
// ---------------------------------------------------------------------------

describe("IntelligenceUsage — empty / loading", () => {
  it("renders the loading skeleton while the query is in-flight", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud" });
    setHook(undefined, /* isLoading */ true);

    const { container } = render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders the error card when cycleUsage is missing", () => {
    useLicenseMock.mockReturnValue({ plan: "cloud" });
    setHook({ success: true, plan: "cloud" });

    render(
      <Wrap>
        <IntelligenceUsage />
      </Wrap>,
    );

    expect(
      screen.getByText(/Unable to load usage data/),
    ).toBeTruthy();
  });
});
