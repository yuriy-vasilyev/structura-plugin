/**
 * Channels feature — public exports.
 *
 * Mirrors the structure of `client/src/features/ai-engine/`. Routes mount the top-level
 * Channels admin pages; the per-campaign Channels tab is exported separately and consumed
 * by `client/src/features/campaigns/routes/CampaignViewPage.tsx`.
 *
 * Spec: specs/integrations-store-spec.md §10
 */

export * from "./types";
export * from "./videoChannel";
export { ChannelsActivityPage } from "./routes/ChannelsActivityPage";
export { ChannelsConnectionsPage } from "./routes/ChannelsConnectionsPage";
export { ChannelsStorePage } from "./routes/ChannelsStorePage";
export { ChannelEventRow } from "./components/ChannelEventRow";
export { ChannelConnectionRow } from "./components/ChannelConnectionRow";
export { AddWebhookForm } from "./components/AddWebhookForm";
export { ChannelsSubNav } from "./components/ChannelsSubNav";
export { CatalogEntryCard } from "./components/CatalogEntryCard";
export { VideoEventRow } from "./components/VideoEventRow";
export {
  VideoFirstRunEmptyState,
  VideoUpgradeGate,
} from "./components/VideoGates";
export { useChannelEventsQuery } from "./api/useChannelEventsQuery";
export { useChannelConnectionsQuery } from "./api/useChannelConnectionsQuery";
export { useChannelCatalogQuery } from "./api/useChannelCatalogQuery";
export { useChannelConnectionMutations } from "./api/useChannelConnectionMutations";
export { useVideoRetryMutation } from "./api/useVideoRetryMutation";
export { channelKeys } from "./api/keys";
export {
  useChannelsVisibility,
  hasChannelsAccess,
} from "./hooks/useChannelsVisibility";
export {
  resolveChannelsRouteState,
  type ChannelsRouteState,
} from "./hooks/resolveChannelsRouteState";
