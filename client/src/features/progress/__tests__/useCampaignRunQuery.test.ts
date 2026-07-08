/**
 * Unit tests for the progress-stream poll hook.
 *
 * What's pinned here is the *wire* behaviour — the hook is the only
 * piece that talks to the plugin REST bridge, so these tests cover:
 *
 *   - The hook self-gates on `runId` — no fetch when null. This is the
 *     contract both `CampaignRunProgress` (inline strip) and
 *     `RunStatusToastHost` (global toast broadcaster) rely on to mount
 *     unconditionally at their respective sites.
 *   - Path format: `/structura/v1/runs/{encodeURIComponent(runId)}`.
 *   - 404 / kill-switch errors surface as `isError` with no retry (spec
 *     §7.3: TTL and kill-switch are both non-recoverable).
 *   - Terminal status stops polling — no call after the 5s slow-tier
 *     interval elapses.
 *   - Non-terminal status keeps polling on the 1s cadence.
 *
 * The 60s back-off cutover (1s → 5s when the run hasn't ticked in a
 * minute) is pinned via system-clock mocking in the last test.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { RunStatusSerialized } from "@structura/types";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

// The hook now consults `useLicense().hasUsableLicense` to gate the
// cloud-bound fetch. Stub to "license bound" so existing assertions
// (path shape, polling cadence, etc.) still observe the fetch firing.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { useCampaignRunQuery } from "../api/useCampaignRunQuery";

function makeWrapper() {
  // retry:false so a rejection surfaces as `isError` without the
  // query-level retry budget. The hook itself also sets `retry:false`;
  // this is belt-and-braces so a future hook refactor that drops that
  // flag doesn't silently hide regressions in this file.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const BASE_RUN: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-xyz",
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

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  // Each test opts into fake timers individually; restore real ones
  // between tests so an earlier failure doesn't leak into a later one.
  vi.useRealTimers();
});

describe("useCampaignRunQuery", () => {
  it("does not fetch when runId is null (self-gates via `enabled`)", async () => {
    renderHook(() => useCampaignRunQuery(null), { wrapper: makeWrapper() });

    // Give React's scheduler a tick to flush — this is enough for a
    // would-be fetch to have fired if `enabled` was broken.
    await new Promise((r) => setTimeout(r, 10));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("requests the plugin bridge path with the runId URL-encoded", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });

    const { result } = renderHook(
      // The `/` in a pathological runId must be percent-encoded or the
      // WP REST router mis-parses the URL as a different route.
      () => useCampaignRunQuery("run/xyz"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/runs/run%2Fxyz",
    });
  });

  it("surfaces the run document on success", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });

    const { result } = renderHook(() => useCampaignRunQuery("run-xyz"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.run.runId).toBe("run-xyz");
    expect(result.current.data?.run.status).toBe("running");
  });

  it("treats a 404 / TTL'd doc as a terminal error — no retries, isError is true", async () => {
    // The plugin returns 404 when the doc has TTL'd (24h post-terminal)
    // or when the feature flag is kill-switched mid-run. Neither can
    // recover, so retrying just burns REST calls.
    apiFetchMock.mockRejectedValue(new Error("Not Found"));

    const { result } = renderHook(() => useCampaignRunQuery("run-xyz"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    // Exactly one call — if retry was re-introduced this would be 4.
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("opts out of the global `Data Fetch Error` toast via meta.silentError", async () => {
    // Regression guard: the drawer's own receipt UI is the single source
    // of truth for poll failures (TTL'd docs, the brief window before
    // Action Scheduler fires the cloud dispatcher). Without this opt-out,
    // every 1s poll during that window becomes a red toast. We mirror
    // the production QueryCache wiring (index.tsx) so the spy only runs
    // when `silentError` is absent — if the flag is ever dropped from
    // the hook, this test fails.
    const globalErrorHandler = vi.fn();
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (query.meta?.silentError) return;
          globalErrorHandler(error);
        },
      }),
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    apiFetchMock.mockRejectedValue(new Error("run_not_found"));

    const { result } = renderHook(() => useCampaignRunQuery("run-xyz"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    // The error was observed by the query (isError === true) but the
    // global toast handler must NOT have fired.
    expect(globalErrorHandler).not.toHaveBeenCalled();
  });

  it("stops polling once the run reaches a terminal status", async () => {
    vi.useFakeTimers();

    // First poll lands with a terminal `succeeded` status. `refetchInterval`
    // returns `false` for terminal statuses, which tells React Query to
    // tear down the interval — no further calls, ever.
    const succeeded: RunStatusSerialized = {
      ...BASE_RUN,
      status: "succeeded",
      currentStep: "done",
      progressPercent: 100,
      durationMs: 120_000,
      endedAt: "2026-04-22T12:02:00.000Z",
    };
    apiFetchMock.mockResolvedValue({ success: true, run: succeeded });

    const { result } = renderHook(() => useCampaignRunQuery("run-xyz"), {
      wrapper: makeWrapper(),
    });

    // Flush the initial fetch. `waitFor` in RTL plays nicely with fake
    // timers as long as the underlying promise microtask can resolve —
    // it polls on real microtasks, not on the fake timer queue.
    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Advance well past both poll tiers (1s fast, 5s slow) — even the
    // slow tier should never fire for a terminal run.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps polling on the fast (1s) cadence while the run is non-terminal and fresh", async () => {
    vi.useFakeTimers();
    // Pin "now" to just after the fixture's `updatedAt` so the 60s
    // back-off check reads as fresh.
    vi.setSystemTime(new Date("2026-04-22T12:00:35.000Z"));

    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });

    const { result } = renderHook(() => useCampaignRunQuery("run-xyz"), {
      wrapper: makeWrapper(),
    });

    // First poll.
    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Advance one fast-tier interval; expect a second poll.
    await vi.advanceTimersByTimeAsync(1_100);
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });

    // And one more — proves the interval re-arms rather than firing
    // exactly once.
    await vi.advanceTimersByTimeAsync(1_100);
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("drops to the slow (5s) cadence once the run hasn't ticked for >60s", async () => {
    vi.useFakeTimers();
    // Pin "now" to >60s after the fixture's `updatedAt` so the back-off
    // branch is taken on every refetchInterval evaluation. Spec §7.3.
    vi.setSystemTime(new Date("2026-04-22T12:02:00.000Z"));

    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });

    const { result } = renderHook(() => useCampaignRunQuery("run-xyz"), {
      wrapper: makeWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // 1.2s passes — with the slow tier engaged this is NOT enough for
    // a re-poll (slow tier is 5s). If this fires, the 60s back-off is
    // broken.
    await vi.advanceTimersByTimeAsync(1_200);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // 5s+ passes — now the slow tier should fire.
    await vi.advanceTimersByTimeAsync(5_100);
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
