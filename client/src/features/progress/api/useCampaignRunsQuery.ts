import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { RunStatusSerialized } from "@structura/types";
import { progressKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Wire shape returned by `GET /structura/v1/campaigns/{campaign_id}/runs`.
 * The plugin REST bridge unwraps the cloud's `{ runs: [...] }` envelope and
 * returns the array directly (same pattern as the Needs-Attention list —
 * see `Rest_Api::runs_list_attention` / `Rest_Api::campaign_runs_list`),
 * so the hook types the payload as a bare array rather than a wrapper
 * object.
 */
type CampaignRunsResponse = RunStatusSerialized[];

/**
 * Fast refetch cadence while the tab is visible. The Runs tab isn't the
 * ephemeral polling surface (that's the drawer's `useCampaignRunQuery`
 * hook at 1–5s) — it's the historical receipt view — but it still needs
 * to reflect an in-flight run's terminal transition without requiring
 * the user to switch tabs. 30s balances freshness against cloud load:
 * a typical campaign run completes in 1–3 minutes, so a 30s tick picks
 * up the status change within 10% of the run's wall-clock time.
 */
const REFETCH_INTERVAL_MS = 30_000;

/**
 * Statuses that keep us polling at the fast cadence. Once every row in
 * the list has a terminal status the hook pauses polling entirely — no
 * point asking the cloud "did anything change?" when the answer is
 * definitionally "no" until the user kicks off a new run from the
 * campaign view.
 *
 * Kept in sync with `useCampaignRunQuery` — the drawer treats the same
 * set as "non-terminal". Duplicating the constant here (rather than
 * exporting from useCampaignRunQuery) keeps the two hooks decoupled:
 * the drawer could tighten its polling rules in the future (e.g. drop
 * `queued` in favor of a different state) without forcing the tab to
 * follow suit.
 */
const NON_TERMINAL_STATUSES = new Set<string>([
  "queued",
  "running",
  // Webhook-delivery fallback parked state — keep the list refreshing until
  // the plugin's poller pulls the post and it flips to succeeded.
  "awaiting_pull",
]);

/**
 * React Query hook that fetches every run recorded for a single campaign,
 * newest first. Powers the "Runs" tab on the campaign detail page — the
 * historical receipt view.
 *
 * Unlike `useCampaignRunQuery` (which polls one run aggressively while
 * the drawer is open), this hook refetches on a slow tick (30s) only
 * while the list contains an in-flight row. Once every row is terminal
 * the poll pauses entirely — the list is frozen until the user kicks
 * off another run, at which point the campaign view's Generate-Now
 * mutation invalidates this key.
 *
 * Error handling: any non-2xx from the plugin REST bridge — transport
 * blip, plugin-side 5xx, cloud-reported failure — surfaces as `isError`.
 * The Runs tab owns the error UI (inline "Couldn't load run history"
 * card with a retry button). Historically this branch also absorbed a
 * `feature_disabled` 404 from the progress-stream kill-switch; that
 * flag was removed on 2026-04-22 and the 404 path no longer exists for
 * this endpoint.
 *
 * @param campaignId Non-nullable campaign id (string or number). The hook is enabled only
 *                   when campaignId is truthy — lets callers mount it
 *                   unconditionally without guarding every call site.
 * @param limit      Server-side clamp is 1..50; client default is 20.
 */
export const useCampaignRunsQuery = (
  campaignId: string | number | undefined,
  limit: number = 20,
) => {
  const { hasUsableLicense } = useLicense();
  // Enable only if we have a campaignId and (if numeric) it's positive
  const isValid = campaignId !== null && campaignId !== undefined &&
    (typeof campaignId === 'string' || campaignId > 0);

  return useQuery<CampaignRunsResponse>({
    queryKey: progressKeys.campaignRuns(campaignId as string | number),
    enabled: hasUsableLicense === true && isValid,
    // Opt out of the global QueryCache `onError` toast. The tab is an
    // at-a-glance surface; a transient network blip or a cloud-side 5xx
    // should render inline (the Runs tab's "Couldn't load run history"
    // card with a retry button) rather than surface a red toast every
    // 30s. Same reasoning as the drawer's `useCampaignRunQuery` hook —
    // the tab owns its own error copy.
    meta: { silentError: true },
    queryFn: async () => {
      if (!isValid) {
        // Unreachable — `enabled` guards the hook — but keeps the next
        // maintainer from accidentally calling this without a real id.
        throw new Error("useCampaignRunsQuery called without a valid campaignId");
      }
      return apiFetch<CampaignRunsResponse>({
        path: `/structura/v1/campaigns/${encodeURIComponent(
          String(campaignId),
        )}/runs?limit=${encodeURIComponent(String(limit))}`,
      });
    },
    // Pause polling once the list is all-terminal. An empty list also
    // pauses — there's no reason to probe a campaign that has never run.
    // The moment a new run starts, the campaign view's mutation handler
    // invalidates this key and the tab reloads immediately.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const hasInFlight = data.some((run) =>
        NON_TERMINAL_STATUSES.has(run.status),
      );
      return hasInFlight ? REFETCH_INTERVAL_MS : false;
    },
    // No automatic retry. The Runs tab renders errors inline with an
    // explicit "Try again" button, so the UX contract is "one attempt,
    // surface the failure, let the user retry". Silent background
    // retries would mask the failure for the 30s poll window and hide
    // cloud-side 5xx spikes that the user should see in the UI. A
    // transient blip will get picked up on the next poll anyway once
    // the list has at least one in-flight row.
    retry: false,
    // Treat the list as fresh for a full poll interval — tab-switching
    // back onto the Runs tab within that window shouldn't trigger a
    // refetch. The list doesn't stream new rows mid-poll; the next
    // tick will catch any new terminal state.
    staleTime: REFETCH_INTERVAL_MS,
  });
};
