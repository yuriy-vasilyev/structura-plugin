import { useState } from "react";
import apiFetch from "@wordpress/api-fetch";
import { useToast } from "@structura/ui";
import { __ } from "@wordpress/i18n";
import { AIProvider } from "@/features/campaigns";
import { useLicense } from "@/features/settings";
import { humanizeSuggestionError } from "@/hooks/humanizeSuggestionError";

export type SuggestionMode = "persona" | "campaign" | "visual" | "topic_chips";

interface SuggestionOptions {
  provider: AIProvider;
  context?: Record<string, any>;
  /** Visual mode only: the picked rendering medium for the cloud blueprint. */
  medium?: "photography" | "illustration" | "3d_render";
}

export const useMagicSuggest = () => {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const { errorToast } = useToast();
  const { isPaidLicense } = useLicense();

  /**
   * Triggers the architectural suggestion engine.
   * Returns a parsed object or string depending on the mode.
   */
  const suggest = async (mode: SuggestionMode, options: SuggestionOptions) => {
    // AI suggestions are a paid-tier feature. This central guard is the
    // safety net BEHIND each surface's own UI gate (2026-07-09): even if
    // a trigger is left ungated on some surface, it can never leak a
    // cloud suggestion to a none/free install. Returns null so existing
    // call sites (which already handle a null result) no-op cleanly.
    if (!isPaidLicense) return null;

    setIsSuggesting(true);

    try {
      const response: any = await apiFetch({
        path: "/structura/v1/suggest",
        method: "POST",
        data: {
          mode,
          provider: options.provider,
          context: options.context || [],
          ...(options.medium ? { medium: options.medium } : {}),
        },
      });

      // The result from our new API is already a parsed object/string
      // or wrapped in a 'result' key from our execute_local/cloud logic.
      const data = response.result ?? response;

      // Guard: if the response contains an error key (e.g. a Cloud Function error
      // that PHP forwarded without properly converting to a WP_Error), surface it.
      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data) {
        throw new Error(__("The AI returned an empty blueprint.", "structura"));
      }

      return data;
    } catch (e: any) {
      // apiFetch throws `{ code, message, data }` for WP REST errors.
      // For cloud-suggestion failures the proxy attaches the cloud's
      // structured envelope (`{code, provider, retriable, …}`) under
      // `data`, so `humanizeSuggestionError` can render a friendly,
      // provider-aware toast instead of the leaky raw message.
      // Network / auth / unknown shapes fall through to the original
      // generic copy.
      errorToast(humanizeSuggestionError(e));
      return null;
    } finally {
      setIsSuggesting(false);
    }
  };

  return { suggest, isSuggesting };
};
