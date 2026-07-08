import apiFetch from "@wordpress/api-fetch";
import { useQuery } from "@tanstack/react-query";
import { AvailableModel } from "../types";

interface AvailableModelsResponse {
  text: AvailableModel[];
  image: AvailableModel[];
  defaults: {
    [provider: string]: {
      text: string;
      image: string;
      fast: string;
    };
  };
}

/**
 * Available text/image model catalog for every provider exposed at
 * the calling tier.
 *
 * No workspace gate (Phase 1.8 §1.8.4 follow-up): the model catalog
 * is non-secret, the plugin REST endpoint already requires
 * `manage_options`, and the catalog is needed BEFORE any provider is
 * connected — the SetupWizard's Configure step renders model
 * pickers that have to be populated even on a brand-new install
 * where the workspace bootstrap may still be racing the wizard's
 * mount. Pre-2026-05-10 the gate read `hasWorkspace === true`,
 * which silently disabled the query during the workspace settle
 * window and produced the "No models available for this provider
 * yet" empty state in the wizard. Without the gate, the query
 * fires on first mount; the data flows in seconds and the wizard
 * Configure step renders models without a manual Refresh click.
 */
export const useAvailableModelsQuery = () => {
  return useQuery({
    queryKey: ["models"],
    queryFn: () => apiFetch<AvailableModelsResponse>({ path: "/structura/v1/models" }),
    staleTime: 1000 * 60 * 60,
  });
};
