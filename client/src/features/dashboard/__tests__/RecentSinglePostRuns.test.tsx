/**
 * Render-branch tests for the dashboard "Recent generations" widget.
 *
 * We pin:
 *   - empty list → widget renders nothing (self-hide contract — same
 *     posture as NeedsAttentionWidget so the Overview stays clean for
 *     users who haven't engaged with `/generate` yet).
 *   - loading → no widget (avoid pop-in on first paint).
 *   - rows render in the order returned by the cloud (newest-first
 *     shape is the cloud's responsibility; we just don't reorder).
 *   - row title falls back to inputSnapshot.identity.objective when
 *     present, and to the i18n fallback otherwise.
 *   - row links to /generate/runs/{runId} so the persistent receipt
 *     contract holds.
 *   - terminal-status rows produce the right badge label.
 *
 * Polling cadence + invalidation behavior are exercised in the query-
 * hook layer; this file is purely about rendering.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunStatusSerialized } from "@structura/types";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

// useSinglePostRunsQuery now gates on `useLicense().hasUsableLicense` —
// stub to "bound" so the widget's fetch fires and the rendering
// assertions in this file still hold.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { RecentSinglePostRuns } from "../components/RecentSinglePostRuns";

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mountWidget() {
  render(
    <Providers>
      <RecentSinglePostRuns />
    </Providers>,
  );
}

function makeRun(
  overrides: Partial<RunStatusSerialized> & {
    inputSnapshot?: Record<string, unknown>;
  },
): RunStatusSerialized {
  return {
    schemaVersion: 1,
    runId: overrides.runId ?? "run-1",
    campaignId: overrides.campaignId ?? "ephemeral-camp",
    campaignName: overrides.campaignName ?? "",
    status: overrides.status ?? "succeeded",
    currentStep: "complete",
    progressPercent: 100,
    headline: "All done",
    stepDurationsMs: {},
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ...overrides,
  } as RunStatusSerialized;
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("RecentSinglePostRuns", () => {
  it("renders nothing when the cloud returns an empty list", async () => {
    apiFetchMock.mockResolvedValueOnce([]);
    mountWidget();
    // Wait for the query to settle, then assert the widget didn't render.
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByText("Recent Generations")).not.toBeInTheDocument();
  });

  it("renders nothing while the query is loading", () => {
    // Never resolves — exercises the isLoading branch.
    apiFetchMock.mockReturnValueOnce(new Promise(() => {}));
    mountWidget();
    expect(screen.queryByText("Recent Generations")).not.toBeInTheDocument();
  });

  it("renders rows newest-first and links to /generate/runs/{runId}", async () => {
    apiFetchMock.mockResolvedValueOnce([
      makeRun({
        runId: "run-aaa",
        status: "succeeded",
        inputSnapshot: {
          identity: { objective: "Why our espresso machine wins" },
        },
      }),
      makeRun({
        runId: "run-bbb",
        status: "running",
        headline: "Drafting your post…",
        // No snapshot → fallback title path.
      }),
    ]);

    mountWidget();

    await waitFor(() => {
      expect(screen.getByText("Recent Generations")).toBeInTheDocument();
    });

    // Snapshot-derived title and fallback both render.
    expect(
      screen.getByText("Why our espresso machine wins"),
    ).toBeInTheDocument();
    expect(screen.getByText("Single-post generation")).toBeInTheDocument();

    // Each row links to the persistent receipt URL.
    const rowLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/generate/runs/"));
    expect(rowLinks).toHaveLength(2);
    expect(rowLinks[0].getAttribute("href")).toBe("/generate/runs/run-aaa");
    expect(rowLinks[1].getAttribute("href")).toBe("/generate/runs/run-bbb");
  });

  it("renders the right badge for each terminal status", async () => {
    apiFetchMock.mockResolvedValueOnce([
      makeRun({ runId: "ok", status: "succeeded" }),
      makeRun({ runId: "warn", status: "succeeded_with_warnings" }),
      makeRun({ runId: "boom", status: "failed" }),
      makeRun({ runId: "stop", status: "cancelled" }),
      makeRun({ runId: "wip", status: "running" }),
    ]);

    mountWidget();

    await waitFor(() => {
      expect(screen.getByText("Recent Generations")).toBeInTheDocument();
    });

    // Two "Done" rows (succeeded + succeeded_with_warnings collapse
    // into the same green badge so the dashboard reads at a glance).
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("trims an objective longer than 80 chars with an ellipsis", async () => {
    const longObjective = "x".repeat(120);
    apiFetchMock.mockResolvedValueOnce([
      makeRun({
        runId: "trim",
        status: "succeeded",
        inputSnapshot: { identity: { objective: longObjective } },
      }),
    ]);

    mountWidget();

    await waitFor(() => {
      expect(screen.getByText("Recent Generations")).toBeInTheDocument();
    });

    // 77 chars + ellipsis. We don't pin the exact slice index — the
    // assertion that matters is "truncated at all and ends with …".
    const title = screen.getByText(/x{20,}…$/);
    expect(title.textContent?.endsWith("…")).toBe(true);
    expect(title.textContent!.length).toBeLessThan(longObjective.length);
  });
});
