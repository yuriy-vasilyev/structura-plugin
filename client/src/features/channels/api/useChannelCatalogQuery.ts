/**
 * Reads the cloud integration catalog annotated with per-caller entitlement.
 *
 * Hits the WP REST proxy at `/structura/v1/channels/catalog`, which forwards
 * to the cloud `channelsListCatalog` function. The response includes the
 * caller's current plan + active add-ons so the Store UI can render tier
 * badges and an accurate "Install / Upgrade plan / Add Channels" CTA
 * without a second round-trip for license status.
 *
 * Treated as a low-churn query: `staleTime: 5 minutes` because the catalog
 * only changes on deploy and the plan changes are infrequent during a
 * session. Store page navigations within the stale window hit the cache.
 *
 * Gated on `useLicense().isActivationValid`: when the current host isn't
 * a registered activation the cloud handshake would 403, so we skip the
 * fetch and let the consuming page render an inline advisory. We also
 * opt out of the global query error toast (`meta.silentError`) for the
 * same reason — a page-level banner is better UX than a generic
 * "Data Fetch Error" balloon.
 */

import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { channelKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";
import type { ListCatalogResponse } from "../types";

const FIVE_MINUTES = 5 * 60 * 1000;

export const useChannelCatalogQuery = () => {
  const { isActivationValid, hasUsableLicense } = useLicense();
  return useQuery<ListCatalogResponse>({
    queryKey: channelKeys.catalog(),
    staleTime: FIVE_MINUTES,
    // See useChannelConnectionsQuery for the rationale: `null` means
    // "unknown, allow" so paid users don't wait on the heartbeat before
    // the catalog loads; `false` means "confirmed host mismatch, don't
    // bother" and the page renders its advisory.
    enabled: hasUsableLicense === true && isActivationValid !== false,
    meta: { silentError: true },
    queryFn: async () => {
      const response = await apiFetch<ListCatalogResponse>({
        path: "/structura/v1/channels/catalog",
      });
      // Defensive: if the cloud returns a malformed envelope for some reason,
      // coerce to an empty catalog so the Store renders its empty state
      // rather than crashing the whole Channels area.
      if (!response || !Array.isArray(response.entries)) {
        return {
          success: true,
          plan: "free",
          activeAddons: [],
          entries: [],
        };
      }
      return response;
    },
  });
};
