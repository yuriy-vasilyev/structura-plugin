import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@structura/ui";
import { __ } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { campaignKeys, jobKeys } from "./keys";
import { useRuns } from "@/features/progress";

/**
 * Shape of `POST /structura/v1/jobs/run` — the REST handler
 * (`Rest_Api::run_task`) returns `campaign_run_id` alongside the old
 * success/message envelope. The field is NEW as of progress-stream
 * Phase 1; a plugin running against an older client won't care, but
 * we treat `campaign_run_id` as optional here so an older plugin
 * delivering the pre-progress-stream response shape (no runId) still
 * resolves cleanly.
 *
 * When present, the runId is pushed into `useRuns()` — paired with the
 * campaignId the mutation was fired for — so the inline
 * `CampaignRunProgress` strip on that specific campaign's card lights
 * up immediately, before Action Scheduler has even picked up the job.
 * Spec: `specs/progress-stream.md` §7.3.
 */
interface RunJobResponse {
  success: boolean;
  message?: string;
  /** UUID minted by the plugin in `Rest_Api::run_task`. Optional for back-compat. */
  campaign_run_id?: string;
}

export const useJobMutations = () => {
  const queryClient = useQueryClient();
  const { successToast, errorToast } = useToast();
  const { setActiveRun } = useRuns();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    queryClient.invalidateQueries({ queryKey: campaignKeys.lists() });
  };

  const runMutation = useMutation({
    mutationFn: (campaignId: string | number) =>
      apiFetch<RunJobResponse>({
        path: `/structura/v1/jobs/run`,
        method: "POST",
        data: { campaign_id: campaignId },
      }),
    // `campaignId` is read from the mutation variables (second arg) so
    // we can pair it with the runId returned in the response. Using
    // variables rather than shoehorning campaignId into the mutationFn
    // return shape keeps the wire type honest — the REST reply really
    // doesn't carry it; we're combining server state with the known
    // call-site input.
    onSuccess: (res, campaignId) => {
      // Push the runId + campaignId into RunsContext BEFORE the toast
      // fires. This makes the inline progress strip appear near-instant
      // on the originating campaign card — the user sees "a thing is
      // happening on THIS card" before they have time to wonder whether
      // the click registered. Pairing with campaignId matters because
      // the first poll typically 404s during the Action Scheduler
      // jitter window (up to ~10s until the cloud dispatcher primes
      // the Firestore run doc), and without the campaignId we couldn't
      // tell which card should light up until that first 200 lands.
      //
      // If the plugin is older and didn't return a runId, we skip
      // silently; the old toast-only flow stays functional until the
      // plugin upgrade lands.
      if (res.campaign_run_id) {
        setActiveRun({
          runId: res.campaign_run_id,
          campaignId,
        });
      }
      successToast(res.message || __("Campaign execution initiated.", "structura"));
      invalidate();
    },
  });

  const retryMutation = useMutation({
    mutationFn: (actionId: number) =>
      apiFetch({
        path: `/structura/v1/jobs/retry`,
        method: "POST",
        data: { id: actionId },
      }),
    onSuccess: () => {
      successToast(__("Task rescheduled for immediate retry.", "structura"));
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (actionId: number) =>
      apiFetch({
        path: `/structura/v1/jobs/${actionId}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      successToast(__("Task removed from queue.", "structura"));
      invalidate();
    },
  });

  return {
    runNow: runMutation.mutateAsync,
    isRunningNow: runMutation.isPending,
    retry: retryMutation.mutateAsync,
    deleteJob: deleteMutation.mutateAsync,
    runMutation,
    retryMutation,
    deleteMutation,
    isAnyProcessing: runMutation.isPending || retryMutation.isPending || deleteMutation.isPending,
  };
};
