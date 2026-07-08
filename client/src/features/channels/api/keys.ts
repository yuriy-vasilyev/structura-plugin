/**
 * React Query keys for the channels feature. Centralized so invalidation
 * is consistent across mutations.
 */
export const channelKeys = {
  all: ["channels"] as const,
  events: () => [...channelKeys.all, "events"] as const,
  catalog: () => [...channelKeys.all, "catalog"] as const,
  connections: () => [...channelKeys.all, "connections"] as const,
  /**
   * IndexNow key + keyLocation. Separate cache key from `connections`
   * because the value is keyed off the WP install (not a specific
   * connection) and refetching once per InstallModal mount is plenty.
   */
  indexnowKey: () => [...channelKeys.all, "indexnow-key"] as const,
};
