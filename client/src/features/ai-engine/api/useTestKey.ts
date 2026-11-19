import { useMutation } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

/** A live key test's result, as `POST /structura/v1/keys/test` returns it. */
export interface KeyTestResult {
  ok: boolean;
  latencyMs: number;
  errorCode?: "auth" | "rate_limit" | "model_unavailable" | "network" | "timeout" | "other";
  /** The provider's own words, shown verbatim (specs/provider-key-test.md). */
  providerMessage?: string;
}

/** Live-test a pasted key before it is saved; stores nothing. */
export const useTestKey = () =>
  useMutation({
    mutationFn: (data: { provider: string; key: string }) =>
      apiFetch<KeyTestResult>({ path: "/structura/v1/keys/test", method: "POST", data }),
    // The wizard shows the failure under the key field; no global toast.
    meta: { silentError: true },
  });
