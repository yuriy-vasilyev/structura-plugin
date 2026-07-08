import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { Campaign } from "../types";
import { campaignKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Fetch a single campaign by ID.
 *
 * Uses the list endpoint under the hood (no dedicated single-campaign
 * endpoint exists) but stores the result under its own query key so it
 * can be cached and invalidated independently.
 *
 * Accepts either a number (legacy WP post ID) or a string (cloud
 * Firestore auto-ID). String comparison via String() coercion handles
 * both shapes — the API may return id as either depending on whether
 * the campaign is migrated, freshly cloud-created, or still WP-side.
 */
export const useCampaignQuery = (id: string | number | undefined) => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: campaignKeys.detail(id!),
    queryFn: async () => {
      const campaigns = await apiFetch<Campaign[]>({
        path: "/structura/v1/scheduler/campaigns",
      });
      return campaigns.find((c) => String(c.id) === String(id)) ?? null;
    },
    enabled: hasUsableLicense === true && !!id,
    // Always refetch when navigating to the edit page so we never show
    // stale data after a save-then-back-then-edit cycle.
    staleTime: 0,
    refetchOnMount: "always",
  });
};
