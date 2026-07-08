import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

interface HeartbeatResponse {
  status: string;
  /**
   * Cloud-only-generation Phase 5c: the plugin no longer holds the
   * provider key and can't make a live latency probe. The endpoint
   * returns `null` when the binding exists but no live measurement
   * was taken; positive numbers are kept for forward-compat with a
   * future cloud-side probe that does have access to the key.
   */
  latency: number | null;
  timestamp: number;
}

/**
 * Provider heartbeat — answers "does this provider's binding exist
 * on the cloud activation doc?".
 *
 * No workspace / license gate (Phase 1.8 §1.8.4 follow-up): the
 * plugin REST endpoint requires `manage_options`, and the cloud-side
 * `listProviderCredentials` already accepts both licensed AND
 * anonymous bearers via `requireActivationBearer`. Pre-2026-05-10
 * the gate read `hasUsableLicense` (excluded anonymous), then
 * `hasWorkspace` (still null while settings revalidate); both
 * branches silently disabled the auto-fire and forced the user to
 * click "Test Connection" on the wizard's test step. Dropping the
 * SPA-side gate unifies behaviour across tiers — the moment the
 * wizard reaches the test step with `isConnected === true`, the
 * heartbeat fires. If the user has no bearer (bootstrap not done
 * yet), the cloud returns 404 and the wizard renders the manual
 * fallback the same way it did before.
 */
export const useProviderPulse = (providerId: string, isConnected: boolean) => {
  const { data, isFetching, refetch, isSuccess } = useQuery({
    queryKey: ["provider-heartbeat", providerId],

    queryFn: () =>
      apiFetch<HeartbeatResponse>({
        path: `/structura/v1/heartbeat/${providerId}`,
      }),

    enabled: isConnected,
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });

  const handleCheck = () => {
    if (!isConnected) return;
    refetch();
  };

  // `isOnline` is the true "the connection is live" signal — pre-
  // Phase-5c we leaned on `latency > 0` because the heartbeat always
  // came back with a positive number. Now that the plugin can return
  // `latency: null`, we read `status === "online"` instead so the
  // wizard's Configure gate stays green when the binding exists.
  return {
    isOnline: isSuccess && data?.status === "online",
    latency: typeof data?.latency === "number" && data.latency > 0 ? data.latency : null,
    isChecking: isFetching,
    checkPulse: handleCheck,
  };
};
