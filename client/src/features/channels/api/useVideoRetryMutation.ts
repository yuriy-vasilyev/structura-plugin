/**
 * Retry / regenerate a video render job.
 *
 * POSTs to the WP REST proxy at `/structura/v1/channels/video/retry`,
 * which forwards to the cloud `channelsVideoRetry` function with the
 * activation auth envelope (the browser never sees the secret — same
 * pattern as every other channels proxy call).
 *
 * One endpoint serves both Activity-row actions:
 *   - "Retry render" on a failed job (free — the failure consumed no quota)
 *   - "Regenerate" on an expired job (uses 1 video from the monthly quota;
 *     the row copy says so before the click)
 *
 * On success we invalidate the events query so the row flips to
 * "Rendering" on the next fetch instead of staying stale.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { toast } from "@structura/ui";
import { channelKeys } from "./keys";
import type { VideoRetryResponse } from "../types";

export const useVideoRetryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<VideoRetryResponse>({
        path: "/structura/v1/channels/video/retry",
        method: "POST",
        data: { job_id: jobId },
      }),
    onSuccess: () => {
      toast.success(
        __("Render restarted — it will appear here in a few minutes.", "structura"),
      );
      void queryClient.invalidateQueries({ queryKey: channelKeys.events() });
    },
    onError: (error) => {
      // Surface the cloud's own reason verbatim (proxied through WP_Error →
      // apiFetch throws with that message) so the toast is actionable.
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : __("Could not restart the render. Please try again.", "structura"),
      );
    },
  });
};
