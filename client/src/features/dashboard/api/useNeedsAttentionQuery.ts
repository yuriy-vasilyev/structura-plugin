import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { RunStatusSerialized } from "@structura/types";

import { dashboardKeys } from "./keys";
import { campaignKeys } from "@/features/campaigns/api/keys";
import type { Campaign } from "@/features/campaigns/types";

/**
 * Run-acknowledge mutations — data layer.
 *
 * The companion `useNeedsAttentionQuery` read hook + the
 * `<NeedsAttentionWidget>` it powered were retired on 2026-05-10
 * (Yurii feedback: the widget read as visual noise on the dashboard
 * — empty state too prominent, copy too alarming, and most failures
 * were already obvious from the campaign / generate surfaces). The
 * acknowledge / unacknowledge mutations live on because they're
 * still used by the Campaigns page row-actions menu — the verb
 * "dismiss this failed run from my open list" remains useful even
 * without a global widget surfacing the list.
 *
 * Mutations (`useAcknowledgeRunMutation` / `useUnacknowledgeRunMutation`):
 * POST /structura/v1/runs/{id}/acknowledge | /unacknowledge. Optimistic
 * update patterns invalidate the (now-unused) attention-runs cache
 * key so any future reader gets a fresh list on next mount.
 *
 * Spec: `specs/run-detail-view.md` §6 (widget — historical), §8 (transport).
 */

/**
 * Acknowledge (Dismiss) a single run. Optimistically removes the row
 * from the cached list so the widget updates the moment the user
 * clicks. The mutation's `onError` rolls the cache back if the cloud
 * rejects the write.
 *
 * The Undo toast lives in the component (10s timeout wired through
 * `useToast` from @structura/ui). Triggering Undo calls the
 * `useUnacknowledgeRunMutation` hook below — NOT a cache revert — so
 * the toast works even if the user navigates away and back.
 */
export const useAcknowledgeRunMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { success: true },
    unknown,
    string,
    { previousRuns?: RunStatusSerialized[]; previousCampaigns?: Campaign[] }
  >({
    mutationFn: (runId: string) =>
      apiFetch<{ success: true }>({
        path: `/structura/v1/runs/${encodeURIComponent(runId)}/acknowledge`,
        method: "POST",
      }),
    onMutate: async (runId) => {
      // Snapshot BOTH caches before touching either — the pill on a
      // campaign card reads from the campaigns cache, not the
      // attention-runs cache. A partial rollback would leave one
      // surface consistent and the other visually stale.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: dashboardKeys.attentionRuns() }),
        queryClient.cancelQueries({ queryKey: campaignKeys.lists() }),
      ]);
      const previousRuns = queryClient.getQueryData<RunStatusSerialized[]>(
        dashboardKeys.attentionRuns(),
      );
      const previousCampaigns = queryClient.getQueryData<Campaign[]>(
        campaignKeys.lists(),
      );
      if (previousRuns) {
        queryClient.setQueryData<RunStatusSerialized[]>(
          dashboardKeys.attentionRuns(),
          previousRuns.filter((r) => r.runId !== runId),
        );
      }
      // Strip the matching `lastRun` signal from any campaign card
      // whose pill points at this runId. The server still has the
      // full last-run context (the Campaigns list endpoint can carry
      // other signals like scheduling metadata) — only the ack-gated
      // pill source gets cleared. Missing field tolerates older
      // plugin builds that never sent `lastRun`.
      if (previousCampaigns) {
        queryClient.setQueryData<Campaign[]>(
          campaignKeys.lists(),
          previousCampaigns.map((c) =>
            c.lastRun && c.lastRun.runId === runId
              ? { ...c, lastRun: undefined }
              : c,
          ),
        );
      }
      return { previousRuns, previousCampaigns };
    },
    onError: (_err, _runId, ctx) => {
      // Roll back on transport / cloud failure. The caller surfaces
      // an error toast; optimistic-restore here prevents the row from
      // appearing to vanish-then-reappear.
      if (ctx?.previousRuns) {
        queryClient.setQueryData(dashboardKeys.attentionRuns(), ctx.previousRuns);
      }
      if (ctx?.previousCampaigns) {
        queryClient.setQueryData(campaignKeys.lists(), ctx.previousCampaigns);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.attentionRuns() });
      // Campaign cards carry an `lastRun` signal derived from the same
      // underlying attention-runs cache the widget reads from (see
      // `Rest_Api::attention_runs_by_campaign`). Invalidating the
      // campaigns list forces the "Needs attention" pill on the
      // matching card to clear as soon as the cloud ack settles —
      // otherwise the pill sits for up to 30 s (the campaigns
      // refetch interval) after the ack went through.
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
};

/**
 * Undo an acknowledge — reverses the flag on the server and
 * invalidates the cached list so the row reappears.
 *
 * No optimistic add: the row was removed from the cache by the
 * corresponding acknowledge mutation, and we don't have the full
 * `RunStatusSerialized` locally on the Undo path (only the runId).
 * The invalidate triggers a refetch which will surface the row
 * again from the cloud.
 */
export const useUnacknowledgeRunMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<{ success: true }, unknown, string>({
    mutationFn: (runId: string) =>
      apiFetch<{ success: true }>({
        path: `/structura/v1/runs/${encodeURIComponent(runId)}/unacknowledge`,
        method: "POST",
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.attentionRuns() });
      // Unacknowledge restores the card's pill too — keep the
      // campaigns list in lockstep with the widget's state.
      queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
    },
  });
};
