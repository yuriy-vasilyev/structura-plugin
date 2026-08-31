/**
 * Reads one post's Google Search Console stats from the GSC mirror.
 *
 * Hits the WP REST proxy at `/structura/v1/gsc/post-stats?page_url=…`,
 * which forwards to the cloud mirror read (spec: gsc-integration.md
 * §4.6). The response is a pure read — no secret material — so it's
 * safe to render directly.
 *
 * Polling: `state === "pulling"` means the first mirror pull for this
 * property is still running. We poll every ~5s until the state settles
 * (`ready` / `not_connected` / `expired`), then stop. Note the
 * distinction the design handoff insists on: *pulling* is a loading
 * state (skeleton), while *collecting* is `ready` with no page data yet
 * because the post is freshly published — that branch is derived by the
 * rendering surface, not by this hook.
 *
 * License gating mirrors `useChannelConnectionsQuery`: skip the fetch
 * entirely when the host isn't a registered activation (the cloud
 * handshake would 403 every time), and opt out of the global query
 * error toast — a run-receipt page quietly hiding its search section is
 * the right UX, not a red "Data Fetch Error" balloon.
 */

import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { channelKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";
import type { GscPostStatsResponse } from "../types";

/** Poll cadence while the first mirror pull is running. */
const PULLING_POLL_MS = 5000;

export const useGscPostStatsQuery = (pageUrl: string | null) => {
  const { isActivationValid, hasUsableLicense } = useLicense();

  return useQuery<GscPostStatsResponse>({
    queryKey: channelKeys.gscPostStats(pageUrl ?? ""),
    enabled:
      Boolean(pageUrl) &&
      hasUsableLicense === true &&
      isActivationValid !== false,
    meta: { silentError: true },
    refetchInterval: (query) =>
      query.state.data?.state === "pulling" ? PULLING_POLL_MS : false,
    queryFn: async () => {
      if (!pageUrl) {
        // Unreachable — `enabled: false` prevents execution — but keeps
        // the TS narrowing honest for the encode below.
        throw new Error("useGscPostStatsQuery called without a pageUrl");
      }
      return apiFetch<GscPostStatsResponse>({
        path: `/structura/v1/gsc/post-stats?page_url=${encodeURIComponent(pageUrl)}`,
      });
    },
  });
};
