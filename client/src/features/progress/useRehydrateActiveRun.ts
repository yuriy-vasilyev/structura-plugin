import { useEffect } from "react";
import { useRuns } from "./context/RunsContext";
import { useActiveRunsQuery } from "./api/useActiveRunsQuery";

/**
 * Rehydrates `RunsContext.activeRunId` from server state on mount.
 *
 * The problem this solves: `RunsContext` is a pure in-memory UI state
 * holder (see its docblock). The only writer is the Generate-Now
 * mutation, which pushes `{runId, campaignId}` at click time. That
 * works within a single SPA session — but on a page refresh (F5,
 * cmd-R, the user re-opens wp-admin), the context boots empty even
 * when a campaign run is still in flight server-side.
 *
 * The symptom: user kicks off a run, refreshes the page to check a
 * UI change, and the `CampaignRunProgress` strip is gone — even
 * though the Runs tab (or any other surface that reads server state
 * directly) still shows the run as `queued` / `running`. From the
 * user's perspective it looks like the plugin lost their run.
 *
 * The fix: at the `RunsProvider` level — i.e. once per SPA mount, not
 * per route — call the site-wide `/runs/active` endpoint via
 * `useActiveRunsQuery`. Pick the first non-terminal row (newest-
 * started by the cloud's `orderBy startedAt desc`) and push it into
 * context. The hook is deliberately site-wide rather than
 * campaign-scoped: on a refresh the user might land on the Campaigns
 * list, on Settings, or on a specific campaign detail — none of those
 * know which campaign the in-flight run is for until the list comes
 * back. Mounting a single site-level query keeps the rehydration
 * logic in one place and avoids per-card fan-out.
 *
 * Guard rails:
 *   - Only fires when `activeRunId` is currently `null`. If the
 *     Generate-Now mutation already populated the context in this
 *     session, we do NOT override with whatever the server's latest
 *     says — the mutation's runId is the source of truth for the
 *     "just launched" case.
 *   - Only picks `queued` or `running` rows (by definition, since
 *     that's what the cloud endpoint returns). Terminal runs have
 *     their own surfaces (toasts, `RunDetailPage`); the inline strip
 *     is strictly for live activity.
 *   - Re-hydrates if the freshest in-flight row's runId changes.
 *     Example: user's session had run A finished + acknowledged →
 *     activeRunId null, they kick off run B, refresh → rehydrates to
 *     B. The effect's deps are keyed on the picked runId so stale
 *     polls don't clobber a fresh mutation.
 */
export const useRehydrateActiveRun = (): void => {
  const { activeRunId, setActiveRun } = useRuns();
  const { data } = useActiveRunsQuery();

  useEffect(() => {
    if (activeRunId) return; // Already have a run — don't clobber.
    if (!data || data.length === 0) return;
    // Cloud returns the list already sorted newest-started first, so
    // index 0 is the freshest. We don't re-sort here: the cloud is the
    // source of truth for ordering and duplicating the comparator
    // would invite drift.
    const inflight = data[0];
    if (!inflight) return;
    setActiveRun({
      runId: inflight.runId,
      campaignId: inflight.campaignId,
    });
  }, [activeRunId, data, setActiveRun]);
};
