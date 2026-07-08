/**
 * Unit tests for the terminal-status toast broadcaster.
 *
 * What's pinned here is the side-effect contract: when the active
 * run's status flips to a terminal value, we fire exactly one toast
 * via the app's `toast` API (not the removed drawer's custom portal).
 * Non-terminal status ticks don't fire; duplicate polls of the same
 * terminal status don't re-fire; `cancelled` deliberately doesn't fire.
 *
 * The actual toast rendering is owned by `@structura/ui`'s
 * ToastProvider — we only need to confirm the right call shape landed
 * on the `toast` emitter.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { RunStatusSerialized } from "@structura/types";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

// `useCampaignRunQuery` and `useActiveRunsQuery` (mounted indirectly via
// RunsProvider) now consult `useLicense().hasUsableLicense`. Stub to
// "bound" so the polling fetch fires and the terminal-status branch
// these tests pin actually runs.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
vi.mock("@structura/ui", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    toast: {
      success: (...args: unknown[]) => toastSuccess(...args),
      error: (...args: unknown[]) => toastError(...args),
      warning: (...args: unknown[]) => toastWarning(...args),
      info: vi.fn(),
    },
  };
});

import { RunStatusToastHost } from "../RunStatusToastHost";
import { RunsProvider, useRuns } from "../context/RunsContext";

const ActiveRunSetter = ({
  runId,
  campaignId = 42,
}: {
  runId: string | null;
  campaignId?: number;
}) => {
  const { setActiveRun } = useRuns();
  if (runId !== null) {
    queueMicrotask(() => setActiveRun({ runId, campaignId }));
  } else {
    queueMicrotask(() => setActiveRun(null));
  }
  return null;
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(RunsProvider, null, children),
    );
}

const IN_FLIGHT_RUN: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-xyz",
  campaignId: 42,
  campaignName: "Weekly Digest",
  status: "running",
  currentStep: "drafting",
  progressPercent: 37,
  headline: "Writing the draft",
  startedAt: "2026-04-22T12:00:00.000Z",
  updatedAt: "2026-04-22T12:00:30.000Z",
  stepDurationsMs: {},
};

beforeEach(() => {
  apiFetchMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRunStatusToasts", () => {
  it("does not fire a toast while the run is non-terminal", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: IN_FLIGHT_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <RunStatusToastHost />
      </>,
      { wrapper: makeWrapper() },
    );

    // Let the first poll settle. No terminal status → no toast.
    await new Promise((r) => setTimeout(r, 20));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("fires a success toast when the run terminates as succeeded", async () => {
    const succeeded: RunStatusSerialized = {
      ...IN_FLIGHT_RUN,
      status: "succeeded",
      currentStep: "done",
      progressPercent: 100,
      endedAt: "2026-04-22T12:02:00.000Z",
      resultPostUrl: "https://example.com/post-42",
    };
    apiFetchMock.mockResolvedValue({ success: true, run: succeeded });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <RunStatusToastHost />
      </>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    const [message, options] = toastSuccess.mock.calls[0]!;
    expect(message).toBe("Your new post is live.");
    expect(options.title).toContain("Weekly Digest");
    expect(options.action?.label).toBe("View post");
  });

  it("fires an error toast when the run fails and includes the user message", async () => {
    const failed: RunStatusSerialized = {
      ...IN_FLIGHT_RUN,
      status: "failed",
      currentStep: "error",
      progressPercent: 60,
      endedAt: "2026-04-22T12:02:00.000Z",
      error: {
        code: "provider_error",
        userMessage: "AI provider returned an error.",
        logRunId: "log-abc",
      },
    };
    apiFetchMock.mockResolvedValue({ success: true, run: failed });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <RunStatusToastHost />
      </>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0]!;
    expect(message).toBe("AI provider returned an error.");
    expect(options.title).toContain("Weekly Digest");
    expect(options.action?.label).toBe("View details");
    expect(options.duration).toBe(12_000);
  });

  it("fires a warning toast on succeeded_with_warnings", async () => {
    const withWarnings: RunStatusSerialized = {
      ...IN_FLIGHT_RUN,
      status: "succeeded_with_warnings",
      currentStep: "done",
      progressPercent: 100,
      endedAt: "2026-04-22T12:02:00.000Z",
    };
    apiFetchMock.mockResolvedValue({ success: true, run: withWarnings });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <RunStatusToastHost />
      </>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does not fire for cancelled runs", async () => {
    const cancelled: RunStatusSerialized = {
      ...IN_FLIGHT_RUN,
      status: "cancelled",
      currentStep: "error",
      progressPercent: 30,
      endedAt: "2026-04-22T12:02:00.000Z",
    };
    apiFetchMock.mockResolvedValue({ success: true, run: cancelled });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <RunStatusToastHost />
      </>,
      { wrapper: makeWrapper() },
    );

    // Let a handful of polls settle — cancel is user-initiated, so we
    // trust the caller UI to have acknowledged it already; no toast.
    await new Promise((r) => setTimeout(r, 30));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("does not re-fire on repeat polls of the same terminal run", async () => {
    const failed: RunStatusSerialized = {
      ...IN_FLIGHT_RUN,
      status: "failed",
      endedAt: "2026-04-22T12:02:00.000Z",
      error: {
        code: "provider_error",
        userMessage: "AI provider returned an error.",
        logRunId: "log-abc",
      },
    };
    apiFetchMock.mockResolvedValue({ success: true, run: failed });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <RunStatusToastHost />
      </>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    // Fire more poll settles — the dedupe Set should keep the count
    // at exactly one. This is the guard against the old ProgressDrawer
    // bug where every 1s tick on a terminal run re-fired the toast.
    await new Promise((r) => setTimeout(r, 50));
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
