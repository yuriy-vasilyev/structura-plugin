import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { RunStatusSerialized } from "@structura/types";
import { progressKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Wire shape returned by `GET /structura/v1/runs/single`. The plugin
 * REST bridge unwraps the cloud's `{ runs: [...] }` envelope and
 * returns the array directly (same pattern as `useActiveRunsQuery`
 * and `useCampaignRunsQuery`), so the hook types the payload as a
 * bare array.
 */
type SinglePostRunsResponse = RunStatusSerialized[];

/**
 * Statuses that keep us polling at the fast cadence. Once every row in
 * the list has a terminal status, polling pauses entirely — no point
 * asking the cloud "did anything change?" when the answer is
 * definitionally "no" until the user fires another `/generate` form.
 *
 * Mirrors the constant in `useCampaignRunsQuery`; duplicating it (rather
 * than exporting from there) keeps the two hooks decoupled — the
 * dashboard widget could relax its polling rules in the future without
 * forcing the campaign-runs tab to follow.
 */
const NON_TERMINAL_STATUSES = new Set<string>([
  "queued",
  "running",
  // Webhook-delivery fallback parked state — keep the list refreshing until
  // the plugin's poller pulls the post and it flips to succeeded.
  "awaiting_pull",
]);

/**
 * Slower poll than the per-run drawer (1–5s) — the dashboard widget is
 * an at-a-glance surface, not a live dashboard. 30s catches a terminal
 * transition within ~10% of a typical single-post run's wall-clock time
 * (most complete in 30–90s).
 */
const REFETCH_INTERVAL_MS = 30_000;

/**
 * React Query hook that lists the most recent ephemeral runs (the SPA's
 * `/generate` form submissions), newest-first. Powers the dashboard's
 * "Recent generations" widget — a persistent receipt view of one-off
 * post generations the user has fired without first creating a campaign.
 *
 * Polling pauses once the list is all-terminal; the generate-post
 * mutation in `useCampaignMutations` invalidates this key on success,
 * so a brand-new submission appears at the top of the widget without
 * waiting for the next 30s tick.
 *
 * Error handling: any non-2xx surfaces as `isError`. The widget owns
 * inline error UI rather than relying on the global toast — a transient
 * cloud blip on a dashboard surface shouldn't shout at the user; the
 * next tick (once any in-flight row exists) will quietly recover.
 */
export const useSinglePostRunsQuery = (limit: number = 5) => {
  // Phase 1.8 PR8 — anonymous installs can produce single-post runs
  // (the dashboard's "Recent posts" widget needs to surface them).
  // `hasWorkspace` accepts both licensed and anonymous workspaces.
  const { hasWorkspace } = useLicense();
  return useQuery<SinglePostRunsResponse>({
    queryKey: [...progressKeys.singlePostRuns(), limit],
    enabled: hasWorkspace === true,
    meta: { silentError: true },
    queryFn: async () => {
      return apiFetch<SinglePostRunsResponse>({
        path: `/structura/v1/runs/single?limit=${encodeURIComponent(String(limit))}`,
      });
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const hasInFlight = data.some((run) =>
        NON_TERMINAL_STATUSES.has(run.status),
      );
      return hasInFlight ? REFETCH_INTERVAL_MS : false;
    },
    retry: false,
    staleTime: REFETCH_INTERVAL_MS,
  });
};
