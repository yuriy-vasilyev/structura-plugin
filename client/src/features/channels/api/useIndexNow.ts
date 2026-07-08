import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

import { channelKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Wire shape of `GET /channels/indexnow/key`. The plugin owns the key
 * (mints + persists it locally) — this hook surfaces just enough state
 * for the UI to render the keyfile-download + upload-instructions
 * affordances.
 *
 * Spec: `specs/site-identity-headless.md` §6.
 */
export interface IndexNowKey {
  /** The active key. Stable across calls until rotated. */
  key: string;
  /** Composed `{publicOrigin}/{key}.txt` URL. */
  keyLocation: string;
  /** Public-facing origin we composed against. */
  publicUrl: string;
  /** Whether headless mode is on — flips the upload-instructions copy. */
  isHeadless: boolean;
}

/**
 * Fetch the active IndexNow key + keyLocation. Idempotent on the
 * server side, so we don't worry about cache coherence — first call
 * mints and stores, every subsequent call returns the same value.
 */
export const useIndexNowKey = (enabled = true) => {
  const { hasUsableLicense } = useLicense();
  return useQuery<IndexNowKey>({
    queryKey: channelKeys.indexnowKey(),
    queryFn: () =>
      apiFetch<IndexNowKey>({ path: "/structura/v1/channels/indexnow/key" }),
    enabled: hasUsableLicense === true && enabled,
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Wire shape of the verify endpoint's response. The cloud returns
 * 200 even on "verification failed" outcomes (with `verified: false` +
 * a typed error), so React Query's onError isn't the right branch for
 * the recovery copy — callers branch on `verified` in onSuccess.
 */
export interface VerifyKeyfileResult {
  success: boolean;
  verified: boolean;
  error?: { code: string; message: string };
}

/**
 * Trigger a cloud-side keyfile verification. Caller passes the
 * connection id; the cloud reads the key + keyLocation off the
 * connection summary, GETs the keyfile URL, and writes verifiedAt
 * (or verifyError) back to the connection. The connection list is
 * invalidated on success so the verify badge refreshes.
 */
export const useVerifyIndexNowKeyfile = () => {
  const queryClient = useQueryClient();

  return useMutation<VerifyKeyfileResult, { code?: string; message?: string }, string>({
    mutationFn: async (connectionId: string) =>
      apiFetch<VerifyKeyfileResult>({
        path: `/structura/v1/channels/indexnow/${connectionId}/verify`,
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: channelKeys.connections() });
    },
  });
};
