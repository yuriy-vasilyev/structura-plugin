/**
 * React Query keys for the progress-stream feature.
 *
 * Keys are scoped to either a single runId (drawer / inline strip polling
 * one run) or a campaignId (the historical Runs tab listing every run for
 * one campaign). Kept separate from `campaignKeys` / `jobKeys` because
 * progress docs have a different lifecycle (24h TTL, terminal-state
 * freeze) than the long-lived campaign docs they describe.
 */
export const progressKeys = {
  all: ["progress"] as const,
  run: (runId: string) => [...progressKeys.all, "run", runId] as const,
  /**
   * Cache key for the Campaign detail "Runs" tab — one entry per campaign.
   * Invalidation happens when the user re-opens the tab or when a run that
   * started from this campaign terminates (the inline strip invalidates
   * this key on terminal status so the tab refreshes without a manual
   * refetch).
   */
  campaignRuns: (campaignId: string | number) =>
    [...progressKeys.all, "campaignRuns", campaignId] as const,
  /**
   * Cache key for the SPA refresh-recovery query — "which runs are
   * currently in flight ANYWHERE on this site?". Feeds the
   * `RunsProvider`-level rehydration hook that repopulates
   * `RunsContext.activeRunId` after a page reload. Single-entry
   * (no scoping argument) because this is a per-site question.
   */
  activeRuns: () => [...progressKeys.all, "activeRuns"] as const,
  /**
   * Cache key for the dashboard "Recent generations" widget — lists the
   * most recent ephemeral runs (one-off `/generate` submissions). The
   * generate-post mutation invalidates this key on success so a brand-
   * new submission appears at the top of the widget without waiting for
   * the next poll tick.
   */
  singlePostRuns: () => [...progressKeys.all, "singlePostRuns"] as const,
};
