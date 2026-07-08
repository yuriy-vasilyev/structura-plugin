import apiFetch from "@wordpress/api-fetch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";

import { toast } from "@structura/ui";
import { campaignKeys } from "./keys";

/**
 * Mutations for the campaign Stock tab.
 *
 * All three proxy through the plugin REST bridge to the cloud, which
 * cancels any in-flight provider batch BEFORE removing an entry —
 * deleting from the UI can never orphan a provider-side job (the
 * 2026-06-04 wedged-batch incident was abandoned jobs piling up in
 * the provider queue with nothing cancelling them).
 *
 * Invalidation: stock list + summary together, so the tab, the tab
 * chip, and the campaign-card chip all reflect the change on the
 * next paint.
 */
export const useStockMutations = (campaignId: string | number) => {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: campaignKeys.stock(campaignId) });
    void queryClient.invalidateQueries({
      queryKey: campaignKeys.stockSummary(campaignId),
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (stockId: string) =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/stock/${stockId}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success(__("Stock post discarded.", "structura"));
      invalidate();
    },
  });

  const clearMutation = useMutation({
    mutationFn: () =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/stock/clear`,
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(__("Stock emptied.", "structura"));
      invalidate();
    },
  });

  const restockMutation = useMutation({
    mutationFn: () =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/stock/restock`,
        method: "POST",
      }) as Promise<{ success: boolean; refill: string; refillOk: boolean }>,
    onSuccess: (result) => {
      // `rate_limited` means a refill is already underway (the cloud's
      // delete trigger won the slot) — success from the user's seat.
      if (result?.refillOk) {
        toast.success(__("Regenerating stock — fresh posts are on the way.", "structura"));
      } else if (result?.refill === "daily_cap_hit") {
        toast.error(
          __(
            "Stock regeneration is paused for today — this campaign hit its daily refill limit.",
            "structura",
          ),
        );
      } else {
        toast.error(__("Could not start the regeneration. Please try again later.", "structura"));
      }
      invalidate();
    },
  });

  return {
    deleteEntry: deleteMutation.mutateAsync,
    isDeletingEntry: deleteMutation.isPending,
    clearStock: clearMutation.mutateAsync,
    isClearing: clearMutation.isPending,
    restock: restockMutation.mutateAsync,
    isRestocking: restockMutation.isPending,
  };
};
