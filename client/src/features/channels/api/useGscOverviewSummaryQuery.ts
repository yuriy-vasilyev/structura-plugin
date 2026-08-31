/**
 * Reads the site-level Google Search Console overview in summary mode —
 * the wire behind the wp-admin dashboard's "Search Clicks" glance card.
 *
 * Hits the WP REST proxy at `/structura/v1/gsc/overview?summary=1`, which
 * forwards to the cloud `gscSiteOverview` (spec: gsc-integration.md).
 * Summary mode returns 28-day totals + one top mover only — roughly
 * 1/50th of the full overview payload — plus `portalReportUrl`, the deep
 * link into the customer portal's Search performance page.
 *
 * Polling: same contract as `useGscPostStatsQuery` — `state === "pulling"`
 * means the first mirror pull for this property is still running, so we
 * poll every ~5s until the state settles, then stop. The *collecting*
 * presentation (ready but no rows yet) is derived by the rendering
 * surface, not by this hook.
 *
 * License gating mirrors `useChannelConnectionsQuery`: skip the fetch
 * when the host isn't a registered activation (the cloud handshake would
 * 403 every time), and opt out of the global query error toast — the
 * dashboard quietly hiding one stat card is the right UX, not a red
 * "Data Fetch Error" balloon.
 */

import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { channelKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";
import type { GscMirrorState, GscOverviewSummaryResponse } from "../types";

/** Poll cadence while the first mirror pull is running. */
const PULLING_POLL_MS = 5000;

/**
 * Poll decision for the overview summary — extracted so the contract
 * ("poll only while the first mirror pull runs") is unit-testable
 * without faking react-query's timer internals.
 */
export const gscOverviewPollInterval = (
  state: GscMirrorState | undefined,
): number | false => (state === "pulling" ? PULLING_POLL_MS : false);

export const useGscOverviewSummaryQuery = () => {
  const { isActivationValid, hasUsableLicense } = useLicense();

  return useQuery<GscOverviewSummaryResponse>({
    queryKey: channelKeys.gscOverviewSummary(),
    enabled: hasUsableLicense === true && isActivationValid !== false,
    meta: { silentError: true },
    refetchInterval: (query) =>
      gscOverviewPollInterval(query.state.data?.state),
    queryFn: () =>
      apiFetch<GscOverviewSummaryResponse>({
        path: "/structura/v1/gsc/overview?summary=1",
      }),
  });
};
