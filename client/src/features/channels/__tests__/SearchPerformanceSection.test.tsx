/**
 * SearchPerformanceSection — per-state rendering of the run-receipt GSC
 * section (design handoff Boards 10/11, 2026-07-18 slice).
 *
 * The data hook is mocked directly (same approach as the other channel
 * component tests) so each state can be driven cheaply; the number
 * formatting goes through the REAL `@structura/ui/search-perf` helpers
 * so plugin/portal formatting parity is exercised, not stubbed.
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

const statsMock = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock("../api/useGscPostStatsQuery", () => ({
  useGscPostStatsQuery: () => statsMock.current,
}));

import { SearchPerformanceSection } from "../components/SearchPerformanceSection";
import type { GscMetricTotals, GscPostStatsResponse } from "../types";

const PAGE_URL = "https://site.test/hello-world";

/** A settled, successful query result for the given wire payload. */
const settled = (data: GscPostStatsResponse) => ({
  isPending: false,
  isFetching: false,
  isLoading: false,
  isError: false,
  data,
  refetch: vi.fn(),
});

const totals = (over: Partial<GscMetricTotals> = {}): GscMetricTotals => ({
  clicks: 1284,
  impressions: 48912,
  ctr: 0.026,
  position: 8.4,
  ...over,
});

const populatedPage = () => ({
  url: PAGE_URL,
  last28: { clicks: 1284, impressions: 48912, ctr: 0.026, position: 8.4 },
  prev28: { clicks: 1088, impressions: 43671, ctr: 0.025, position: 10.5 },
  series: [
    { d: "2026-07-10", clicks: 10, impressions: 300, position: 9 },
    { d: "2026-07-11", clicks: 24, impressions: 410, position: 8.6 },
    { d: "2026-07-12", clicks: 18, impressions: 380, position: 8.4 },
  ],
  // Wire order is by impressions; the section must re-cut by clicks and
  // show only the top 3 — "seo landing page templates" (4th by clicks)
  // must NOT render.
  topQueries: [
    { q: "programmatic seo examples", clicks: 188, impressions: 9100, position: 7.8 },
    { q: "programmatic seo for saas", clicks: 412, impressions: 8300, position: 3.2 },
    { q: "keyword clustering tools", clicks: 96, impressions: 4200, position: 9.1 },
    { q: "seo landing page templates", clicks: 54, impressions: 3900, position: 8.4 },
  ],
  indexState: "unknown",
});

const ready = (over: Partial<GscPostStatsResponse> = {}): GscPostStatsResponse => ({
  success: true,
  state: "ready",
  property: "sc-domain:site.test",
  freshThrough: "2026-07-16",
  page: populatedPage(),
  ...over,
});

const daysAgoIso = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe("SearchPerformanceSection — populated (Board 10)", () => {
  it("renders the heading, all 4 stats, 3 query rows, and the freshness cue", () => {
    statsMock.current = settled(ready());
    render(<SearchPerformanceSection pageUrl={PAGE_URL} publishedAt={daysAgoIso(40)} />);

    expect(
      screen.getByRole("heading", { name: "Search performance · last 28 days" }),
    ).toBeInTheDocument();

    // 4 stat tiles with formatted values (shared search-perf helpers).
    expect(screen.getByText("Clicks")).toBeInTheDocument();
    expect(screen.getByText("1,284")).toBeInTheDocument();
    expect(screen.getByText("Impressions")).toBeInTheDocument();
    expect(screen.getByText("48.9K")).toBeInTheDocument(); // compact ≥10k
    expect(screen.getByText("CTR")).toBeInTheDocument();
    expect(screen.getByText("2.6%")).toBeInTheDocument();
    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("8.4")).toBeInTheDocument();

    // Top 3 queries by CLICKS, not the wire's impressions order.
    expect(screen.getByText("Top queries")).toBeInTheDocument();
    expect(screen.getByText("programmatic seo for saas")).toBeInTheDocument();
    expect(screen.getByText("programmatic seo examples")).toBeInTheDocument();
    expect(screen.getByText("keyword clustering tools")).toBeInTheDocument();
    expect(screen.queryByText("seo landing page templates")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    // Freshness cue with the localized date.
    expect(
      screen.getByText("Data through Jul 16, 2026 · Google reports lag ~2 days"),
    ).toBeInTheDocument();

    // Decorative clicks sparkline is present but hidden from AT.
    expect(screen.getByTestId("gsc-clicks-sparkline")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders the position delta as words — 'better', never a signed green number", () => {
    // prev 10.5 → last 8.4 = moved up 2.1 positions.
    statsMock.current = settled(ready());
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);
    expect(screen.getByText("2.1 better")).toBeInTheDocument();
  });

  it("renders 'worse' when the average position dropped", () => {
    const page = populatedPage();
    page.last28 = totals({ position: 10.5 });
    page.prev28 = totals({ position: 8.4 });
    statsMock.current = settled(ready({ page }));
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);
    expect(screen.getByText("2.1 worse")).toBeInTheDocument();
  });

  it("omits the index badge entirely (only 'unknown' exists this slice)", () => {
    statsMock.current = settled(ready());
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);
    expect(screen.queryByText(/index/i)).toBeNull();
  });
});

describe("SearchPerformanceSection — not connected / expired (Board 11)", () => {
  it("not_connected: one-row teaser with a Connect CTA linking to the channels store", () => {
    statsMock.current = settled({
      success: true,
      state: "not_connected",
      page: null,
    });
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);

    expect(
      screen.getByText("See this post's Google Search clicks and queries here."),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Connect Search Console/ });
    expect(cta).toHaveAttribute("href", "#/channels/store");
    // Quiet row — no stat grid, no dead zeros.
    expect(screen.queryByText("Clicks")).toBeNull();
  });

  it("expired: amber one-liner naming the pause date, with a Reconnect CTA", () => {
    statsMock.current = settled({
      success: true,
      state: "expired",
      freshThrough: "2026-07-09",
      // Expired still carries last-known page data — the plugin variant
      // deliberately shows only the one-liner (Board 11), not the stats.
      page: populatedPage(),
    });
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);

    expect(
      screen.getByText(
        "Google connection expired — search stats paused Jul 9, 2026. Your history is safe.",
      ),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Reconnect/ });
    expect(cta).toHaveAttribute("href", "#/channels/connections");
    expect(screen.queryByText("1,284")).toBeNull();
  });
});

describe("SearchPerformanceSection — collecting / zero / pulling", () => {
  it("shows the collecting one-liner for a freshly published post with no data", () => {
    statsMock.current = settled(ready({ page: null }));
    render(
      <SearchPerformanceSection pageUrl={PAGE_URL} publishedAt={daysAgoIso(1)} />,
    );
    expect(
      screen.getByText(
        "Collecting search data — Google reports lag about 2 days. First numbers usually appear within a few days of publishing.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the honest zero state for an older post with no data", () => {
    statsMock.current = settled(ready({ page: null }));
    render(
      <SearchPerformanceSection pageUrl={PAGE_URL} publishedAt={daysAgoIso(30)} />,
    );
    expect(
      screen.getByText(
        "No search traffic yet — that's normal, most posts take a few weeks to start ranking. We check every day.",
      ),
    ).toBeInTheDocument();
    // Never a dead grid of zero-value tiles (handoff Board 05 rule).
    expect(screen.queryByText("Clicks")).toBeNull();
  });

  it("treats zero impressions in the window like no data (no zero-value tiles)", () => {
    const page = populatedPage();
    page.last28 = totals({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
    statsMock.current = settled(ready({ page }));
    render(
      <SearchPerformanceSection pageUrl={PAGE_URL} publishedAt={daysAgoIso(30)} />,
    );
    expect(screen.getByText(/No search traffic yet/)).toBeInTheDocument();
    expect(screen.queryByText("Clicks")).toBeNull();
  });

  it("shows the skeleton while the first mirror pull runs (state=pulling ≠ collecting)", () => {
    statsMock.current = settled({
      success: true,
      state: "pulling",
      page: null,
    });
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading search data…")).toBeInTheDocument();
    expect(screen.queryByText(/Collecting search data/)).toBeNull();
  });

  it("renders nothing while the query is disabled (no usable license)", () => {
    statsMock.current = {
      isPending: true,
      isFetching: false,
      isLoading: false,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    };
    const { container } = render(<SearchPerformanceSection pageUrl={PAGE_URL} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("property pending", () => {
  // formulafoundry.io 2026-07-18: post-OAuth with zero usable properties
  // must route to the Configure picker, never re-offer OAuth.
  it("links to the channels Configure modal with the connection id", () => {
    statsMock.current = settled({
      success: true,
      state: "property_pending",
      connectionId: "conn-9",
      page: null,
    });
    render(<SearchPerformanceSection pageUrl={PAGE_URL} />);
    expect(
      screen.getByText(/one step left: choose the property/i),
    ).toBeInTheDocument();
    const btn = screen.getByRole("link", { name: /choose property/i });
    expect(btn).toHaveAttribute(
      "href",
      "#/channels/connections?configure=conn-9",
    );
    expect(
      screen.queryByText(/connect search console/i),
    ).not.toBeInTheDocument();
  });
});
