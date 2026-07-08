/**
 * Tests for `useRehydrateActiveRun` — the refresh-recovery hook that
 * repopulates `RunsContext.activeRunId` from the site-wide active-runs
 * endpoint on mount. Mounted inside `RunsProvider` so it fires once
 * per SPA mount, regardless of which route the user lands on.
 *
 * Pins three contracts:
 *
 *   1. When the server lists at least one in-flight run and
 *      `activeRunId` is null, the hook pushes the first (newest-
 *      started, per cloud ordering) run into context. This is the
 *      core refresh-recovery case.
 *   2. When `activeRunId` is already set (same-session Generate-Now
 *      mutation), the hook does NOT clobber it — we trust the
 *      mutation's id over the server list's first in-flight row.
 *   3. When the list is empty the hook stays silent. "No runs" is
 *      the steady-state "nothing to do" case.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import type { RunStatusSerialized } from "@structura/types";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

// `useActiveRunsQuery` (mounted inside RunsProvider) now gates on
// `useLicense().hasUsableLicense`. Stub to "bound" so the active-runs
// fetch fires and rehydration assertions still hold.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { useRehydrateActiveRun } from "../useRehydrateActiveRun";
import { RunsProvider, useRuns } from "../context/RunsContext";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RunsProvider>{children}</RunsProvider>
    </QueryClientProvider>
  );
}

/**
 * Test host. The `RunsProvider` already mounts `useRehydrateActiveRun`
 * internally, so we only need a probe that reads the resulting
 * context state — not a second copy of the hook. `initialRun` lets a
 * test pre-seed the context to cover the "don't clobber" case.
 */
const RehydrationProbe = ({
  initialRun,
}: {
  initialRun?: { runId: string; campaignId: string | number };
}) => {
  const { activeRunId, activeCampaignId, setActiveRun } = useRuns();
  const seeded = useRef(false);
  useEffect(() => {
    if (initialRun && !seeded.current) {
      seeded.current = true;
      setActiveRun(initialRun);
    }
  }, [initialRun, setActiveRun]);
  return (
    <div
      data-testid="probe"
      data-active-run={activeRunId ?? ""}
      data-active-campaign={activeCampaignId ?? ""}
    />
  );
};

const RUN_RUNNING: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-live",
  campaignId: 42,
  campaignName: "Weekly Digest",
  status: "running",
  currentStep: "drafting",
  progressPercent: 40,
  headline: "Writing section 2 of 5",
  startedAt: "2026-04-22T12:00:00.000Z",
  updatedAt: "2026-04-22T12:00:30.000Z",
  stepDurationsMs: {},
};

const RUN_QUEUED: RunStatusSerialized = {
  ...RUN_RUNNING,
  runId: "run-queued",
  campaignId: 99,
  status: "queued",
  currentStep: "queued",
  progressPercent: 0,
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("useRehydrateActiveRun", () => {
  it("pushes the first in-flight run into RunsContext on empty init", async () => {
    // Server returns two in-flight runs; cloud ordering (newest
    // startedAt first) puts `run-live` at index 0. The hook picks
    // index 0 and pushes it into context — we don't re-sort, trusting
    // the cloud's ordering as the source of truth.
    apiFetchMock.mockResolvedValue([RUN_RUNNING, RUN_QUEUED]);

    const { getByTestId } = render(<RehydrationProbe />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() =>
      expect(getByTestId("probe").getAttribute("data-active-run")).toBe(
        "run-live",
      ),
    );
    expect(getByTestId("probe").getAttribute("data-active-campaign")).toBe(
      "42",
    );
    // Hook should hit the dedicated active-runs endpoint, not the
    // campaign-scoped one.
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("/structura/v1/runs/active"),
      }),
    );
  });

  it("does NOT clobber an already-populated activeRunId", async () => {
    // Generate-Now pushed `run-from-mutation` into context (fresh
    // click). Rehydration query resolves LATER with a different
    // server-side row. We must keep the mutation's id as the source
    // of truth — the server list is only the fallback when context
    // is empty.
    apiFetchMock.mockResolvedValue([RUN_RUNNING]);

    const { getByTestId } = render(
      <RehydrationProbe
        initialRun={{ runId: "run-from-mutation", campaignId: 42 }}
      />,
      { wrapper: makeWrapper() },
    );

    // Wait for the query to resolve, then give the rehydration effect
    // one more tick to (incorrectly) try to clobber before asserting.
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(getByTestId("probe").getAttribute("data-active-run")).toBe(
      "run-from-mutation",
    );
  });

  it("stays silent when the active-runs list is empty", async () => {
    // Steady-state "nothing running" case. The hook must not set
    // activeRunId to anything falsy-but-not-null and must not flicker
    // a stale strip on refresh.
    apiFetchMock.mockResolvedValue([]);

    const { getByTestId } = render(<RehydrationProbe />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(getByTestId("probe").getAttribute("data-active-run")).toBe("");
  });
});
