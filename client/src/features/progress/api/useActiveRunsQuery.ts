import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { RunStatusSerialized } from "@structura/types";
import { progressKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Wire shape returned by `GET /structura/v1/runs/active`. The plugin
 * REST bridge unwraps the cloud's `{ runs: [...] }` envelope and
 * returns the array directly, so the hook types the payload as a
 * bare array rather than a wrapper object (same pattern as
 * `useCampaignRunsQuery`).
 */
type ActiveRunsResponse = RunStatusSerialized[];

/**
 * Fast refetch cadence while an in-flight run is present. The SPA's
 * `RunsProvider` mounts this hook globally so `RunsContext.activeRunId`
 * can self-hydrate after a page refresh — but the query's real value is
 * on the Campaigns list page and any other surface outside a single
 * campaign view. Once the context is populated, `useCampaignRunQuery`
 * takes over the fine-grained 1–5s polling.
 *
 * 30s balances freshness against cloud load: a typical campaign run
 * completes in 1–3 minutes, so a 30s tick is responsive enough to
 * flush the cached in-flight row within ~10% of wall-clock time after
 * a terminal transition. When the list is empty (no active runs),
 * polling pauses entirely — the generate-now mutation invalidates
 * this key on click, so a fresh kickoff reloads immediately.
 */
const REFETCH_INTERVAL_MS = 30_000;

/**
 * React Query hook that lists every currently in-flight (queued /
 * running) run across ALL campaigns for the site, newest-started first.
 * Capped at 10 rows server-side.
 *
 * Powers the SPA's refresh-recovery rehydration path: `RunsContext` is
 * pure in-memory UI state, so a page reload wipes `activeRunId` even
 * when a cloud run is still executing. This hook is the data source
 * the `useRehydrateActiveRunFromSite()` effect reads to repopulate
 * context.
 *
 * Error handling: any non-2xx surfaces as `isError`. Consumers should
 * treat errors as "no rehydration possible" — the user still sees the
 * static page, they just don't see the live strip light up. A retry
 * will happen naturally on the next 30s tick once an in-flight row is
 * seen, or on the next route/SPA mount.
 *
 * Spec: `specs/progress-stream.md` §3 (refresh recovery).
 */
export const useActiveRunsQuery = () => {
  // Phase 1.8 PR8 — anonymous shadow workspaces can have in-flight
  // single-post runs; the rehydrate strip needs to light up for them
  // too. `hasWorkspace` covers both licensed and anonymous installs.
  const { hasWorkspace } = useLicense();
  return useQuery<ActiveRunsResponse>({
    queryKey: progressKeys.activeRuns(),
    enabled: hasWorkspace === true,
    // Opt out of the global QueryCache `onError` toast. Refresh-recovery
    // is a best-effort convenience: a cloud blip here shouldn't surface
    // a red toast on every SPA mount — the worst case is "the strip
    // doesn't light up automatically", which the user can resolve by
    // navigating to the campaign view (the per-run poll will still
    // work).
    meta: { silentError: true },
    queryFn: async () => {
      return apiFetch<ActiveRunsResponse>({
        path: `/structura/v1/runs/active?limit=10`,
      });
    },
    // Pause polling when there are no in-flight rows. The hook is
    // mounted for the full SPA lifetime via `RunsProvider`; polling
    // an empty list every 30s would be pure waste. The generate-now
    // mutation invalidates this key, so a brand-new run reloads the
    // cache immediately without waiting for the next tick.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      return REFETCH_INTERVAL_MS;
    },
    // No automatic retry — see the meta.silentError rationale. A
    // transient blip gets picked up on the next poll once any row is
    // seen, and navigating into a specific campaign's detail view
    // still populates the context via the Generate-Now mutation or
    // the campaign-scoped query.
    retry: false,
    // Treat the list as fresh for a full poll interval — re-mounting
    // the provider (e.g. a React Fast Refresh cycle) shouldn't trigger
    // an immediate refetch.
    staleTime: REFETCH_INTERVAL_MS,
  });
};
