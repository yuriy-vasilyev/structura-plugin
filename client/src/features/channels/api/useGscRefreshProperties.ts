/**
 * Re-lists the connected Google account's Search Console properties on the
 * stored OAuth token — the GSC connect modal's "I've verified — check
 * again" (no-property guidance) and "Try again" (insufficient permission)
 * actions.
 *
 * Hits the WP REST proxy at POST `/structura/v1/gsc/refresh-properties`
 * (no body — the proxy holds the activation secret and the cloud resolves
 * the activation's single GSC connection itself). No new OAuth round-trip
 * is involved; the cloud re-runs the `sites.list` lookup and auto-selects
 * a fresh match server-side when no property was chosen yet.
 *
 * On success the connections cache is invalidated: the cloud may have
 * persisted an auto-selection (or a changed property list) that the
 * connection rows and the Search-performance surfaces must pick up. The
 * modal itself renders straight from the response rather than waiting for
 * the refetch, so the state flip is immediate.
 *
 * No toasts here — the modal owns all four outcome states (confirm,
 * picker, "not found yet" propagation line, error alert) inline.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { channelKeys } from "./keys";
import type { GscRefreshPropertiesResponse } from "../types";

export const useGscRefreshProperties = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<GscRefreshPropertiesResponse>({
        path: "/structura/v1/gsc/refresh-properties",
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: channelKeys.connections(),
      });
    },
  });

  return {
    refreshProperties: mutation.mutateAsync,
    isRefreshing: mutation.isPending,
  };
};
