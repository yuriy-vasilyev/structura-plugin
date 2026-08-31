/**
 * GscSummaryCard — the Overview stat row's "Search Clicks" glance card
 * (design handoff gsc_wizard_dashboard, Boards 02–03).
 *
 * The data hook is mocked as the state driver (same approach as
 * SearchPerformanceSection's tests); the delta/number formatting runs the
 * REAL `@structura/ui/search-perf` helpers so plugin/portal parity is
 * exercised. The poll contract is pinned via the exported
 * `gscOverviewPollInterval` (kept real through importOriginal).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const overviewMock = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock("@/features/channels/api/useGscOverviewSummaryQuery", async (importOriginal) => ({
  // Keep gscOverviewPollInterval real — its contract is asserted below.
  ...(await importOriginal<object>()),
  useGscOverviewSummaryQuery: () => overviewMock.current,
}));

import { GscSummaryCard } from "../components/GscSummaryCard";
import { gscOverviewPollInterval } from "@/features/channels/api/useGscOverviewSummaryQuery";
import type { GscOverviewSummaryResponse } from "@/features/channels/types";

/** A settled, successful query result for the given wire payload. */
const settled = (data: GscOverviewSummaryResponse) => ({
  isPending: false,
  isFetching: false,
  isLoading: false,
  isError: false,
  data,
});

const totals = (clicks: number) => ({
  clicks,
  impressions: clicks * 30,
  ctr: 0.03,
  position: 9.2,
});

const ready = (
  over: Partial<GscOverviewSummaryResponse> = {},
): GscOverviewSummaryResponse => ({
  success: true,
  state: "ready",
  property: "sc-domain:acme-blog.com",
  freshThrough: "2026-07-16",
  connectionId: "conn-9",
  totals28: totals(4918),
  prev28: totals(4031),
  opportunityCount: 3,
  topMover: {
    title: "Keyword Clustering: Tools and Workflows",
    url: "https://acme-blog.com/keyword-clustering",
    postId: "101",
    deltaPercent: 31,
  },
  portalReportUrl:
    "https://app.structurawp.com/sites/act-1/search-performance",
  ...over,
});

describe("GscSummaryCard — populated (Board 02)", () => {
  it("renders the overline, formatted clicks value, and an emerald pill on a positive delta", () => {
    overviewMock.current = settled(ready());
    render(<GscSummaryCard />);

    expect(screen.getByText("Search Clicks · 28d")).toBeInTheDocument();
    expect(screen.getByText("4,918")).toBeInTheDocument();
    // 4031 → 4918 = +22%, tone "good" → emerald pill.
    const pill = screen.getByText("+22%");
    expect(pill.className).toContain("bg-emerald-100");
  });

  it("renders the NEUTRAL pill (never red) on a negative delta", () => {
    overviewMock.current = settled(
      ready({ totals28: totals(800), prev28: totals(1000) }),
    );
    render(<GscSummaryCard />);

    const pill = screen.getByText("-20%");
    expect(pill.className).toContain("bg-neutral-100");
    expect(pill.className).not.toContain("emerald");
    expect(pill.className).not.toContain("red");
  });

  it("renders the mono top-mover line as a truncating single line", () => {
    overviewMock.current = settled(ready());
    render(<GscSummaryCard />);

    const mover = screen.getByText(
      "Top mover: “Keyword Clustering: Tools and Workflows” +31%",
    );
    expect(mover.className).toContain("truncate");
    expect(mover.className).toContain("font-mono");
  });

  it("links 'Full report in your customer portal' to the wire's portalReportUrl", () => {
    overviewMock.current = settled(ready());
    render(<GscSummaryCard />);

    const link = screen.getByRole("link", {
      name: /Full report in your customer portal/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://app.structurawp.com/sites/act-1/search-performance",
    );
    // New context from wp-admin.
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("omits the pill when the prior window is too small to be meaningful", () => {
    overviewMock.current = settled(
      ready({ totals28: totals(120), prev28: totals(4), topMover: null }),
    );
    render(<GscSummaryCard />);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).toBeNull();
  });
});

describe("GscSummaryCard — teaser / collecting (Board 03)", () => {
  it("not_connected: one-liner teaser with a Connect link to the channels store", () => {
    overviewMock.current = settled(
      ready({
        state: "not_connected",
        totals28: null,
        prev28: null,
        topMover: null,
        connectionId: undefined,
      }),
    );
    render(<GscSummaryCard />);

    expect(screen.getByText("Search Clicks")).toBeInTheDocument();
    expect(
      screen.getByText("See your posts' Google Search clicks here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Connect/ })).toHaveAttribute(
      "href",
      "#/channels/store",
    );
    // No em-dash, no value, no portal link on the teaser.
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText(/customer portal/)).toBeNull();
  });

  it("property_pending: teaser variant with 'Finish setup' deep-linking the Configure modal", () => {
    overviewMock.current = settled(
      ready({
        state: "property_pending",
        totals28: null,
        prev28: null,
        topMover: null,
      }),
    );
    render(<GscSummaryCard />);

    expect(screen.getByRole("link", { name: /Finish setup/ })).toHaveAttribute(
      "href",
      "#/channels/connections?configure=conn-9",
    );
    expect(screen.queryByRole("link", { name: /^Connect$/ })).toBeNull();
  });

  it("collecting: ready with no rows renders the layout-stable em-dash + lag copy", () => {
    overviewMock.current = settled(
      ready({ totals28: null, prev28: null, topMover: null }),
    );
    render(<GscSummaryCard />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByText("Collecting — first numbers within a couple of days"),
    ).toBeInTheDocument();
  });

  it("collecting: a zero-click window is treated like no data (no false zero)", () => {
    overviewMock.current = settled(
      ready({ totals28: totals(0), prev28: null, topMover: null }),
    );
    render(<GscSummaryCard />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("GscSummaryCard — expired / pulling", () => {
  it("expired: amber one-liner with the pause date and a Reconnect link", () => {
    overviewMock.current = settled(
      ready({ state: "expired", freshThrough: "2026-07-09" }),
    );
    render(<GscSummaryCard />);

    expect(
      screen.getByText(
        "Google connection expired — search stats paused Jul 9, 2026. Your history is safe.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reconnect/ })).toHaveAttribute(
      "href",
      "#/channels/connections",
    );
    // Never the populated stats while the connection is dead.
    expect(screen.queryByText("4,918")).toBeNull();
  });

  it("pulling: renders the skeleton, and the hook contract polls only that state", () => {
    overviewMock.current = settled(
      ready({ state: "pulling", totals28: null, prev28: null, topMover: null }),
    );
    render(<GscSummaryCard />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading search data…")).toBeInTheDocument();
    expect(screen.queryByText(/Collecting/)).toBeNull();

    // Poll contract (gscPollInterval-style): 5s while pulling, off once
    // the state settles.
    expect(gscOverviewPollInterval("pulling")).toBe(5000);
    expect(gscOverviewPollInterval("ready")).toBe(false);
    expect(gscOverviewPollInterval("not_connected")).toBe(false);
    expect(gscOverviewPollInterval("expired")).toBe(false);
    expect(gscOverviewPollInterval(undefined)).toBe(false);
  });

  it("renders nothing while the query is disabled (no usable license) — the row stays 3-up", () => {
    overviewMock.current = {
      isPending: true,
      isFetching: false,
      isLoading: false,
      isError: false,
      data: undefined,
    };
    const { container } = render(<GscSummaryCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
