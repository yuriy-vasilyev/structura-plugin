/**
 * ChannelsActivityPage integration test.
 *
 * Mocks `@wordpress/api-fetch` so the activity query resolves with controlled
 * data and verifies the three render branches: loading, empty, populated.
 * Error branch is exercised by rejecting the fetch.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

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

// `useChannelEventsQuery` now calls `useLicense()` to decide whether
// the cloud handshake can succeed. These page tests exercise the
// happy-path render branches, so stub useLicense to a valid, paid-tier
// shape and let the query behave as before.
const licenseMock = vi.hoisted(() => ({
  isActivationValid: true as boolean | null,
  // hasUsableLicense gates every cloud-bound query post-2026-05; stub
  // to "bound" so the events fetch fires under test.
  hasUsableLicense: true as boolean | null,
}));
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => licenseMock,
}));

import { ChannelsActivityPage } from "../routes/ChannelsActivityPage";
import type { ChannelEvent, ConnectionSummary } from "../types";

/**
 * The page now issues TWO queries — events (the timeline) and connections
 * (to detect a connected-but-silent Video channel for its first-run empty
 * state). Route the shared apiFetch mock by path so setups stay
 * order-independent instead of relying on `mockResolvedValueOnce` racing.
 */
function mockApi({
  events = [] as ChannelEvent[],
  connections = [] as ConnectionSummary[],
  eventsError,
}: {
  events?: ChannelEvent[];
  connections?: ConnectionSummary[];
  eventsError?: Error;
} = {}) {
  apiFetchMock.mockImplementation((args: { path?: string }) => {
    const path = args?.path ?? "";
    if (path.startsWith("/structura/v1/channels/events")) {
      return eventsError ? Promise.reject(eventsError) : Promise.resolve(events);
    }
    if (path.startsWith("/structura/v1/channels/connections")) {
      return Promise.resolve({ success: true, connections });
    }
    return Promise.resolve({ success: true });
  });
}

function renderWithClient(node: ReactNode) {
  // Disable retries so the error branch resolves without backoff delays.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // MemoryRouter needed because the page renders ChannelsSubNav (NavLink)
  // and a "Connect a channel" CTA (Link), both of which require a Router.
  return render(
    <MemoryRouter initialEntries={["/channels"]}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("ChannelsActivityPage", () => {
  it("renders the empty-state when the API returns no events", async () => {
    mockApi();

    renderWithClient(<ChannelsActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("No channel events yet")).toBeInTheDocument();
    });
    // Header always present, regardless of state.
    expect(screen.getByText("Channel Activity")).toBeInTheDocument();
  });

  it("renders an event row for each item returned by the API", async () => {
    const events: ChannelEvent[] = [
      {
        id: "evt-1",
        type: "post_published",
        postId: 42,
        campaignId: 7,
        postTitle: "Hello World",
        postUrl: "https://example.com/p/42",
        publishedAt: "2026-04-14T12:00:00Z",
        dispatchedTo: [],
        results: {},
        createdAt: "2026-04-14T12:00:01Z",
      },
      {
        id: "evt-2",
        type: "post_published",
        postId: 43,
        campaignId: 7,
        postTitle: "Second Post",
        postUrl: null,
        publishedAt: null,
        dispatchedTo: ["slack"],
        results: {},
        createdAt: "2026-04-14T13:00:00Z",
      },
    ];
    mockApi({ events });

    renderWithClient(<ChannelsActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });
    expect(screen.getByText("Second Post")).toBeInTheDocument();
    expect(screen.getByText("Dispatched to: slack")).toBeInTheDocument();
  });

  it("renders an error state when the API rejects", async () => {
    mockApi({ eventsError: new Error("boom") });

    renderWithClient(<ChannelsActivityPage />);

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't load channel activity."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("requests the events at the WP REST path with the default page size", async () => {
    mockApi();

    renderWithClient(<ChannelsActivityPage />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: "/structura/v1/channels/events?limit=25",
      });
    });
  });

  it("shows the video first-run empty state when a video channel is connected but silent", async () => {
    // Design handoff §4: a freshly installed Video channel with zero events
    // should reassure ("on its way"), not show the generic empty state.
    mockApi({
      connections: [
        {
          connectionId: "conn-video",
          integrationId: "video",
          status: "connected",
          displayName: "Vertical video",
          externalAccountId: null,
          connectedAt: "2026-07-01T12:00:00Z",
          lastUsedAt: null,
          lastError: null,
        },
      ],
    });

    renderWithClient(<ChannelsActivityPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Your first video is on its way"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("No channel events yet")).toBeNull();
    expect(
      screen.getByRole("link", { name: /configure video/i }),
    ).toHaveAttribute("href", "/channels/connections");
  });
});
