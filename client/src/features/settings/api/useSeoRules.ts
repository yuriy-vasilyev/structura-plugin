import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { SeoRuleName } from "@/features/settings";
import { settingsKeys } from "@/features/settings/api/keys";
import { useLicense } from "@/features/settings/api/useLicense";
import { PlanId } from "@structura/types";

export interface SettingsSeoRule {
  label: string;
  description: string;
  plan: PlanId;
}

export const useSeoRules = () => {
  const { hasWorkspace } = useLicense();
  const query = useQuery({
    queryKey: settingsKeys.seoRules(),
    queryFn: () =>
      apiFetch<Record<SeoRuleName, SettingsSeoRule>>({
        path: "/structura/v1/settings/seo-rules",
      }),
    enabled: hasWorkspace === true,
    staleTime: 1000 * 60 * 30,
  });

  return {
    rules: query.data,
    isLoading: query.isLoading,
  };
};
