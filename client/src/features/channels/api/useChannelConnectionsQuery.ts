/**
 * Reads the activation's saved channel connections.
 *
 * Hits the WP REST proxy at `/structura/v1/channels/connections`, which
 * forwards the call to the cloud `channelsListConnections` function. The
 * cloud already scrubs every connection of secret material before returning
 * it (the encrypted token blob lives in a separate `connectionSecrets`
 * collection that's admin-SDK only), so the array we receive is safe to
 * render directly.
 *
 * Gated on `useLicense().isActivationValid`: when the current host isn't
 * a registered activation (e.g. site activated on DDEV and now served via
 * ngrok share) the cloud handshake would 403 on every call, so we skip
 * the fetch entirely and let the consuming page render its inline
 * "reconnect this site" advisory. We also opt out of the global query
 * error toast (`meta.silentError`) — on the off chance a handshake
 * failure slips through, the page-level advisory is the right UX, not a
 * generic "Data Fetch Error" balloon.
 *
 * Return shape: `data` stays `ConnectionSummary[]` (every historical
 * consumer reads it that way); the video channel's top-level `videoQuota`
 * envelope field is surfaced as an extra `videoQuota` property on the
 * result so the quota meters (connection row + config-modal footer) don't
 * need a second round-trip.
 */

import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { channelKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";
import type {
  BoundVisualPresetSummary,
  ConnectionSummary,
  ListConnectionsResponse,
  VideoQuota,
} from "../types";

interface ChannelConnectionsData {
  connections: ConnectionSummary[];
  videoQuota?: VideoQuota;
  /** See ListConnectionsResponse — `undefined` (older cloud) ≠ `null`. */
  boundVisualPreset?: BoundVisualPresetSummary | null;
}

export const useChannelConnectionsQuery = () => {
  const { isActivationValid, hasUsableLicense } = useLicense();
  const query = useQuery<ChannelConnectionsData>({
    queryKey: channelKeys.connections(),
    // Skip the network round-trip when useLicense has already told us
    // the current host isn't a registered activation — the handshake
    // would fail every time. `null` (pending/unknown) is treated as
    // "allow" so we don't delay first paint for paid users whose
    // heartbeat hasn't landed yet.
    enabled: hasUsableLicense === true && isActivationValid !== false,
    meta: { silentError: true },
    queryFn: async () => {
      const response = await apiFetch<ListConnectionsResponse>({
        path: "/structura/v1/channels/connections",
      });
      // Defensive: the cloud envelope is `{ success, connections }`, but if
      // an older WP endpoint ever responded with a bare array we still want
      // to render something useful rather than crash the page.
      const connections = Array.isArray(response?.connections)
        ? response.connections
        : Array.isArray(response)
          ? (response as unknown as ConnectionSummary[])
          : [];
      // videoQuota is optional during rollout (older clouds omit it) —
      // read the numbers defensively so a partial doc hides the meter
      // instead of rendering "NaN of undefined".
      const rawQuota = response?.videoQuota;
      const videoQuota =
        rawQuota &&
        typeof rawQuota.used === "number" &&
        typeof rawQuota.cap === "number"
          ? { used: rawQuota.used, cap: rawQuota.cap }
          : undefined;
      // Bound-preset digest for the Video dialog. Tri-state: a malformed
      // object degrades to `undefined` (= "older cloud"), which keeps the
      // dialog on its legacy radio section instead of rendering a broken
      // summary row. `null` passes through — it's the real "no preset
      // bound" edge state.
      const rawPreset = response?.boundVisualPreset;
      const boundVisualPreset: BoundVisualPresetSummary | null | undefined =
        rawPreset === null
          ? null
          : rawPreset &&
              typeof rawPreset.presetId === "string" &&
              typeof rawPreset.label === "string"
            ? rawPreset
            : undefined;
      return { connections, videoQuota, boundVisualPreset };
    },
  });

  return {
    ...query,
    /** The connection summaries — the shape every consumer always read. */
    data: query.data?.connections,
    /** Monthly video quota, when the cloud sent it (see ListConnectionsResponse). */
    videoQuota: query.data?.videoQuota,
    /** Bound-preset digest for the Video dialog (see ListConnectionsResponse). */
    boundVisualPreset: query.data?.boundVisualPreset,
  };
};
