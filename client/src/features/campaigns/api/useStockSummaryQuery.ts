import apiFetch from "@wordpress/api-fetch";
import { useQuery } from "@tanstack/react-query";

import { campaignKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Stock-state breakdown for one campaign.
 *
 * Values are entry counts per `entryStatus`. `total` is the sum and
 * cheap to render. Empty campaigns return all zeros (the cloud emits
 * a flat zero-summary rather than 404 so the SPA can render "0 ready"
 * without a loading-vs-empty branch).
 */
export interface StockSummary {
  pending: number;
  ready: number;
  consumed: number;
  failed: number;
  stale: number;
  total: number;
}

interface SuccessEnvelope {
  success: true;
  summary: StockSummary;
}

/**
 * Polls the plugin REST proxy for one campaign's stock counts.
 *
 * The `enabled` gate matters because the campaign list renders many
 * cards and we don't want to fire N concurrent requests on first
 * paint. Pass `enabled: campaign.pregenerationEnabled` so cards for
 * campaigns that opted out don't poll at all.
 *
 * Stale time is 30s — stock state doesn't change minute-to-minute on
 * a normal campaign (the buffer holds 2 entries, refills only on
 * consume). 30s gives the campaign list a "feels live" refresh
 * without DDoSing the cloud.
 */
export const useStockSummaryQuery = (
  campaignId: string | number,
  options?: { enabled?: boolean },
) => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: campaignKeys.stockSummary(campaignId),
    enabled: hasUsableLicense === true && (options?.enabled ?? true),
    staleTime: 30_000,
    queryFn: async () => {
      const response = (await apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/stock-summary`,
      })) as SuccessEnvelope | undefined;
      // Defensive: an unknown / unstubbed proxy can return null. Fall
      // back to a zero-summary so React Query's "queryFn must not
      // return undefined" warning doesn't fire and the chip simply
      // renders nothing (total === 0 short-circuits the render).
      return (
        response?.summary ?? {
          pending: 0,
          ready: 0,
          consumed: 0,
          failed: 0,
          stale: 0,
          total: 0,
        }
      );
    },
    // Stock summary failures shouldn't trigger toasts — the chip
    // rendering already gracefully handles undefined data.
    meta: { silentError: true },
  });
};
