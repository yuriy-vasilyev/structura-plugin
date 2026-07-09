/**
 * SinglePostRunDetailPage — result banner, inline error, and Run again.
 *
 * Pins three 2026-07-08 wp.org-testing fixes (a sibling file,
 * SinglePostRunDetailPage.test.tsx, covers the earlier grace-window
 * behaviour via the real query hook — this file mocks the hooks directly
 * so it can drive terminal run states cheaply):
 *   #10 The success banner is status-aware: a draft/pending run no longer
 *       claims "Post published", and its CTA points at the editor.
 *   #7  A failed run shows the real error inline (userMessage → devMessage
 *       fallback + a code/kind line) instead of referencing logs that
 *       don't exist for none-tier installs.
 *   #9  "Run again" replays the run's inputSnapshot params as a fresh run
 *       rather than opening a blank Generate form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", () => ({
  useParams: () => ({ runId: "run-1" }),
  useNavigate: () => navigateMock,
  Link: ({ children, ...p }: { children?: unknown } & Record<string, unknown>) => (
    <a {...(p as Record<string, never>)}>{children as never}</a>
  ),
}));

const runQueryMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/progress/api/useCampaignRunQuery", () => ({
  useCampaignRunQuery: () => runQueryMock.current,
}));

const generatePostMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/campaigns/api/useCampaignMutations", () => ({
  useCampaignMutations: () => ({
    generatePost: generatePostMock,
    isGenerating: false,
  }),
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

import { SinglePostRunDetailPage } from "../routes/SinglePostRunDetailPage";

const makeRun = (over: Record<string, unknown>) => ({
  data: {
    run: {
      status: "succeeded",
      resultPostId: 42,
      resultPostUrl: "https://site.test/hello",
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

beforeEach(() => {
  navigateMock.mockReset();
  generatePostMock.mockReset();
});

describe("SinglePostRunDetailPage — success banner (#10)", () => {
  it("says 'Post published' with a View post CTA for a published run", () => {
    runQueryMock.current = makeRun({});
    render(<SinglePostRunDetailPage />);

    expect(screen.getByText("Post published")).toBeInTheDocument();
    expect(screen.getByText("View post")).toBeInTheDocument();
    expect(screen.queryByText("Draft created")).toBeNull();
  });

  it("says 'Draft created' with a Review draft CTA (editor URL) for a draft run", () => {
    runQueryMock.current = makeRun({
      inputSnapshot: {
        identity: { objective: "A topic long enough to pass" },
        structure: { postStatus: "draft" },
      },
    });
    render(<SinglePostRunDetailPage />);

    expect(screen.getByText("Draft created")).toBeInTheDocument();
    expect(screen.getByText("Review draft")).toBeInTheDocument();
    // The old lie is gone.
    expect(screen.queryByText("Post published")).toBeNull();
    // CTA points at the editor, not the front-end permalink.
    const cta = screen.getByText("Review draft").closest("a");
    expect(cta?.getAttribute("href")).toContain("post.php?post=42");
  });

  it("treats a legacy 'pending' run as a draft (pending removed 2026-07-09)", () => {
    runQueryMock.current = makeRun({
      inputSnapshot: {
        identity: { objective: "A topic long enough to pass" },
        structure: { postStatus: "pending" },
      },
    });
    render(<SinglePostRunDetailPage />);

    expect(screen.getByText("Draft created")).toBeInTheDocument();
    expect(screen.getByText("Review draft")).toBeInTheDocument();
    expect(screen.queryByText("Post published")).toBeNull();
  });
});

describe("SinglePostRunDetailPage — failed run error (#7)", () => {
  it("renders the error userMessage + code line inline", () => {
    runQueryMock.current = makeRun({
      status: "failed",
      resultPostId: undefined,
      error: { code: "provider_auth", userMessage: "Your API key was rejected." },
    });
    render(<SinglePostRunDetailPage />);

    expect(screen.getByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByText("Your API key was rejected.")).toBeInTheDocument();
    expect(screen.getByText(/provider_auth/)).toBeInTheDocument();
  });

  it("falls back to devMessage when there is no userMessage", () => {
    runQueryMock.current = makeRun({
      status: "failed",
      resultPostId: undefined,
      error: { code: "x", devMessage: "HMAC secret did not resolve." },
    });
    render(<SinglePostRunDetailPage />);

    expect(screen.getByText("HMAC secret did not resolve.")).toBeInTheDocument();
  });
});

describe("SinglePostRunDetailPage — Run again (#9)", () => {
  it("replays the inputSnapshot params and navigates to the new run", async () => {
    generatePostMock.mockResolvedValue({ run_id: "run-2" });
    const snapshot = {
      identity: { objective: "Replay me exactly, please and thanks" },
      structure: { postStatus: "draft" },
    };
    runQueryMock.current = makeRun({ inputSnapshot: snapshot });
    render(<SinglePostRunDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /Run again/ }));

    await waitFor(() =>
      expect(generatePostMock).toHaveBeenCalledWith({ data: snapshot }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/generate/runs/run-2"),
    );
  });
});
