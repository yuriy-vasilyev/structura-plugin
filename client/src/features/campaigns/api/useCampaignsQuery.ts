import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { Campaign } from "../types"; // Assuming CampaignRaw is the flat type from the DB
import { campaignKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

export const useCampaignsQuery = () => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: campaignKeys.lists(),
    queryFn: async () => {
      return await apiFetch<Campaign[]>({
        path: "/structura/v1/scheduler/campaigns",
      });
    },
    enabled: hasUsableLicense === true,
    // A just-created campaign has no `stats.nextRun` until the plugin's
    // Action Scheduler computes its first occurrence (a beat after create).
    // Poll fast until every active campaign has one — so the card flips from
    // "Not scheduled" to the real date on its own — then settle back to the
    // 30s ambient refresh.
    refetchInterval: (query) => {
      const campaigns = (query.state.data as Campaign[] | undefined) ?? [];
      const awaitingSchedule = campaigns.some(
        (c) => c.status === "active" && !c.stats?.nextRun,
      );
      return awaitingSchedule ? 5000 : 30000;
    },
    staleTime: 10000,
  });
};
