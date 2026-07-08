/**
 * Unit tests for the Campaign detail "Runs" tab.
 *
 * What's pinned here is the render-branch contract — the tab owns three
 * distinct UI states and the loading spinner, so a future refactor that
 * silently conflates them (e.g. a blank panel on a fetch failure
 * instead of the explicit "Couldn't load" copy) is the regression we
 * want to catch:
 *
 *   - Empty state: "No runs recorded for this campaign yet." + the
 *     follow-up copy that tells the user what will make a row appear.
 *   - Error state: transport blip / plugin-bridge 5xx / cloud-side
 *     500 → "Couldn't load run history" panel with a "Try again"
 *     button, NOT an empty list. Previously this branch was labelled
 *     "Progress history is disabled" for the progress-stream
 *     kill-switch; the flag was removed on 2026-04-22 and the only
 *     way into this branch now is a genuine fetch failure.
 *   - Populated state: one row per run, status chip reflects each
 *     run's status, failed rows expose the inline user-facing error
 *     message (spec: "Status + time range + error message on failure").
 *
 * The hook itself is covered by `useCampaignRunsQuery.test.ts`; these
 * tests mock it to keep the UI assertions focused.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RunStatusSerialized } from "@structura/types";

// Hook is swapped at module scope so each test can script its own return
// value. Matches the pattern used by `NeedsAttentionWidget.test.tsx`
// where the point is the UI's branching, not the hook's wire behaviour.
const useCampaignRunsQueryMock = vi.fn();
vi.mock("@/features/progress/api/useCampaignRunsQuery", () => ({
  useCampaignRunsQuery: (...args: unknown[]) => useCampaignRunsQueryMock(...args),
}));

import { CampaignRunsTab } from "../components/CampaignRunsTab";

const BASE_RUN: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-xyz",
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
  useCampaignRunsQueryMock.mockReset();
});

describe("CampaignRunsTab", () => {
  it("renders the empty state when the campaign has no runs yet", () => {
    useCampaignRunsQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<CampaignRunsTab campaignId={42} />);

    // Empty-state headline AND the follow-up copy that explains what
    // will make a row appear — dropping either of them would make the
    // state feel accidentally blank.
    expect(
      screen.getByText("No runs recorded for this campaign yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will appear here the next time/i),
    ).toBeInTheDocument();
  });

  it("renders the fetch-failure panel with a retry button on isError", () => {
    const refetch = vi.fn();
    useCampaignRunsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
      isFetching: false,
    });

    render(<CampaignRunsTab campaignId={42} />);

    // Explicit "we tried to load, it failed, here's how to recover"
    // messaging — this is the state a support screenshot needs to
    // distinguish from "empty" so we can triage correctly. We used to
    // label this "Run history unavailable / progress history is
    // disabled" because the only way to reach `isError` was the
    // progress-stream kill-switch; the flag was removed on 2026-04-22
    // and that copy now masked real incidents as "feature off".
    expect(
      screen.getByText(/couldn.?t load run history/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    // Empty-state copy MUST NOT leak through when isError is true.
    expect(
      screen.queryByText(/no runs recorded/i),
    ).not.toBeInTheDocument();
  });

  it("invokes refetch when the user clicks the Try again button", async () => {
    const refetch = vi.fn();
    useCampaignRunsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
      isFetching: false,
    });

    const { getByRole } = render(<CampaignRunsTab campaignId={42} />);
    // Keep the interaction lightweight — we don't need userEvent here,
    // just that the button is wired to refetch. A heavier user-event
    // roundtrip wouldn't buy additional coverage.
    getByRole("button", { name: /try again/i }).click();

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders one row per run with the status chip", () => {
    useCampaignRunsQueryMock.mockReturnValue({
      data: [
        { ...BASE_RUN, runId: "run-1", status: "succeeded" },
        { ...BASE_RUN, runId: "run-2", status: "running", endedAt: undefined },
      ] satisfies RunStatusSerialized[],
      isLoading: false,
      isError: false,
    });

    render(<CampaignRunsTab campaignId={42} />);

    // Status chips — two rows, two distinct statuses.
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("rows link to the run detail page via a hash route", () => {
    useCampaignRunsQueryMock.mockReturnValue({
      data: [{ ...BASE_RUN, runId: "run-xyz" }] satisfies RunStatusSerialized[],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<CampaignRunsTab campaignId={42} />);

    // The row is an anchor — the href lets middle-clickers open in a
    // new tab and is how the keyboard user triggers navigation.
    const rowLink = container.querySelector(
      'a[href="#/runs/run-xyz"]',
    );
    expect(rowLink).not.toBeNull();
  });

  it("shows the inline failure message for a failed run", () => {
    useCampaignRunsQueryMock.mockReturnValue({
      data: [
        {
          ...BASE_RUN,
          runId: "run-failed",
          status: "failed",
          error: {
            code: "provider_error",
            userMessage: "OpenAI declined the request — check billing.",
            logRunId: "log-1",
          },
        },
      ] satisfies RunStatusSerialized[],
      isLoading: false,
      isError: false,
    });

    render(<CampaignRunsTab campaignId={42} />);

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    // Inline user-facing message must land on the failed row so the
    // user doesn't have to drill into the detail page to understand
    // a red row (per the AskUserQuestion answer selected for this
    // slice: "Status + time range + error message on failure").
    expect(
      screen.getByText("OpenAI declined the request — check billing."),
    ).toBeInTheDocument();
  });

  it("does not show an inline message for succeeded-with-warnings rows", () => {
    useCampaignRunsQueryMock.mockReturnValue({
      data: [
        {
          ...BASE_RUN,
          runId: "run-warn",
          status: "succeeded_with_warnings",
          error: {
            code: "channel_failed",
            userMessage: "Slack delivery failed.",
            logRunId: "log-2",
          },
        },
      ] satisfies RunStatusSerialized[],
      isLoading: false,
      isError: false,
    });

    render(<CampaignRunsTab campaignId={42} />);

    // Warning detail lives on the detail page, not the tab row — the
    // row is green on purpose. A warning inline here would read as
    // "stopped" and confuse triage.
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(
      screen.queryByText("Slack delivery failed."),
    ).not.toBeInTheDocument();
  });

  it("shows the count in the toolbar header when runs exist", () => {
    useCampaignRunsQueryMock.mockReturnValue({
      data: [
        { ...BASE_RUN, runId: "r1" },
        { ...BASE_RUN, runId: "r2" },
        { ...BASE_RUN, runId: "r3" },
      ] satisfies RunStatusSerialized[],
      isLoading: false,
      isError: false,
    });

    render(<CampaignRunsTab campaignId={42} />);

    // "3 runs" in the toolbar — mirrors the PostsTab pattern so the
    // two tabs feel like siblings at the header level too.
    expect(screen.getByText("3 runs")).toBeInTheDocument();
  });
});
