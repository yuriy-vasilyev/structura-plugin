import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Interface representing the architected post data from WordPress
 */
export interface ArchitectedPost {
  id: number;
  title: string;
  status: "publish" | "draft" | "pending" | "future";
  date: string;
  permalink: string;
  edit_link: string;
  thumbnail: string | null;
  author: string;
  model: string;
}

interface BlueprintsResponse {
  data: ArchitectedPost[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_items: number;
  };
}

/**
 * Hook to fetch the 10 most recently architected posts.
 * Filters by the presence of the '_structura_campaign_id' meta key.
 */
export const useRecentPostsQuery = () => {
  const { hasUsableLicense } = useLicense();
  return useQuery<ArchitectedPost[]>({
    queryKey: ["dashboard", "recent-posts"],
    queryFn: async () => {
      const res = await apiFetch<BlueprintsResponse>({
        path: "/structura/v1/analytics/recent-blueprints",
      });
      return res.data;
    },
    enabled: hasUsableLicense === true,
    // Data remains "fresh" for 2 minutes to reduce DB load on the home page
    staleTime: 1000 * 60 * 2,
    // Keep in cache for 10 minutes
    gcTime: 1000 * 60 * 10,
    // Optionally retry once if the WP REST API is temporarily busy
    retry: 1,
  });
};
