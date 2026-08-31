/**
 * SinglePostRunDetailPage — Search performance section mount gate.
 *
 * The GSC section must render ONLY for runs that produced a LIVE post
 * (design handoff Board 10): a draft has no crawled permalink, so the
 * section would only ever show empty states. Same mocking scaffold as
 * SinglePostRunDetailResult.test.tsx; the section itself is stubbed —
 * its states are covered by
 * features/channels/__tests__/SearchPerformanceSection.test.tsx.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

vi.mock("react-router", () => ({
  useParams: () => ({ runId: "run-1" }),
  useNavigate: () => vi.fn(),
  Link: ({ children, ...p }: { children?: unknown } & Record<string, unknown>) => (
    <a {...(p as Record<string, never>)}>{children as never}</a>
  ),
}));

const runQueryMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/progress/api/useCampaignRunQuery", () => ({
  useCampaignRunQuery: () => runQueryMock.current,
}));

vi.mock("@/features/campaigns/api/useCampaignMutations", () => ({
  useCampaignMutations: () => ({ generatePost: vi.fn(), isGenerating: false }),
}));

// The page resolves model slugs → friendly names via this react-query hook
// (added with the Run-again provider/model rows). This suite renders the page
// without a QueryClient, and the search-perf gate under test doesn't touch the
// model catalog — mock the hook at the edge, matching the other hook mocks here.
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({ data: undefined }),
}));

// The Run-again confirm dialog is peripheral to the search-perf gate under
// test and pulls in `Dialog`/`getProviderLogo` from `@structura/ui` (which
// this suite mocks down to a few primitives). Stub it out like the other
// peripheral components above so the test stays focused and doesn't break as
// the dialog's UI deps grow.
vi.mock("@/features/campaigns/components/RunAgainConfirmDialog", () => ({
  RunAgainConfirmDialog: () => null,
}));

vi.mock("@/features/progress/components/RunTimeline", () => ({
  RunTimeline: () => <div>timeline</div>,
}));
vi.mock("@/components/Layout/PageContainer", () => ({
  PageContainer: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));
vi.mock("@/components/Layout/PageTitle", () => ({
  PageTitle: ({ children }: { children?: unknown }) => <h1>{children as never}</h1>,
}));
vi.mock("@/components/Layout/PageSubtitle", () => ({
  PageDescription: ({ children }: { children?: unknown }) => <p>{children as never}</p>,
}));
vi.mock("@structura/ui", () => ({
  Badge: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
  Button: ({ children, ...p }: { children?: unknown } & Record<string, unknown>) => (
    <button {...(p as Record<string, never>)}>{children as never}</button>
  ),
  cn: (...a: unknown[]) => a.filter(Boolean).join(" "),
}));

vi.mock("@/features/channels/components/SearchPerformanceSection", () => ({
  SearchPerformanceSection: ({ pageUrl }: { pageUrl: string }) => (
    <div data-testid="search-perf-section" data-page-url={pageUrl} />
  ),
}));

import { SinglePostRunDetailPage } from "../routes/SinglePostRunDetailPage";

const makeRun = (over: Record<string, unknown>) => ({
  data: {
    run: {
      status: "succeeded",
      resultPostId: 42,
      resultPostUrl: "https://site.test/hello",
      startedAt: "2026-07-17T10:00:00Z",
      endedAt: "2026-07-17T10:05:00Z",
      inputSnapshot: {
        identity: { objective: "A topic long enough to pass" },
        structure: { postStatus: "publish" },
      },
      ...over,
    },
  },
  isError: false,
  isLoading: false,
});

describe("SinglePostRunDetailPage — Search performance gate", () => {
  it("mounts the section (with the post permalink) for a published run", () => {
    runQueryMock.current = makeRun({});
    render(<SinglePostRunDetailPage />);

    const section = screen.getByTestId("search-perf-section");
    expect(section).toHaveAttribute("data-page-url", "https://site.test/hello");
  });

  it("hides the section for a draft run — drafts have no search data", () => {
    runQueryMock.current = makeRun({
      inputSnapshot: {
        identity: { objective: "A topic long enough to pass" },
        structure: { postStatus: "draft" },
      },
    });
    render(<SinglePostRunDetailPage />);
    expect(screen.queryByTestId("search-perf-section")).toBeNull();
  });

  it("hides the section when the run has no resultPostUrl", () => {
    runQueryMock.current = makeRun({ resultPostUrl: undefined });
    render(<SinglePostRunDetailPage />);
    expect(screen.queryByTestId("search-perf-section")).toBeNull();
  });

  it("hides the section for a failed run", () => {
    runQueryMock.current = makeRun({
      status: "failed",
      resultPostId: undefined,
      resultPostUrl: undefined,
      error: { code: "x", userMessage: "It broke." },
    });
    render(<SinglePostRunDetailPage />);
    expect(screen.queryByTestId("search-perf-section")).toBeNull();
  });
});
