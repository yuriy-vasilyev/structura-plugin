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
  /**
   * Per-post GSC mirror stats, keyed by the post's permalink so two run
   * receipts pointing at the same post share one cache entry.
   */
  gscPostStats: (pageUrl: string) =>
    [...channelKeys.all, "gsc-post-stats", pageUrl] as const,
  /** Site-level GSC overview in summary mode (dashboard glance card). */
  gscOverviewSummary: () =>
    [...channelKeys.all, "gsc-overview-summary"] as const,
};
