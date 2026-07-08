import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { dashboardKeys } from "./keys";
import { DashboardStats } from "../types";
import { useLicense } from "@/features/settings/api/useLicense";

// 1. Fetch System Stats
//
// Phase 1.8 PR8 — anonymous shadow workspaces can also generate posts
// (single-post path), and the WP-side stat counters
// (`structura_stat_generated_posts`, `_blocks`, `_images`) bump on
// every successful insert regardless of tier. Gating the query on
// `hasUsableLicense` left None-tier dashboards stuck at "0 / 0" even
// after successful single-post runs. `hasWorkspace` covers both
// licensed and anonymous installs.
export const useStatsQuery = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => apiFetch<DashboardStats>({ path: "/structura/v1/stats" }),
    enabled: hasWorkspace === true,
    refetchInterval: 60000,
    staleTime: 30000,
  });
};
