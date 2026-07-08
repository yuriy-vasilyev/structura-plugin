/**
 * Unit tests for the Campaign detail "Posts" tab.
 *
 * The regression this file exists to catch is a *double spinner*: the tab
 * once span the toolbar refresh icon whenever `isSyncing` (isLoading ||
 * isFetching) AND rendered a full-body loader on `isLoading`, so the
 * initial load showed two animations at once — and, because the loader
 * was an `absolute inset-0` overlay on an empty (zero-height) list, the
 * second spinner collapsed against the toolbar instead of centering.
 *
 * The contract pinned here:
 *   - Initial load: exactly ONE spinning element on screen (the centered
 *     body `PageLoader`); the toolbar refresh icon does NOT spin.
 *   - Background refetch (manual refresh / paging with cached data, where
 *     keepPreviousData keeps `isLoading` false): the toolbar icon spins
 *     and NO body loader appears — the list stays put.
 *   - Idle populated state: nothing spins; one row per post.
 *
 * The query hook is swapped at module scope so each test scripts its own
 * loading flags — same approach as `CampaignRunsTab.test.tsx`, where the
 * point is the tab's render branching, not the hook's wire behaviour.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ArchitectedPost } from "@/features/dashboard/api/useRecentPostsQuery";

const useCampaignPostsQueryMock = vi.fn();
vi.mock("@/features/campaigns/api/useCampaignPostsQuery", () => ({
  useCampaignPostsQuery: (...args: unknown[]) => useCampaignPostsQueryMock(...args),
}));

import { PostsTab } from "../routes/CampaignViewPage";

const BASE_POST: ArchitectedPost = {
  id: 1,
  title: "How to brew better coffee",
  status: "publish",
  date: "2026-05-20",
  permalink: "https://example.com/coffee",
  edit_link: "https://example.com/wp-admin/post.php?post=1&action=edit",
  thumbnail: null,
  author: "Jane",
  model: "gpt-4",
};

const PAGINATION = { current_page: 1, total_pages: 1, total_items: 0 };

beforeEach(() => {
  useCampaignPostsQueryMock.mockReset();
});

describe("PostsTab", () => {
  it("shows a single loader on initial load — not the old double spinner", () => {
    useCampaignPostsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      refetch: vi.fn(),
    });

    const { container } = render(<PostsTab campaignId={42} />);

    // The body loader is present and labelled…
    expect(screen.getByText("Loading posts…")).toBeInTheDocument();
    // …and it announces itself once as a status region (the toolbar
    // button is a <button>, not role=status, so there's only one).
    expect(screen.getAllByRole("status")).toHaveLength(1);
    // The crux: exactly ONE thing is animating. The bug rendered two —
    // the PageLoader's Spinner *and* the toolbar RefreshCw icon — both
    // carrying `animate-spin`.
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(1);
    // And the one animating element is the body Spinner, not the
    // toolbar icon: the refresh button's icon stays still on first load.
    const refreshIcon = screen.getByRole("button").querySelector("svg");
    expect(refreshIcon?.classList.contains("animate-spin")).toBe(false);
  });

  it("spins the toolbar icon on a background refetch without a body loader", () => {
    useCampaignPostsQueryMock.mockReturnValue({
      data: { data: [], pagination: PAGINATION },
      isLoading: false,
      isFetching: true,
      refetch: vi.fn(),
    });

    const { container } = render(<PostsTab campaignId={42} />);

    // No full-body loader during a background refresh — the list (here
    // its empty state) stays on screen.
    expect(screen.queryByText("Loading posts…")).not.toBeInTheDocument();
    expect(screen.getByText("No posts generated yet.")).toBeInTheDocument();
    // The toolbar icon is the only thing spinning, and it IS spinning so
    // the user still gets refresh feedback.
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(1);
    const refreshIcon = screen.getByRole("button").querySelector("svg");
    expect(refreshIcon?.classList.contains("animate-spin")).toBe(true);
  });

  it("renders one row per post and nothing spins when idle", () => {
    useCampaignPostsQueryMock.mockReturnValue({
      data: {
        data: [
          { ...BASE_POST, id: 1, title: "First post" },
          { ...BASE_POST, id: 2, title: "Second post" },
        ] satisfies ArchitectedPost[],
        pagination: { ...PAGINATION, total_items: 2 },
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    const { container } = render(<PostsTab campaignId={42} />);

    expect(screen.getByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Second post")).toBeInTheDocument();
    expect(screen.queryByText("Loading posts…")).not.toBeInTheDocument();
    // Nothing animating in the resting state.
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);
  });

  it("wires the refresh button to refetch", () => {
    const refetch = vi.fn();
    useCampaignPostsQueryMock.mockReturnValue({
      data: { data: [], pagination: PAGINATION },
      isLoading: false,
      isFetching: false,
      refetch,
    });

    render(<PostsTab campaignId={42} />);
    // Lightweight click — we only need to prove the button is wired,
    // not exercise a full user-event roundtrip (mirrors the Runs test).
    screen.getByRole("button").click();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
