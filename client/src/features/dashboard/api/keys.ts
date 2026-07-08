export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: () => [...dashboardKeys.all, "stats"] as const,
  /**
   * Needs Attention widget list query — `failed` +
   * `succeeded_with_warnings` runs that haven't been acknowledged yet.
   * Spec: `specs/run-detail-view.md` §6.
   */
  attentionRuns: () => [...dashboardKeys.all, "attention-runs"] as const,
};
