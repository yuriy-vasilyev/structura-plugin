/**
 * Notices polled query for the wp-admin Notices page.
 *
 * Spec: `specs/v2/notification-center.md` §5.2.
 *
 * The wp-admin SPA polls instead of subscribing live because the
 * Firebase SDK isn't shipped into wp-admin (bundle-size + CSP
 * considerations — see `specs/plugin-quiet-mode.md`). Polling every
 * 60s keeps the surface responsive without burning REST traffic on
 * an idle workspace.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings/api/useLicense";

import type { NoticeStatus, NoticesResponse } from "../types";

/** Poll cadence — matches the spec's "every 60s" guidance. */
const POLL_INTERVAL_MS = 60_000;

export interface UseNoticesQueryOptions {
  /** Defaults to `["open", "acknowledged"]` (the inbox view). */
  statuses?: NoticeStatus[];
  limit?: number;
  cursor?: string;
}

export const useNoticesQuery = (options: UseNoticesQueryOptions = {}) => {
  const { statuses, limit, cursor } = options;
  const { hasUsableLicense } = useLicense();

  return useQuery({
    queryKey: ["notices", { statuses, limit, cursor }],
    enabled: hasUsableLicense === true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statuses && statuses.length > 0) {
        params.append("statuses", statuses.join(","));
      }
      if (limit) params.append("limit", String(limit));
      if (cursor) params.append("cursor", cursor);
      const qs = params.toString();
      return apiFetch<NoticesResponse>({
        path: `/structura/v1/notices${qs ? `?${qs}` : ""}`,
      });
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: POLL_INTERVAL_MS,
  });
};
