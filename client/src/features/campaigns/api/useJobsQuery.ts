import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { jobKeys } from "./keys";
import { Job } from "@/features/campaigns";
import { useLicense } from "@/features/settings/api/useLicense";

interface JobsResponse {
  data: Job[];
  pagination: {
    current_page: number;
    total_pages: number;
  };
}

export const useJobsQuery = (status: string, page: number, search: string) => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: jobKeys.list({ status, page, search }),
    enabled: hasUsableLicense === true,
    queryFn: async () => {
      const params = new URLSearchParams({ status, page: page.toString(), search });
      return apiFetch<JobsResponse>({
        path: `/structura/v1/jobs?${params.toString()}`,
      });
    },
    // Keep data fresh while debouncing or navigating pages
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
  });
};
