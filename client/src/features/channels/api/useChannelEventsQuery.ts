/**
 * Reads the channel-event activity log for the current site.
 *
 * The WP-side REST handler at `/structura/v1/channels/events` proxies the
 * activation-scoped `channelEvents` collection from Firestore. The proxy
 * exists because the WP plugin holds the activationSecret needed to
 * authenticate the cloud read; the React app never gets to see the secret.
 *
 * Gated on `useLicense().isActivationValid` (same pattern as
 * `useChannelConnectionsQuery` / `useChannelCatalogQuery`): when the
 * current host isn't a registered activation, the proxy's handshake
 * would 403 on every call. We skip the fetch and let the page render
 * its inline advisory instead of showing a generic error toast.
 *
 * Spec: specs/integrations-store-spec.md §10
 */

import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { channelKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";
import type { ChannelEvent } from "../types";

interface UseChannelEventsQueryOptions {
  /** Page size hint sent to the REST handler. Defaults to 25. */
  limit?: number;
}

export const useChannelEventsQuery = (
  options: UseChannelEventsQueryOptions = {},
) => {
  const { isActivationValid, hasUsableLicense } = useLicense();
  const limit = options.limit ?? 25;

  return useQuery({
    queryKey: [...channelKeys.events(), { limit }],
    enabled: hasUsableLicense === true && isActivationValid !== false,
    meta: { silentError: true },
    queryFn: () =>
      apiFetch<ChannelEvent[]>({
        path: `/structura/v1/channels/events?limit=${limit}`,
      }),
  });
};
