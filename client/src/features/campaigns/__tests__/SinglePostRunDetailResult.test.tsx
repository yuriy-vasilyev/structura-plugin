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
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

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

vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: { text: [{ id: "gpt-x", name: "GPT-X" }], image: [] },
  }),
}));

vi.mock("@/features/progress/components/RunTimeline", () => ({
  RunTimeline: () => <div>timeline</div>,
}));
// The GSC section mounts for published runs (2026-07-18); it has its own
// react-query wiring, so stub it here — gate + states are covered by
// SinglePostRunDetail.searchPerf.test.tsx and the channels suite.
vi.mock("@/features/channels/components/SearchPerformanceSection", () => ({
  SearchPerformanceSection: () => <div data-testid="search-perf-section" />,
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
vi.mock("@structura/ui", () => {
  const pass = ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  );
  return {
    Badge: ({ children }: { children?: unknown }) => (
      <span>{children as never}</span>
    ),
    Button: ({
      children,
      ...p
    }: { children?: unknown } & Record<string, unknown>) => (
      <button {...(p as Record<string, never>)}>{children as never}</button>
    ),
    cn: (...a: unknown[]) => a.filter(Boolean).join(" "),
    Dialog: {
      // Render children only while open, under a `dialog` role so tests can
      // scope queries to the confirmation.
      Root: ({ open, children }: { open?: boolean; children?: unknown }) =>
        open ? <div role="dialog">{children as never}</div> : null,
      Content: pass,
      Header: pass,
      Title: pass,
      Description: pass,
      Body: pass,
      Footer: pass,
    },
  };
});

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

    // Both the header subtitle AND the receipt banner say "Post published"
    // now — the header used to render the raw (draft-blind) cloud headline.
    expect(screen.getAllByText("Post published").length).toBeGreaterThanOrEqual(2);
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

    // Header subtitle + receipt banner both say "Draft created".
    expect(screen.getAllByText("Draft created").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Review draft")).toBeInTheDocument();
    // The old lie is gone — including the header subtitle that used to read
    // the cloud's unconditional "Post published" headline for a draft run.
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

    expect(screen.getAllByText("Draft created").length).toBeGreaterThanOrEqual(2);
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
  it("confirms before replaying, then navigates to the new run", async () => {
    generatePostMock.mockResolvedValue({ run_id: "run-2" });
    const snapshot = {
      identity: { objective: "Replay me exactly, please and thanks" },
      structure: { postStatus: "draft" },
    };
    runQueryMock.current = makeRun({ inputSnapshot: snapshot });
    render(<SinglePostRunDetailPage />);

    // The header button opens a confirmation — it must NOT generate on a
    // single click (re-running spends quota + creates a new post).
    fireEvent.click(screen.getByRole("button", { name: /Run again/ }));
    expect(generatePostMock).not.toHaveBeenCalled();

    // The dialog summarizes the run (post status shown as Draft).
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Draft")).toBeInTheDocument();

    // Confirming inside the dialog replays the EXACT snapshot.
    fireEvent.click(within(dialog).getByRole("button", { name: /Run again/ }));

    await waitFor(() =>
      expect(generatePostMock).toHaveBeenCalledWith({ data: snapshot }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/generate/runs/run-2"),
    );
  });

  it("does NOT replay when the confirmation is cancelled", async () => {
    const snapshot = {
      identity: { objective: "Do not replay me" },
      structure: { postStatus: "draft" },
    };
    runQueryMock.current = makeRun({ inputSnapshot: snapshot });
    render(<SinglePostRunDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /Run again/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Cancel/ }));

    expect(generatePostMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("skips the dialog for a legacy run with no snapshot to replay", () => {
    runQueryMock.current = makeRun({ inputSnapshot: undefined });
    render(<SinglePostRunDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /Run again/ }));

    // No snapshot → straight to the blank Generate form, no confirmation.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith("/generate");
  });
});

describe("SinglePostRunDetailPage — research files echo (2026-08-01)", () => {
  const snapshotWithResearch = {
    identity: { objective: "Ground this post in the attached research" },
    structure: { postStatus: "draft" },
    researchAttachments: [
      { id: "att-1", name: "market-research-q3.pdf" },
      { id: "att-2", name: "interview-notes.docx" },
    ],
  };

  it("renders a Research files row in the Inputs card with the file names", () => {
    runQueryMock.current = makeRun({ inputSnapshot: snapshotWithResearch });
    render(<SinglePostRunDetailPage />);

    expect(screen.getByText("Research files")).toBeInTheDocument();
    expect(screen.getByText("market-research-q3.pdf")).toBeInTheDocument();
    expect(screen.getByText("interview-notes.docx")).toBeInTheDocument();
  });

  it("omits the row for legacy snapshots without researchAttachments", () => {
    runQueryMock.current = makeRun({});
    render(<SinglePostRunDetailPage />);

    expect(screen.queryByText("Research files")).toBeNull();
  });

  it("summarizes attachments in the Run again dialog and replays them", async () => {
    generatePostMock.mockResolvedValue({ run_id: "run-2" });
    runQueryMock.current = makeRun({ inputSnapshot: snapshotWithResearch });
    render(<SinglePostRunDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /Run again/ }));
    const dialog = await screen.findByRole("dialog");

    // Handoff echo.more — "{first} +{n} more".
    expect(
      within(dialog).getByText("market-research-q3.pdf +1 more"),
    ).toBeInTheDocument();

    // Confirming re-submits the snapshot WITH the attachment refs — the
    // flattenCampaign wire test pins the snapshot → research_attachments
    // half of this contract.
    fireEvent.click(within(dialog).getByRole("button", { name: /Run again/ }));
    await waitFor(() =>
      expect(generatePostMock).toHaveBeenCalledWith({ data: snapshotWithResearch }),
    );
  });
});
