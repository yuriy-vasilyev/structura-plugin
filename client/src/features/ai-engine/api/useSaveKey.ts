import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@structura/ui";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { settingsKeys } from "@/features/settings/api/keys";

export const useSaveKey = () => {
  const queryClient = useQueryClient();
  const { successToast } = useToast();

  return useMutation({
    mutationFn: (data: { provider: string; key: string }) =>
      apiFetch({
        path: "/structura/v1/keys",
        method: "POST",
        data,
      }),
    onSuccess: () => {
      successToast(__("Key authenticated and encrypted.", "structura"));
      // `useAiSettingsQuery` is now a `useSettingsQuery` projection,
      // so invalidating `settingsKeys.all` refreshes both surfaces
      // (AI Engine + General Settings) with one cache miss.
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
};
