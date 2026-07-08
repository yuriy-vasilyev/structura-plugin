import { __, sprintf } from "@wordpress/i18n";

/**
 * Map a thrown error from `/structura/v1/suggest` into user-facing toast
 * copy.
 *
 * The cloud's `executeCloudSuggestion` returns a structured envelope on
 * failure (added in PR #2):
 *
 *   { error, code: "provider_transient" | "provider_error",
 *     provider, retriable, reason, providerStatus }
 *
 * The plugin's REST proxy forwards those fields under
 * `WP_Error.data`, which `apiFetch` surfaces to the client as a thrown
 * object of shape `{ code, message, data: {...envelope, status} }`.
 *
 * Why we don't just show `error.message` verbatim: the upstream
 * provider message is leaky ("[Gemini Text Synthesis] This model is
 * currently experiencing high demand…") — debuggable for ops, but
 * confusing to a site owner who just wants to know whether to retry.
 * The friendly copy below names the provider, hints at the cause, and
 * points at the "switch providers" escape hatch.
 *
 * Codes we deliberately DON'T branch on (passed through verbatim):
 *   - `tier_quota_exceeded` — the cloud's own copy already explains
 *     the cap and the upgrade path; restating it here would diverge.
 *   - Any non-cloud thrown error (network, auth) — the WP REST layer
 *     produces its own translated message that's already user-ready.
 */

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
};

const providerLabel = (provider?: string): string => {
  if (!provider) return __("the AI provider", "structura");
  return PROVIDER_LABELS[provider] ?? provider;
};

interface SuggestionErrorEnvelope {
  data?: {
    code?: string;
    provider?: string;
    retriable?: boolean;
    reason?: string;
    providerStatus?: number;
    message?: string;
  };
  message?: string;
  code?: string;
}

export function humanizeSuggestionError(error: unknown): string {
  const e = (error ?? {}) as SuggestionErrorEnvelope;
  const code = e.data?.code;
  const provider = e.data?.provider;

  if (code === "provider_transient") {
    return sprintf(
      /* translators: %s: AI provider label, e.g. "Gemini" */
      __(
        "%s is experiencing high demand right now. Try again in a moment, or pick a different provider in Settings.",
        "structura"
      ),
      providerLabel(provider)
    );
  }

  if (code === "provider_error") {
    return sprintf(
      /* translators: %s: AI provider label, e.g. "OpenAI" */
      __(
        "%s couldn't complete the request. Check your API key and provider setup, or try a different provider.",
        "structura"
      ),
      providerLabel(provider)
    );
  }

  // Structured rejection with its own user-ready copy
  // (tier_quota_exceeded, missing_provider, …) — pass through.
  if (typeof e.message === "string" && e.message.length > 0) {
    return e.message;
  }
  if (typeof e.data?.message === "string" && e.data.message.length > 0) {
    return e.data.message;
  }

  return __("Something went wrong reaching the AI service. Please try again.", "structura");
}
