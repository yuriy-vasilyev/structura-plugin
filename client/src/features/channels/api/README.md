# Channels API hooks

React Query hooks + request keys for the Channels cloud endpoints. Mirrors the structure of
`client/src/features/ai-engine/api/`.

Phase 1 lands: `useChannelsCatalogQuery`, `useChannelsConnectionsQuery`, `keys.ts`.
Phase 2/4 add per-integration hooks (e.g. `useDisconnectMutation`).
Phase 3 adds `useStartOAuthMutation`.
