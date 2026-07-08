import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { toast } from "@structura/ui";
import { __ } from "@wordpress/i18n";
import { settingsKeys } from "./keys";
import { capture } from "@/lib/posthog";

export const useSettingsMutations = () => {
  const queryClient = useQueryClient();

  const updateSettings = useMutation({
    mutationFn: async ({ slice, data }: { slice: "general" | "ai"; data: any }) =>
      apiFetch({
        path: "/structura/v1/settings",
        method: "POST",
        data: { [slice]: data },
      }),
    onSuccess: (_data, vars) => {
      capture("settings_saved", { slice: vars.slice });
      toast.success(__("Settings synchronized.", "structura"));
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });

  const saveKey = useMutation({
    mutationFn: (vars: { provider: string; key: string }) =>
      apiFetch({ path: "/structura/v1/keys", method: "POST", data: vars }),
    onSuccess: (_data, vars) => {
      capture("ai_key_saved", { provider: vars.provider });
      toast.success(__("API key secured.", "structura"));
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });

  return {
    isUpdating: updateSettings.isPending,
    updateSettings: updateSettings.mutateAsync,
    saveKey: saveKey.mutateAsync,
  };
};
