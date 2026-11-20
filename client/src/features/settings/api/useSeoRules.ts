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
  /**
   * `"content"`: shown with the campaign's always-visible content settings
   * instead of under SEO Directives (the References list). Absent from plugin
   * builds before 2.42.0, where every rule sits in SEO Directives.
   */
  placement?: "content";
}

/** Whether a registry rule is shown with the content settings rather than under SEO Directives. */
export const isContentSettingRule = (rule: SettingsSeoRule): boolean => rule.placement === "content";

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
