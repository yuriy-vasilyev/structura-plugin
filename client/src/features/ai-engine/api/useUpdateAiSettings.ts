import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@structura/ui";
import { __ } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { settingsKeys } from "@/features/settings/api/keys";

export const useUpdateAiSettings = () => {
  const queryClient = useQueryClient();
  const { successToast, errorToast } = useToast();

  return useMutation({
    mutationFn: (data: any) =>
      apiFetch({
        path: "/structura/v1/settings",
        method: "POST",
        data,
      }),
    onSuccess: () => {
      successToast(__("Processor configuration updated.", "structura"));
      // Invalidate the settings cache to refresh the UI
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: () => {
      errorToast(__("Failed to update configuration.", "structura"));
    },
  });
};
