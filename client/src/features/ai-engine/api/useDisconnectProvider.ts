import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { toast } from "@structura/ui";
import { __ } from "@wordpress/i18n";
import { settingsKeys } from "@/features/settings/api/keys";

export const useDisconnectProvider = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) =>
      apiFetch({
        path: `/structura/v1/engine/disconnect/${provider}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success(__("Provider disconnected successfully.", "structura"));
      // See `useSaveKey` for why `settingsKeys.all` is the right
      // invalidation target now that AI Engine derives from the
      // unified settings cache.
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
};
