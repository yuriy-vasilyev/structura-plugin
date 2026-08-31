/**
 * RunDetailPage (campaign run receipt) — Search performance mount gate.
 *
 * Mirrors the SinglePostRunDetailPage gate tests: the GSC section renders
 * only when the run produced a LIVE post (`resultPostUrl` + a published
 * `outputs.post.status`; absent status = legacy runs = treated as
 * published per the §10 back-compat default). Section states themselves
 * are covered in features/channels/__tests__/SearchPerformanceSection.test.tsx.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

vi.mock("react-router", () => ({
  useParams: () => ({ runId: "run-1" }),
  Link: ({ children, ...p }: { children?: unknown } & Record<string, unknown>) => (
    <a {...(p as Record<string, never>)}>{children as never}</a>
  ),
}));

const runQueryMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../../api/useCampaignRunQuery", () => ({
  useCampaignRunQuery: () => runQueryMock.current,
}));

vi.mock("@/features/personas", () => ({
  usePersonasQuery: () => ({ data: [] }),
}));

vi.mock("../../components/RunTimeline", () => ({
  RunTimeline: () => <div>timeline</div>,
}));
vi.mock("@/components/Layout/PageContainer", () => ({
  PageContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));
vi.mock("@/components/Layout/PageTitle", () => ({
  PageTitle: ({ children }: { children?: unknown }) => <h1>{children as never}</h1>,
}));
vi.mock("@structura/ui", () => ({
  Badge: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
  Button: ({ children, ...p }: { children?: unknown } & Record<string, unknown>) => (
    <button {...(p as Record<string, never>)}>{children as never}</button>
  ),
  PageLoader: ({ label }: { label?: string }) => <div>{label}</div>,
  cn: (...a: unknown[]) => a.filter(Boolean).join(" "),
}));

vi.mock("@/features/channels/components/SearchPerformanceSection", () => ({
  SearchPerformanceSection: ({ pageUrl }: { pageUrl: string }) => (
    <div data-testid="search-perf-section" data-page-url={pageUrl} />
  ),
}));

import { RunDetailPage } from "../RunDetailPage";

const makeRun = (over: Record<string, unknown>) => ({
  data: {
    run: {
      runId: "run-1",
      campaignId: "c1",
      campaignName: "Low-carb cooking",
      status: "succeeded",
      currentStep: "done",
      progressPercent: 100,
      headline: "",
      startedAt: "2026-07-17T10:00:00Z",
      updatedAt: "2026-07-17T10:05:00Z",
      endedAt: "2026-07-17T10:05:00Z",
      durationMs: 300000,
      stepDurationsMs: {},
      resultPostUrl: "https://site.test/hello",
      outputs: { post: { id: 42, url: "https://site.test/hello", status: "publish" } },
      ...over,
    },
  },
  isError: false,
  isLoading: false,
});

describe("RunDetailPage — Search performance gate", () => {
  it("mounts the section (with the post permalink) for a published run", () => {
    runQueryMock.current = makeRun({});
    render(<RunDetailPage />);

    const section = screen.getByTestId("search-perf-section");
    expect(section).toHaveAttribute("data-page-url", "https://site.test/hello");
  });

  it("hides the section when the produced post is a draft", () => {
    runQueryMock.current = makeRun({
      outputs: { post: { id: 42, status: "draft" } },
    });
    render(<RunDetailPage />);
    expect(screen.queryByTestId("search-perf-section")).toBeNull();
  });

  it("hides the section when the run has no resultPostUrl", () => {
    runQueryMock.current = makeRun({ resultPostUrl: undefined, outputs: undefined });
    render(<RunDetailPage />);
    expect(screen.queryByTestId("search-perf-section")).toBeNull();
  });

  it("hides the section for a failed run", () => {
    runQueryMock.current = makeRun({
      status: "failed",
      resultPostUrl: undefined,
      outputs: undefined,
      error: { code: "x" },
    });
    render(<RunDetailPage />);
    expect(screen.queryByTestId("search-perf-section")).toBeNull();
  });

  it("treats a legacy run (no outputs snapshot) with a permalink as published", () => {
    runQueryMock.current = makeRun({ outputs: undefined });
    render(<RunDetailPage />);
    expect(screen.getByTestId("search-perf-section")).toBeInTheDocument();
  });
});
