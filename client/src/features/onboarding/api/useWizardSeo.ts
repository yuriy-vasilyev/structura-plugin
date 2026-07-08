/**
 * Wizard step 3 — SEO intelligence — API hooks.
 *
 * Three resources:
 *   - Positioning (GET + POST + AI-draft)
 *   - Keyword suggestions (one-shot mutation)
 *   - Competitor list + saved target keywords are handled via the
 *     existing site SEO settings hooks (`useUpdateSiteSeoSettingsMutation`
 *     in `features/site/api/useSiteAnalysis.ts`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

export interface WizardPositioning {
  what: string;
  who: string;
  problem: string;
  source: "user" | "ai_draft" | "edited";
  capturedAt: string;
}

interface PositioningResponse {
  positioning: WizardPositioning | null;
}

export type SuggestedKeywordRationale =
  | "positioning"
  | "competitor"
  | "site_identity"
  | "homepage"
  | "industry";

/**
 * Strategic bucket for a suggested keyword. `on_purpose` = what the site
 * actually is and can realistically rank for; `aspirational` = an
 * adjacent higher-demand category surfaced as a labelled stretch. Absent
 * on responses from an older cloud → the UI shows one flat list.
 */
export type SuggestedKeywordBucket = "on_purpose" | "aspirational";

export interface SuggestedKeyword {
  keyword: string;
  intent: "informational" | "navigational" | "commercial" | "transactional";
  bucket?: SuggestedKeywordBucket;
  rationaleSource: SuggestedKeywordRationale;
  rationale: string;
  /**
   * Real DataForSEO demand metrics, present when the cloud had live data.
   * `volume` is the Google Keyword Planner monthly figure; `difficulty`
   * is 0–100; `competition` is 0–1. All optional — absent means no live
   * data for that keyword, and the chip simply omits the number.
   */
  volume?: number;
  difficulty?: number;
  cpc?: number;
  competition?: number;
}

/** One AI-guessed competitor (the DFS-empty fallback). */
export interface SuggestedCompetitor {
  domain: string;
  rationale: string;
}

const POSITIONING_QUERY_KEY = ["onboarding", "wizard", "positioning"] as const;

/** Read the workspace's saved positioning answers (null if unsaved). */
export function useWizardPositioningQuery(opts: { enabled?: boolean } = {}) {
  return useQuery<PositioningResponse>({
    queryKey: POSITIONING_QUERY_KEY,
    enabled: opts.enabled ?? true,
    staleTime: 60 * 1000,
    queryFn: async () => {
      return apiFetch<PositioningResponse>({
        path: "/structura/v1/wizard/positioning",
        method: "POST",
        data: {},
      });
    },
  });
}

/**
 * Save positioning. The cloud caps each field at 280 chars + stamps
 * `capturedAt`. We update the React Query cache with the server's
 * canonical response.
 */
export function useSaveWizardPositioningMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    PositioningResponse,
    Error,
    {
      what: string;
      who: string;
      problem: string;
      source?: "user" | "ai_draft" | "edited";
    }
  >({
    mutationFn: async (input) => {
      return apiFetch<PositioningResponse>({
        path: "/structura/v1/wizard/positioning/save",
        method: "POST",
        data: input,
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PositioningResponse>(
        POSITIONING_QUERY_KEY,
        result,
      );
    },
  });
}

/**
 * AI-draft positioning answers from the homepage. The SPA puts the
 * suggestion into the editable textareas; user confirms / edits /
 * saves separately through `useSaveWizardPositioningMutation`.
 */
export function useSuggestWizardPositioningMutation() {
  return useMutation<
    {
      suggestion: {
        what: string;
        who: string;
        problem: string;
        rationale: string;
      } | null;
      reason?: "missing_domain" | "ai_unavailable";
    },
    Error,
    void
  >({
    mutationFn: async () => {
      return apiFetch({
        path: "/structura/v1/wizard/positioning/suggest",
        method: "POST",
        data: {},
      });
    },
  });
}

/**
 * Generate target keyword candidates. Input: optional positioning +
 * optional competitor URLs. The cloud blends these with site
 * identity + (when positioning is empty) homepage extraction.
 *
 * Not cached as a query — re-running it after the user edits the
 * positioning is the explicit refresh path.
 */
export function useSuggestWizardKeywordsMutation() {
  return useMutation<
    { suggestions: SuggestedKeyword[]; reason?: "ai_unavailable" },
    Error,
    {
      positioning?: { what: string; who: string; problem: string };
      competitorUrls?: string[];
      /**
       * Keywords already confirmed on the target list — prompt context
       * + don't-repeat for the model (it used to burn suggestion slots
       * on keywords the UI then filtered out of view).
       */
      existingKeywords?: string[];
    }
  >({
    mutationFn: async (input) => {
      return apiFetch({
        path: "/structura/v1/wizard/keywords/suggest",
        method: "POST",
        data: input,
      });
    },
  });
}

/**
 * AI competitor suggestions — the fallback for when DataForSEO's
 * SERP-overlap discovery finds nothing (new / un-indexed domains).
 * Input: optional positioning + the domains already on the list (so we
 * never re-suggest them). Results are AI guesses, surfaced as such.
 */
export function useSuggestWizardCompetitorsMutation() {
  return useMutation<
    { suggestions: SuggestedCompetitor[]; reason?: "ai_unavailable" | "error" },
    Error,
    {
      positioning?: { what: string; who: string; problem: string };
      excludeDomains?: string[];
      /**
       * Campaign content language (e.g. "de"). When set, the cloud biases
       * suggestions toward that market's competitors — used by the
       * campaign Competitors step; omit for the site-level wizard call.
       */
      language?: string;
    }
  >({
    mutationFn: async (input) => {
      return apiFetch({
        path: "/structura/v1/wizard/competitors/suggest",
        method: "POST",
        data: input,
      });
    },
  });
}
