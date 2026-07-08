/**
 * Channels Activity page — surfaces the recent `channelEvents` for this site.
 *
 * Phase 1: read-only timeline. The list will be empty (or "no integrations
 * resolved") on most installs because no concrete integrations exist yet.
 * Phase 2 will add per-integration status pills and a retry action.
 *
 * Spec: specs/integrations-store-spec.md §10
 */

import { __ } from "@wordpress/i18n";
import { Inbox, Plug } from "lucide-react";
import { Link } from "react-router";
import { Button, EmptyState, Skeleton } from "@structura/ui";
import { useChannelEventsQuery } from "../api/useChannelEventsQuery";
import { useChannelConnectionsQuery } from "../api/useChannelConnectionsQuery";
import { ChannelEventRow } from "../components/ChannelEventRow";
import { ChannelsSubNav } from "../components/ChannelsSubNav";
import { VideoFirstRunEmptyState } from "../components/VideoGates";
import { VIDEO_INTEGRATION_ID } from "../videoChannel";
import { PageContainer } from "@/components/Layout/PageContainer";

export const ChannelsActivityPage = () => {
  // Host-mismatch handling: the events query self-short-circuits via
  // `enabled: isActivationValid !== false`, and the global
  // <DomainMismatchAdvisory /> in App.tsx explains the state. When the
  // handshake can't succeed on this host we'll land in the empty-state
  // branch here, which is fine — the advisory above the page header
  // carries the "reconnect" CTA, so we don't need to take over the body.
  const { data: events, isLoading, isError, error } = useChannelEventsQuery();
  // Connections feed exactly one decision here: does a video channel
  // exist while the timeline is empty? Then the first-run reassurance
  // ("your first video is on its way") beats the generic empty state
  // (video-channel handoff §4). The query is cached/shared with the
  // Connections page, so this costs no extra round-trip in practice.
  const { data: connections } = useChannelConnectionsQuery();
  const hasVideoConnection = (connections ?? []).some(
    (connection) =>
      connection.integrationId === VIDEO_INTEGRATION_ID &&
      connection.status === "connected",
  );

  if (isLoading) {
    // Five skeleton rows match the typical "event list" density — enough to
    // look populated without overwhelming the viewport. Each row mirrors
    // ChannelEventRow's post-title + metadata layout so the hand-off to real
    // content is visually stable.
    return (
      <PageContainer variant="narrow" className="space-y-6">
        <ChannelsSubNav />
        <div className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80" />
          </div>
          <ul
            className="m-0! list-none space-y-3 p-0!"
            aria-label={__("Loading channel activity", "structura")}
            aria-busy
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer variant="narrow" className="space-y-6">
        <ChannelsSubNav />
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {__("We couldn't load channel activity.", "structura")}
          {error instanceof Error && (
            <p className="mt-1 text-xs text-red-700">{error.message}</p>
          )}
        </div>
      </PageContainer>
    );
  }

  const list = events ?? [];

  return (
    <PageContainer variant="narrow" className="space-y-6">
      <ChannelsSubNav />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            {__("Channel Activity", "structura")}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {__(
              "Every time Structura publishes a post, the cloud dispatcher records what it sent to each connected channel. The 25 most recent events are shown here.",
              "structura",
            )}
          </p>
        </div>
        {/* Primary CTA: the Activity page is where most users land, so the
            shortest path to "add an integration" needs to be right here. */}
        <Button asChild variant="primary" size="sm" className="shrink-0">
          <Link to="/channels/connections">
            <Plug size={14} className="mr-1.5" />
            {__("Connect a channel", "structura")}
          </Link>
        </Button>
      </header>

      {list.length === 0 && hasVideoConnection ? (
        <VideoFirstRunEmptyState />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} />}
          title={__("No channel events yet", "structura")}
          description={__(
            "Once a Structura campaign publishes a post, it will appear here with the channels it was dispatched to.",
            "structura",
          )}
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/channels/connections">
                <Plug size={14} className="mr-1.5" />
                {__("Connect a channel", "structura")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((event) => (
            <ChannelEventRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </PageContainer>
  );
};
