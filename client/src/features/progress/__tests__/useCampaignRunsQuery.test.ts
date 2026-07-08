/**
 * Unit tests for the campaign-scoped runs list hook.
 *
 * Pins wire behaviour and the polling cadence that governs the Runs tab:
 *
 *   - Self-gating: a campaignId of 0 or negative disables the fetch
 *     entirely, matching the pattern `useCampaignRunQuery` uses for
 *     nullable runIds. Callers can mount unconditionally.
 *   - Path shape: `/structura/v1/campaigns/{id}/runs?limit={limit}`,
 *     both path segments URL-encoded for safety (a campaign id is
 *     always numeric but we encode to keep the pattern defensible).
 *   - Transport/5xx errors surface as `isError` with no automatic
 *     retry — the Runs tab renders an inline "Couldn't load" card
 *     with an explicit retry button, and silent background retries
 *     would mask cloud-side failures the user should see.
 *   - `meta.silentError` is set so a fetch failure doesn't light up
 *     the global "Data Fetch Error" toast — the tab owns its own
 *     inline error UI.
 *   - Refetch pauses once every row is terminal AND when the list is
 *     empty. Still-running rows keep the 30s poll alive.
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

import { useCampaignRunsQuery } from "../api/useCampaignRunsQuery";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

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

const RUN_SUCCEEDED: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-past",
  campaignId: 42,
  campaignName: "Weekly Digest",
  status: "succeeded",
  currentStep: "done",
  progressPercent: 100,
  headline: "Published.",
  startedAt: "2026-04-21T09:00:00.000Z",
  updatedAt: "2026-04-21T09:02:00.000Z",
  endedAt: "2026-04-21T09:02:00.000Z",
  durationMs: 120_000,
  stepDurationsMs: {},
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCampaignRunsQuery", () => {
  it("does not fetch when campaignId is 0 (self-gates via `enabled`)", async () => {
    renderHook(() => useCampaignRunsQuery(0), { wrapper: makeWrapper() });

    await new Promise((r) => setTimeout(r, 10));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch when campaignId is negative", async () => {
    renderHook(() => useCampaignRunsQuery(-1), { wrapper: makeWrapper() });

    await new Promise((r) => setTimeout(r, 10));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("requests the plugin bridge path with the campaignId and limit encoded", async () => {
    apiFetchMock.mockResolvedValue([RUN_SUCCEEDED]);

    const { result } = renderHook(() => useCampaignRunsQuery(42, 20), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/campaigns/42/runs?limit=20",
    });
  });

  it("surfaces the runs array on success (unwrapped by the plugin bridge)", async () => {
    apiFetchMock.mockResolvedValue([RUN_RUNNING, RUN_SUCCEEDED]);

    const { result } = renderHook(() => useCampaignRunsQuery(42), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].runId).toBe("run-live");
  });

  it("surfaces a fetch failure as isError with no automatic retry", async () => {
    // Cloud-side 5xx, plugin-bridge transport blip, or any other
    // non-2xx: the tab owns the retry affordance, so we fire exactly
    // one request and let the user decide whether to try again.
    apiFetchMock.mockRejectedValue(new Error("cloud_error"));

    const { result } = renderHook(() => useCampaignRunsQuery(42), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("opts out of the global `Data Fetch Error` toast via meta.silentError", async () => {
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

    apiFetchMock.mockRejectedValue(new Error("cloud_error"));

    const { result } = renderHook(() => useCampaignRunsQuery(42), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(globalErrorHandler).not.toHaveBeenCalled();
  });

  it("stops polling once every row is terminal", async () => {
    vi.useFakeTimers();

    apiFetchMock.mockResolvedValue([RUN_SUCCEEDED]);

    const { result } = renderHook(() => useCampaignRunsQuery(42), {
      wrapper: makeWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Advance well past the 30s poll tier — terminal rows must not
    // trigger a second fetch.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not poll when the list is empty (never-run campaign)", async () => {
    vi.useFakeTimers();

    apiFetchMock.mockResolvedValue([]);

    const { result } = renderHook(() => useCampaignRunsQuery(42), {
      wrapper: makeWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps polling on the 30s cadence while any row is non-terminal", async () => {
    vi.useFakeTimers();

    apiFetchMock.mockResolvedValue([RUN_RUNNING, RUN_SUCCEEDED]);

    const { result } = renderHook(() => useCampaignRunsQuery(42), {
      wrapper: makeWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Just past one interval — second poll should fire.
    await vi.advanceTimersByTimeAsync(30_100);
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
