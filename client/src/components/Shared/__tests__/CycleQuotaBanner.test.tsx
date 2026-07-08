/**
 * Render-branch tests for the Phase 4.4 site-wide cycle quota
 * banner.
 *
 * We pin:
 *   - hidden when usage data is loading or absent
 *   - hidden for non-managed cycle shapes (byok / none)
 *   - hidden when utilization < 80% AND under quota
 *   - INFO variant fires at 80%+ but under quota, showing the
 *     utilisation percent + token totals
 *   - WARNING variant fires once `utilizationPercent >= 100` or
 *     `tokensUsed > tokensIncluded`, with hard-block copy (caps
 *     pause generation — there is no overage billing)
 *   - thresholds read THIS SITE's per-activation row (matched via
 *     structuraConfig.activation_id), never the synthetic workspace
 *     aggregate — quotas hard-block per activation (2026-06-07
 *     re-scope); workspace numbers only as the back-compat fallback
 *   - "View usage" CTA navigates to the dashboard root
 *
 * The pre-2026-05-13 post/overage shape (`overageUnits`,
 * `estimatedOverageUsd`, `postsUsed`) is gone — see the banner
 * docblock for the refactor history.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
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

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>(
    "react-router",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { CycleQuotaBanner } from "../CycleQuotaBanner";

function Wrap({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function setHook(data: unknown, isLoading = false) {
  useUsageAnalyticsMock.mockReturnValue({ data, isLoading });
}

/**
 * Minimal managed-cycle fixture builder. Tests that exercise the
 * thresholds pass no `activations` and no `activation_id` config —
 * the back-compat fallback path where the workspace numbers ARE this
 * site's numbers. The per-activation-scope tests pass `activations`
 * and set the config id.
 */
function managedCycle(
  workspace: {
    tokensUsed: number;
    tokensIncluded: number;
    utilizationPercent: number;
  },
  activations: Array<{
    activationId: string;
    label: string;
    tokensUsed: number;
    tokensIncluded: number;
    imagesUsed: number;
    imagesIncluded: number;
    utilizationPercent: number;
  }> = [],
) {
  return {
    success: true,
    cycleUsage: {
      kind: "managed",
      cycleMonth: "2026-05",
      cycleResetsAt: 0,
      daysLeftInCycle: 17,
      workspace: {
        tokensUsed: workspace.tokensUsed,
        tokensIncluded: workspace.tokensIncluded,
        imagesUsed: 0,
        imagesIncluded: 0,
        utilizationPercent: workspace.utilizationPercent,
      },
      activations,
    },
  };
}

/** Stub the PHP-rendered config the banner matches its own row by. */
function setActivationId(id: string | undefined) {
  window.structuraConfig = (id ? { activation_id: id } : {}) as Window["structuraConfig"];
}

beforeEach(() => {
  setActivationId(undefined);
});

describe("CycleQuotaBanner — hidden states", () => {
  it("renders nothing while the query is loading", () => {
    setHook(undefined, true);
    const { container } = render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when cycleUsage is absent", () => {
    setHook({ success: true });
    const { container } = render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for the byok cycle shape", () => {
    setHook({
      success: true,
      cycleUsage: {
        kind: "byok",
        cycleMonth: "2026-05",
        cycleResetsAt: 0,
        daysLeftInCycle: 17,
        postsUsed: 3,
        tokensUsed: 1000,
        imagesUsed: 0,
      },
    });
    const { container } = render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for the none cycle shape", () => {
    setHook({
      success: true,
      cycleUsage: { kind: "none", reason: "license status: disconnected" },
    });
    const { container } = render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing under 80% utilisation", () => {
    setHook(
      managedCycle({
        tokensUsed: 600_000,
        tokensIncluded: 1_000_000,
        utilizationPercent: 60,
      }),
    );
    const { container } = render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("CycleQuotaBanner — INFO variant (approaching)", () => {
  it("fires at 80% with utilisation + token totals", () => {
    setHook(
      managedCycle({
        tokensUsed: 800_000,
        tokensIncluded: 1_000_000,
        utilizationPercent: 80,
      }),
    );

    render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );

    expect(screen.getByText("Approaching cycle quota")).toBeTruthy();
    // Description carries the percent + the compact-tokens totals.
    expect(screen.getByText(/80% of its cycle token budget/)).toBeTruthy();
    expect(screen.getByText(/800K of 1M/)).toBeTruthy();
  });

  it("does NOT use at-quota copy when utilisation is high but still under quota", () => {
    setHook(
      managedCycle({
        tokensUsed: 930_000,
        tokensIncluded: 1_000_000,
        utilizationPercent: 93,
      }),
    );
    render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(screen.queryByText(/quota reached/)).toBeNull();
    expect(screen.getByText("Approaching cycle quota")).toBeTruthy();
  });
});

describe("CycleQuotaBanner — WARNING variant (over quota)", () => {
  it("fires once utilisation hits 100%", () => {
    setHook(
      managedCycle({
        tokensUsed: 1_000_000,
        tokensIncluded: 1_000_000,
        utilizationPercent: 100,
      }),
    );

    render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );

    expect(screen.getByText("Cycle quota reached")).toBeTruthy();
    // Hard-block framing — generation pauses; nothing about overage
    // rates (caps are not billable).
    expect(screen.getByText(/1M of its 1M included tokens/)).toBeTruthy();
    expect(screen.getByText(/Generation is paused/)).toBeTruthy();
    expect(screen.queryByText(/[Oo]verage/)).toBeNull();
    // Approaching copy must NOT also render — the at-quota branch
    // supersedes it.
    expect(screen.queryByText("Approaching cycle quota")).toBeNull();
  });

  it("fires when tokensUsed exceeds tokensIncluded even if percent is capped", () => {
    // utilizationPercent is capped at 100 by the cloud, so the
    // "over by N tokens" case has to be inferred from raw counters
    // — pinning that branch keeps the WARNING from collapsing back
    // to INFO at the 100% boundary.
    setHook(
      managedCycle({
        tokensUsed: 1_200_000,
        tokensIncluded: 1_000_000,
        utilizationPercent: 100,
      }),
    );

    render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(screen.getByText("Cycle quota reached")).toBeTruthy();
  });
});

describe("CycleQuotaBanner — per-activation scope (2026-06-07)", () => {
  // Two-site workspace where the aggregate and the calling site
  // disagree — the banner must follow the calling site.
  const sites = (ownPercent: number, ownUsed: number) => [
    {
      activationId: "act-sibling",
      label: "sibling-site.example",
      tokensUsed: 950_000,
      tokensIncluded: 1_000_000,
      imagesUsed: 0,
      imagesIncluded: 90,
      utilizationPercent: 95,
    },
    {
      activationId: "act-own",
      label: "own-site.example",
      tokensUsed: ownUsed,
      tokensIncluded: 1_000_000,
      imagesUsed: 0,
      imagesIncluded: 90,
      utilizationPercent: ownPercent,
    },
  ];

  it("stays hidden when THIS site is fine, even if a sibling site is at 95%", () => {
    setActivationId("act-own");
    setHook(
      managedCycle(
        // Aggregate sits at 67% — under the old workspace scoping
        // this was already close to firing off the sibling's burn.
        { tokensUsed: 1_350_000, tokensIncluded: 2_000_000, utilizationPercent: 67 },
        sites(40, 400_000),
      ),
    );
    const { container } = render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fires off THIS site's utilization even when the aggregate looks healthy", () => {
    setActivationId("act-own");
    setHook(
      managedCycle(
        // Aggregate well under 80% — the old workspace scoping would
        // have stayed silent while this site was already blocked.
        { tokensUsed: 1_000_000, tokensIncluded: 4_000_000, utilizationPercent: 25 },
        sites(100, 1_000_000),
      ),
    );
    render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    expect(screen.getByText("Cycle quota reached")).toBeTruthy();
  });
});

describe("CycleQuotaBanner — interaction", () => {
  it("navigates to / when 'View usage' is clicked", () => {
    setHook(
      managedCycle({
        tokensUsed: 870_000,
        tokensIncluded: 1_000_000,
        utilizationPercent: 87,
      }),
    );
    navigateMock.mockClear();
    render(
      <Wrap>
        <CycleQuotaBanner />
      </Wrap>,
    );
    fireEvent.click(screen.getByText("View usage"));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
