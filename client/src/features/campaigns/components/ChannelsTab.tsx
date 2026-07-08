/**
 * ChannelsTab — per-campaign integrations surface inside
 * `CampaignViewPage`'s tab bar.
 *
 * Phase 2 scope (per spec §10.2)
 * ------------------------------
 * Minimal MVP: show the activation's connected integrations so a campaign
 * owner can confirm at a glance which channels will fire when this campaign
 * publishes, and offer a one-click route to the top-level Channels surface
 * for add/remove. The richer drill-down (per-post delivery status, retry
 * UI, per-campaign setting overrides) lands in later phases; they would
 * require a per-campaign `channelSettings/{integrationId}` subcollection
 * that doesn't exist yet.
 *
 * Why this tab exists *now*, before per-campaign settings exist
 * -------------------------------------------------------------
 * Channels is an activation-scoped feature in Phase 2 — connections apply
 * to every campaign the license runs on that site. That means the list of
 * integrations shown here is identical for every campaign, which could
 * feel redundant. We still want the affordance on the campaign view so
 * users don't have to context-switch to discover "will anything fire when
 * this goes live?" — the answer lives right next to the Overview/Posts/
 * Logs tabs they're already on.
 *
 * Empty state
 * -----------
 * Per spec §10.2: when no integrations are connected, show a "Connect your
 * first channel" card that links to `/channels/store`. Unconnected
 * integrations do NOT appear as stub rows — the top-level Channels page is
 * the only place to browse the catalog.
 *
 * Spec: specs/integrations-store-spec.md §10.2
 */

import { useMemo } from "react";
import { __ } from "@wordpress/i18n";
import { Link } from "react-router";
import { Plug, Store } from "lucide-react";
import { Badge, Button, EmptyState as UiEmptyState, Skeleton } from "@structura/ui";
import { useChannelConnectionsQuery } from "@/features/channels/api/useChannelConnectionsQuery";
import { useChannelCatalogQuery } from "@/features/channels/api/useChannelCatalogQuery";
import { IntegrationIcon } from "@/features/channels/components/IntegrationIcon";
import { connectionStatusLabel } from "@/features/channels/labels";
import type {
  ConnectionStatus,
  IntegrationCatalogEntry,
} from "@/features/channels/types";

interface ChannelsTabProps {
  /**
   * Not actually used yet — the connection list is activation-scoped, not
   * per-campaign, for Phase 2. Keeping the prop so later phases can wire
   * per-campaign overrides without refactoring every callsite.
   */
  campaignId: string | number;
}

const statusBadgeIntent = (
  status: ConnectionStatus,
): "success" | "warning" | "destructive" => {
  switch (status) {
    case "connected":
      return "success";
    case "expired":
      return "warning";
    case "revoked":
    case "error":
    default:
      return "destructive";
  }
};

export const ChannelsTab = ({ campaignId: _campaignId }: ChannelsTabProps) => {
  const { data: connections, isLoading, isError } = useChannelConnectionsQuery();
  // Catalog is cached separately; we block loading state on connections
  // only — the catalog hydrates icon + display name but we fall back to the
  // raw integrationId if it's still in flight.
  const { data: catalog } = useChannelCatalogQuery();

  const catalogById = useMemo(() => {
    const map = new Map<string, IntegrationCatalogEntry>();
    catalog?.entries.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [catalog]);

  if (isLoading) {
    // Two skeleton rows is the right stub density — one looks like a
    // "nothing here" flicker, three or more implies we know the user has
    // multiple connections (we don't, until the query lands).
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        {__(
          "We couldn't load your channel connections. Try reloading the page.",
          "structura",
        )}
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return <EmptyState />;
  }

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
          {__(
            "These channels will fire whenever a post from this campaign is published. Connections apply site-wide — edit them on the Channels page.",
            "structura",
          )}
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link to="/channels/connections">
            {__("Manage channels", "structura")}
          </Link>
        </Button>
      </header>

      <ul
        className="m-0! list-none space-y-2 p-0!"
        aria-label={__("Channels enabled for this campaign", "structura")}
      >
        {connections.map((connection) => {
          const entry = catalogById.get(connection.integrationId);
          return (
            <li
              key={connection.connectionId ?? connection.integrationId}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <IntegrationIcon
                integrationId={connection.integrationId}
                iconUrl={entry?.iconUrl}
                sizeClassName="size-9"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {entry?.name ?? connection.integrationId}
                </div>
                <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {connection.displayName || connection.integrationId}
                </div>
              </div>
              <Badge
                variant="solid"
                intent={statusBadgeIntent(connection.status)}
              >
                {connectionStatusLabel(connection.status)}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/**
 * Empty state — no connections on this activation. The CTA routes to the
 * Store rather than the Connections page because the Store is the only
 * surface that can add a new connection (Connections is read-only per
 * Phase 2.5).
 */
const EmptyState = () => (
  <UiEmptyState
    icon={<Plug size={22} />}
    title={__("Connect your first channel", "structura")}
    description={__(
      "Notify Slack, ping IndexNow, or auto-publish to LinkedIn when posts in this campaign go live. Pick a channel from the Store to get started.",
      "structura",
    )}
    action={
      <Button asChild size="sm">
        <Link to="/channels/store">
          <Store size={14} className="mr-1.5" />
          {__("Browse Channels Store", "structura")}
        </Link>
      </Button>
    }
  />
);
