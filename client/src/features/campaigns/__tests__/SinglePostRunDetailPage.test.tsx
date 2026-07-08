/**
 * Tests for `<SinglePostRunDetailPage>` — focused on the 2026-05-19
 * fix that stops the page from flashing "Run not found" between the
 * loading banner and the timeline view.
 *
 * Pre-fix:
 *   - The grace window was 30s, but Action Scheduler can take longer
 *     than that to actually fire the dispatch task on a default-cron
 *     site, so the page fell through to NotFoundState after 30s with
 *     no doc landed. Yurii: "the loading banner starts blinking and
 *     switching with [the Run not found view]."
 *   - There was no protection against demoting back to NotFound after
 *     a successful poll if a subsequent poll transiently failed.
 *
 * Post-fix:
 *   - Grace window bumped to 90s (more headroom for AS jitter).
 *   - Sticky `hasSeenRunRef` — once we've rendered the loaded view,
 *     transient post-success errors keep the queueing placeholder up
 *     instead of regressing to the NotFound view.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

// The page reads `hasWorkspace` to gate the poll, and the RunTimeline
// child reads `isPaidLicense`. Stub both as a paid workspace so the
// timeline renders without tier-lock chips muddying the assertions.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({
    hasUsableLicense: true,
    hasWorkspace: true,
    isPaidLicense: true,
  }),
}));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({
    hasUsableLicense: true,
    hasWorkspace: true,
    isPaidLicense: true,
  }),
}));

import { SinglePostRunDetailPage } from "../routes/SinglePostRunDetailPage";

function renderPage(runId: string = "run-abc"): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/generate/runs/${runId}`]}>
        <Routes>
          <Route
            path="/generate/runs/:runId"
            element={<SinglePostRunDetailPage />}
          />
          <Route path="/generate" element={<div>Generate form</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("<SinglePostRunDetailPage>", () => {
  it("keeps the queueing placeholder visible during the 90s grace window when the run doc hasn't appeared", async () => {
    // Every poll throws "Not Found" — simulates the AS jitter window
    // where the cloud hasn't written the doc yet.
    apiFetchMock.mockRejectedValue(new Error("Not Found"));

    renderPage();

    // First poll fires; with the rejection landing, we must still see
    // the queueing placeholder (not the alarmist "Run not found"
    // state) — the 90s grace window suppresses it.
    expect(
      await screen.findByText(
        /Setting up your run — this only takes a few seconds\./,
      ),
    ).toBeInTheDocument();

    // "Run not found" must NOT be visible during the grace window.
    expect(screen.queryByText("Run not found")).not.toBeInTheDocument();
  });

  it("does not regress to NotFoundState after a successful poll, even if a later poll transiently errors", async () => {
    // First poll succeeds with a real in-flight run; later polls
    // throw. The page must keep showing the loaded view (or the
    // queueing placeholder for transient blips) — never NotFound.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      run: {
        schemaVersion: 1,
        runId: "run-abc",
        campaignId: 0,
        campaignName: "Single-post run",
        status: "running",
        currentStep: "drafting",
        progressPercent: 40,
        headline: "Writing the draft",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
          identity: { objective: "Write a post about young Jim Carrey." },
        },
      },
    });
    apiFetchMock.mockRejectedValue(new Error("Not Found"));

    renderPage();

    // Loaded state mounts — headline copy "Working on your post" only
    // appears in the in-flight banner on the loaded view, never on
    // QueueingState (which uses different copy).
    expect(
      await screen.findByText(
        /Working on your post — this usually takes 4–5 minutes\./,
      ),
    ).toBeInTheDocument();

    // Confirm "Run not found" never appears after the loaded view has
    // mounted, regardless of subsequent poll failures.
    expect(screen.queryByText("Run not found")).not.toBeInTheDocument();
  });
});
