import { VisualConfig } from "@/features/settings";
import { useQuery } from "@tanstack/react-query";
import { visualKeys } from "@/features/settings/api/keys";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings/api/useLicense";

export const useVisualQuery = () => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: visualKeys.config(),
    queryFn: () => apiFetch<VisualConfig>({ path: "/structura/v1/visual" }),
    enabled: hasUsableLicense === true,
    staleTime: 1000 * 60 * 10,
  });
};
