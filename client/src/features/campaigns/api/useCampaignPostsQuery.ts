import { keepPreviousData, useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { ArchitectedPost } from "@/features/dashboard/api/useRecentPostsQuery";
import { useLicense } from "@/features/settings/api/useLicense";

interface CampaignPostsResponse {
  data: ArchitectedPost[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_items: number;
  };
}

export const useCampaignPostsQuery = (
  campaignId: string | number,
  page: number,
  perPage: number = 10
) => {
  const { hasUsableLicense } = useLicense();
  return useQuery<CampaignPostsResponse>({
    queryKey: ["campaign-posts", { campaignId, page, perPage }],
    enabled: hasUsableLicense === true,
    queryFn: async () => {
      const params = new URLSearchParams({
        campaign_id: String(campaignId),
        page: page.toString(),
        per_page: perPage.toString(),
      });
      return apiFetch<CampaignPostsResponse>({
        path: `/structura/v1/analytics/recent-blueprints?${params.toString()}`,
      });
    },
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });
};
