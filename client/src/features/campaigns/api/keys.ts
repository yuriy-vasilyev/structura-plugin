export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  // `id` accepts both legacy numeric WP post IDs and cloud string IDs
  // (Firestore auto-IDs). Concrete typing avoids accidental NaN keys
  // from upstream Number() coercion of non-numeric IDs.
  detail: (id: string | number) => [...campaignKeys.all, "detail", id] as const,
  // Phase 1.6 follow-up — per-campaign stock-state summary for the
  // dashboard chip. Lives under `campaignKeys.all` so a generic
  // campaign-cache invalidation refreshes it alongside list/detail.
  stockSummary: (id: string | number) =>
    [...campaignKeys.all, "stock-summary", id] as const,
  // Stock tab (2026-06-05) — full live-entry list for one campaign.
  // Sibling of stockSummary so both refresh on stock mutations.
  stock: (id: string | number) => [...campaignKeys.all, "stock", id] as const,
};

export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (params: { status: string; page: number; search: string }) =>
    [...jobKeys.lists(), params] as const,
};
