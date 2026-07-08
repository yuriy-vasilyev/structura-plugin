/**
 * ChannelEventRow component tests.
 *
 * Pure presentational — no react-query, no API fetching. Verifies the empty
 * dispatchedTo case (Phase 1 default) and the populated case (Phase 2+).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChannelEventRow } from "../components/ChannelEventRow";
import type { ChannelEvent } from "../types";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    // Minimal sprintf — only %s and %d are used in this component.
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const baseEvent: ChannelEvent = {
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
};

describe("ChannelEventRow", () => {
  it("shows the post title and a link when postUrl is present", () => {
    render(<ChannelEventRow event={baseEvent} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link).toHaveAttribute("href", "https://example.com/p/42");
  });

  it("renders the Phase 1 'no integrations' label when dispatchedTo is empty", () => {
    render(<ChannelEventRow event={baseEvent} />);
    expect(
      screen.getByText("No integrations connected yet"),
    ).toBeInTheDocument();
  });

  it("lists dispatched integration ids when dispatchedTo is populated", () => {
    render(
      <ChannelEventRow
        event={{ ...baseEvent, dispatchedTo: ["slack", "indexnow"] }}
      />,
    );
    expect(
      screen.getByText("Dispatched to: slack, indexnow"),
    ).toBeInTheDocument();
  });

  it("falls back to 'Post #<id>' when postTitle is empty", () => {
    render(<ChannelEventRow event={{ ...baseEvent, postTitle: "" }} />);
    expect(screen.getByText("Post #42")).toBeInTheDocument();
  });

  it("omits the open link when postUrl is null", () => {
    render(<ChannelEventRow event={{ ...baseEvent, postUrl: null }} />);
    expect(screen.queryByRole("link", { name: /open/i })).toBeNull();
  });

  it("renders a status pill per integration when results is populated", () => {
    render(
      <ChannelEventRow
        event={{
          ...baseEvent,
          dispatchedTo: ["slack", "discord", "indexnow"],
          results: {
            slack: {
              status: "ok",
              externalUrl: "https://slack.example/msg/1",
              finishedAt: "2026-04-14T12:00:02Z",
            },
            discord: {
              status: "permanent_error",
              error: { code: "webhook_http_404", message: "Webhook returned 404." },
              finishedAt: "2026-04-14T12:00:02Z",
            },
            indexnow: {
              status: "timeout",
              finishedAt: "2026-04-14T12:00:07Z",
            },
          },
        }}
      />,
    );
    expect(screen.getByText("slack")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("discord")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Webhook returned 404.")).toBeInTheDocument();
    expect(screen.getByText("Timed out")).toBeInTheDocument();
    // With per-integration results present, the Phase-1 fallback summary
    // is suppressed.
    expect(screen.queryByText(/^Dispatched to:/)).toBeNull();
  });

  it("labels a rate_limited result as a benign skip, not a failure", () => {
    // The per-connection anti-spam cooldown returns `rate_limited`; it must
    // read as a neutral skip, never "Failed".
    render(
      <ChannelEventRow
        event={{
          ...baseEvent,
          dispatchedTo: ["linkedin"],
          results: {
            linkedin: {
              status: "rate_limited",
              integrationId: "linkedin",
              finishedAt: "2026-04-14T12:00:02Z",
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Skipped (recently posted)")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Video events — delegation to the video lifecycle row
// ---------------------------------------------------------------------------

describe("ChannelEventRow — video job delegation", () => {
  it("renders the video lifecycle row when the event carries a videoJob", async () => {
    // The video row pulls in the retry mutation, so it needs a QueryClient.
    const { QueryClient, QueryClientProvider } = await import(
      "@tanstack/react-query"
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ul>
          <ChannelEventRow
            event={{
              ...baseEvent,
              dispatchedTo: ["video"],
              videoJob: { jobId: "job-1", status: "rendering" },
            }}
          />
        </ul>
      </QueryClientProvider>,
    );

    // Video shell instead of the generic dispatch summary.
    expect(screen.getByText("Rendering")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("No integrations connected yet")).toBeNull();
  });
});
