import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@structura/ui";
import { __ } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { VisualConfig } from "@/features/settings";
import { visualKeys } from "./keys";

export const useVisualMutations = () => {
  const queryClient = useQueryClient();

  // 1. Persist Config
  const saveMutation = useMutation({
    mutationFn: (data: VisualConfig) =>
      apiFetch({ path: "/structura/v1/visual", method: "POST", data }),
    onSuccess: () => {
      toast.success(__("Art direction synchronized.", "structura"));
      queryClient.invalidateQueries({ queryKey: visualKeys.config() });
    },
  });

  return {
    saveConfig: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
};
