/**
 * Tests for `<StockSummaryChip>` (Phase 1.6 follow-up).
 *
 * The chip surfaces stock state on the campaign card. Three render
 * branches matter:
 *   - `ready > 0` → positive "{n} ready" pill (green/brand).
 *   - `pending > 0, ready === 0` → "Generating" pill with spinner.
 *   - `total === 0` OR `pregenerationEnabled === false` → nothing.
 *
 * Failed / stale counts are computed but NOT surfaced — those are
 * operator-debugging signals, and stale always has a fresh refill
 * batch behind it (covered by the "Generating" branch implicitly).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@wordpress/api-fetch", () => ({
  default: apiFetchMock,
}));

// useStockSummaryQuery now gates on `useLicense().hasUsableLicense` —
// stub to "bound" so the chip's existing visibility / fetch
// assertions still hold.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { StockSummaryChip } from "../components/StockSummaryChip";

function renderChip(props: {
  campaignId: string | number;
  pregenerationEnabled: boolean;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StockSummaryChip {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("<StockSummaryChip> — visibility gates", () => {
  it("renders nothing when pregenerationEnabled is false (and never fetches)", () => {
    renderChip({ campaignId: "camp_1", pregenerationEnabled: false });
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Generating/i)).not.toBeInTheDocument();
  });

  it("renders nothing when total is 0 (campaign has no stock yet)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      summary: {
        pending: 0,
        ready: 0,
        consumed: 0,
        failed: 0,
        stale: 0,
        total: 0,
      },
    });
    renderChip({ campaignId: "camp_1", pregenerationEnabled: true });
    // Loading state shows nothing too — wait for resolution by polling
    // for absence of "ready" / "Generating" copy across a tick.
    await Promise.resolve();
    expect(screen.queryByText(/ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Generating/i)).not.toBeInTheDocument();
  });
});

describe("<StockSummaryChip> — render branches", () => {
  it("renders '{n} ready' when ready > 0", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      summary: {
        pending: 0,
        ready: 2,
        consumed: 5,
        failed: 0,
        stale: 0,
        total: 7,
      },
    });
    renderChip({ campaignId: "camp_1", pregenerationEnabled: true });
    expect(await screen.findByText(/2 ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/Generating/i)).not.toBeInTheDocument();
  });

  it("renders 'Pre-generating' when pending > 0 and no ready", async () => {
    // Label deliberately uses the same vocabulary as the campaign-
    // edit form's "Pre-generation" toggle so first-time users don't
    // mistake the chip for "publishing a post right now". (Yurii
    // feedback 2026-05-01.)
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      summary: {
        pending: 2,
        ready: 0,
        consumed: 0,
        failed: 0,
        stale: 0,
        total: 2,
      },
    });
    renderChip({ campaignId: "camp_1", pregenerationEnabled: true });
    expect(await screen.findByText("Pre-generating")).toBeInTheDocument();
    expect(screen.queryByText(/ready/i)).not.toBeInTheDocument();
  });

  it("prefers 'ready' over 'Generating' when both are non-zero", async () => {
    // Steady-state: one consumed, one ready, one new batch in flight.
    // The user-facing chip should highlight the *positive* state
    // (next publish is instant) rather than the in-flight refill.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      summary: {
        pending: 2,
        ready: 1,
        consumed: 1,
        failed: 0,
        stale: 0,
        total: 4,
      },
    });
    renderChip({ campaignId: "camp_1", pregenerationEnabled: true });
    expect(await screen.findByText(/1 ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/Generating/i)).not.toBeInTheDocument();
  });

  it("renders nothing when only failed/stale entries remain (operators don't see this in the user-facing chip)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      summary: {
        pending: 0,
        ready: 0,
        consumed: 5,
        failed: 1,
        stale: 1,
        total: 7,
      },
    });
    renderChip({ campaignId: "camp_1", pregenerationEnabled: true });
    await Promise.resolve();
    expect(screen.queryByText(/ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Generating/i)).not.toBeInTheDocument();
  });
});
