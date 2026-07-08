import apiFetch from "@wordpress/api-fetch";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Force-refreshes the remote model catalog.
 *
 * Clears the server-side transient cache and re-fetches from the cloud
 * endpoint, then invalidates the client-side React Query cache so the
 * UI picks up the fresh data immediately.
 *
 * Use when the setup wizard shows zero models for a provider — most
 * likely caused by a stale cache from before the provider was deployed.
 */
export const useRefreshModels = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<unknown>({ path: "/structura/v1/models/refresh", method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });
};
