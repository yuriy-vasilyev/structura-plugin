# Channels UI components

React components for the top-level Channels admin page (cards for connected/available
integrations) and the per-campaign Channels tab (sub-nav + per-integration drill-down).

Mirrors the patterns in `client/src/features/ai-engine/components/` (ProviderCard,
InstalledProviderCard, AvailableProviderCard, etc.).

The campaign-level tab component lives at
`client/src/features/campaigns/components/ChannelsTab.tsx` rather than here, so that the
campaigns feature stays self-contained.
