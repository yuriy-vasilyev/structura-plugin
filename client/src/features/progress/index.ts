/**
 * Progress-stream public API. Everything the rest of the client needs to
 * read from this feature is re-exported here; internal helpers (the
 * query keys, the polling cadence constants) stay file-local.
 *
 * Note: the v1 `ProgressDrawer` (floating top-right panel) has been
 * retired in favor of the inline `CampaignRunProgress` strip + the
 * `RunStatusToastHost` app-root broadcaster. Rationale: the drawer's
 * custom portal-rendered toast didn't integrate with the global toast
 * system (visual drift + couldn't be dismissed like a normal toast),
 * and its "Run complete — progress details no longer available"
 * fallback fired on every 404 during the AS-jitter window, storming
 * the user with false-terminal messages. The two surfaces it filled
 * are now split: inline per-campaign strip for the originating card,
 * app-level toast for the off-screen case.
 */
export { CampaignRunProgress } from "./components/CampaignRunProgress";
export type { CampaignRunProgressProps } from "./components/CampaignRunProgress";
export { RunsProvider, useRuns } from "./context/RunsContext";
export { RunStatusToastHost } from "./RunStatusToastHost";
export { useRunStatusToasts } from "./useRunStatusToasts";
export { formatDuration } from "./formatDuration";
export { milestoneHeadline, MILESTONE_ORDER, isTerminalMilestone } from "./milestones";
export { useCampaignRunQuery } from "./api/useCampaignRunQuery";
export { useCampaignRunsQuery } from "./api/useCampaignRunsQuery";
export { useActiveRunsQuery } from "./api/useActiveRunsQuery";
export { useSinglePostRunsQuery } from "./api/useSinglePostRunsQuery";
export { useRehydrateActiveRun } from "./useRehydrateActiveRun";
export { RunDetailPage } from "./routes/RunDetailPage";
