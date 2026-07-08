/**
 * Privacy / telemetry consent client for the wp-admin SPA.
 *
 * Unlike www/ and web/ (which both share the `.structurawp.com`-scoped
 * `structura_consent` cookie), the plugin admin SPA runs on each
 * customer's WordPress domain and can't piggy-back on a cross-subdomain
 * cookie. Instead, the consent state lives in a site-wide WP option
 * (`structura_privacy_consent`) read and written via the
 * `structura/v1/privacy/consent` REST endpoint.
 *
 * Surface: there is no banner inside wp-admin — plugin admins are paid
 * customers, and a Klaro-style strip would be out of place. Consent is
 * collected via the Settings → Privacy & Telemetry card, which uses
 * `usePrivacyConsent` + `useUpdatePrivacyConsent` from this module.
 *
 * Spec: Phase 1 of the analytics rollout (see `MEMORY.md` →
 * project_structura_analytics_plan).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Wire shape returned by GET /privacy/consent and POST /privacy/consent.
 * Mirrors `Privacy_Rest_Api::get_consent()` exactly.
 */
export interface PrivacyConsentState {
  /** Schema version. Bumping server-side invalidates prior choices. */
  version: number;
  /** Unix timestamp (seconds) when the admin made the choice; null if never. */
  choseAt: number | null;
  /** Whether anonymous plugin-usage analytics is allowed to fire. */
  telemetryEnabled: boolean;
  /**
   * `true` once the admin has explicitly recorded a choice. Distinguishes
   * "default-denied" (never seen the toggle) from "explicitly denied"
   * (admin saw the toggle and turned it off). The card uses this to
   * decide whether to show a one-time advisory.
   */
  hasMadeChoice: boolean;
}

const PRIVACY_QUERY_KEY = ["privacy", "consent"] as const;

function getRestConfig() {
  const restUrl =
    (typeof window !== "undefined" && window.structuraConfig?.rest_url) ||
    "/wp-json/";
  const nonce =
    (typeof window !== "undefined" && window.structuraConfig?.nonce) || "";
  return {
    restUrl: restUrl.replace(/\/$/, ""),
    nonce,
  };
}

async function fetchPrivacyConsent(): Promise<PrivacyConsentState> {
  const { restUrl, nonce } = getRestConfig();
  const response = await fetch(`${restUrl}/structura/v1/privacy/consent`, {
    headers: { "X-WP-Nonce": nonce },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as PrivacyConsentState;
}

async function postPrivacyConsent(
  telemetryEnabled: boolean
): Promise<PrivacyConsentState> {
  const { restUrl, nonce } = getRestConfig();
  const response = await fetch(`${restUrl}/structura/v1/privacy/consent`, {
    method: "POST",
    headers: {
      "X-WP-Nonce": nonce,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ telemetryEnabled }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as PrivacyConsentState;
}

/**
 * Notify any consent-aware tracker (PostHog primarily) of the new state.
 *
 * Phase 2: routes through `setConsented()` in `lib/posthog.ts` so the
 * first consent flip lazily loads posthog-js into the wp-admin page;
 * subsequent flips just call `opt_in_capturing()` / `opt_out_capturing()`
 * on the already-loaded instance. Falls back to the feature-detect path
 * for any other tracker someone might add later that reads
 * `window.posthog` directly.
 */
function notifyConsumers(telemetryEnabled: boolean) {
  if (typeof window === "undefined") return;
  // Dynamic import to keep `consent.ts` independent of the posthog
  // bundle — `setConsented()` itself dynamic-imports posthog-js only
  // when first needed, so the wp-admin SPA stays small for the install
  // base that never opts in.
  void import("./posthog").then(({ setConsented }) => {
    setConsented(telemetryEnabled);
  });
}

/**
 * React Query hook that reads the current privacy consent state from
 * the plugin REST endpoint. The query is cached under
 * `["privacy", "consent"]` and refetched only on mount/window-focus
 * defaults — telemetry consent doesn't change often enough to warrant
 * polling.
 */
export function usePrivacyConsent() {
  return useQuery({
    queryKey: PRIVACY_QUERY_KEY,
    queryFn: fetchPrivacyConsent,
  });
}

/**
 * React Query mutation that flips the consent toggle. On success, the
 * cache is updated optimistically (without re-fetching) and the
 * tracker is opted in/out so the change is reflected immediately
 * without a page reload.
 */
export function useUpdatePrivacyConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postPrivacyConsent,
    onSuccess: (state) => {
      queryClient.setQueryData(PRIVACY_QUERY_KEY, state);
      notifyConsumers(state.telemetryEnabled);
    },
  });
}
