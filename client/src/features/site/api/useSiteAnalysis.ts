/**
 * React Query hooks for the `/site` page's analysis flow.
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.2.
 *
 * Two hooks:
 *
 *   - `useSiteAnalysisQuery()` — cache-only read of the workspace's
 *     last analysis result (free of spend). Returns `data === null`
 *     when the cache is cold; tabs branch on that to show the
 *     "Analyze my site" button vs. the data view.
 *   - `useAnalyzeSiteMutation()` — fires the Live analysis. On
 *     success, the React Query cache is updated in-place so the tab
 *     re-renders with the fresh data without a second network call.
 *
 * Wire shape mirrors the cloud's `SiteAnalysisResponse` so the SPA
 * doesn't translate field names — what the cloud caches is what the
 * tab renders.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { ReferralLink } from "@structura/types";

/** Mirrors `DomainMetadata` in `functions/src/seo-intel/types.ts`. */
export interface SiteDomainMetadata {
  url: string;
  locale: string;
  categories: string[];
  niche: string;
  hasAuthoritySignal: boolean;
  /** Backlinks API only (paid add-on). Usually absent on Labs-only plans. */
  authorityScore?: number;
  /** Total ranking keywords across all positions — main Labs-tier scale signal. */
  rankingKeywordCount?: number;
  /** Of those, how many sit at SERP position #1. */
  topRankingCount?: number;
  /** USD-equivalent monthly traffic value of all rankings. */
  estimatedTrafficValue?: number;
  referringDomains?: number;
  totalBacklinks?: number;
  topReferringDomains?: Array<{
    domain: string;
    rank: number;
    backlinks: number;
  }>;
  capturedAt: string;
}

/** Mirrors `RankingKeyword` in `functions/src/seo-intel/types.ts`. */
export interface SiteRankingKeyword {
  keyword: string;
  position: number;
  volume?: number;
  difficulty?: number;
  intent?: "informational" | "navigational" | "commercial" | "transactional";
  cpc?: number;
  rankingUrl?: string;
}

export interface SiteAnalysisResult {
  success: boolean;
  capturedAt: string | null;
  reason?:
    | "no_paid_provider"
    | "unsupported_locale"
    | "missing_domain"
    | "provider_error"
    | "unauthorized";
  /**
   * The URL the analysis actually ran against + which activation field
   * supplied it. Lets the SPA render "Analyzed: https://… (headless
   * override)" so users can verify their headless setup was honoured.
   */
  analyzedUrl?: string;
  analyzedUrlSource?: "publicUrl" | "homeUrl" | "domain";
  domain?: SiteDomainMetadata | null;
  keywords?: SiteRankingKeyword[];
  /**
   * SERP competitors auto-discovered from the workspace's domain. Used
   * by /site/competitors as "suggested" entries the user can adopt
   * with one click.
   */
  suggestedCompetitors?: Array<{
    domain: string;
    intersections: number;
    trafficEstimate?: number;
  }>;
  seoIntelSettings?: {
    competitorUrls: string[];
    targetKeywords: string[];
    /** Vetted authority domains to cite — brand-level, inherited by campaigns. */
    authorityDomains: string[];
    /** Client referral / partner links — site-level seed inherited by campaigns. */
    referralLinks: ReferralLink[];
    emailDigestOptIn: boolean;
  };
  refreshAvailableAfterMs?: number;
}

const SITE_STATE_KEY = ["site", "analysis"] as const;

/**
 * Cache-only read of the workspace's last analysis. Runs on every
 * /site tab mount to decide what to render. Returns `data === null`
 * when the workspace has never been analysed.
 *
 * `staleTime: 5 minutes` because the underlying cache TTL is 30+
 * days — the user opening the tab twice in quick succession
 * shouldn't fire two REST calls.
 */
export function useSiteAnalysisQuery(opts: { enabled?: boolean } = {}) {
  return useQuery<SiteAnalysisResult>({
    queryKey: SITE_STATE_KEY,
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      return apiFetch<SiteAnalysisResult>({
        path: "/structura/v1/site/state",
        method: "POST",
        data: {},
      });
    },
  });
}

/**
 * Fires the Live analysis. The result lands directly on the React
 * Query cache so the tab re-renders without an extra round-trip.
 *
 * `onSuccess` re-writes the cache verbatim rather than invalidating —
 * the response IS the fresh state, so a refetch would be a no-op
 * with extra latency.
 */
export function useAnalyzeSiteMutation() {
  const queryClient = useQueryClient();
  return useMutation<SiteAnalysisResult, Error, { locale?: string } | void>({
    mutationFn: async (input) => {
      return apiFetch<SiteAnalysisResult>({
        path: "/structura/v1/site/analyze",
        method: "POST",
        data: input ?? {},
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(SITE_STATE_KEY, result);
    },
  });
}

/**
 * Persist SEO settings (competitor URLs + digest opt-in). Updates
 * the React Query cache in-place on success so the Competitors +
 * Settings tabs re-render with the new values immediately.
 */
export function useUpdateSiteSeoSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    {
      success: boolean;
      seoIntelSettings: {
        competitorUrls: string[];
        targetKeywords: string[];
        authorityDomains: string[];
        referralLinks: ReferralLink[];
        emailDigestOptIn: boolean;
      };
    },
    Error,
    {
      competitorUrls?: string[];
      targetKeywords?: string[];
      authorityDomains?: string[];
      referralLinks?: ReferralLink[];
      emailDigestOptIn?: boolean;
    }
  >({
    mutationFn: async (input) => {
      return apiFetch<{
        success: boolean;
        seoIntelSettings: {
          competitorUrls: string[];
          targetKeywords: string[];
          authorityDomains: string[];
          referralLinks: ReferralLink[];
          emailDigestOptIn: boolean;
        };
      }>({
        path: "/structura/v1/site/seo-settings",
        method: "POST",
        data: input,
      });
    },
    onSuccess: (result) => {
      // Functional setter so the merge always sees the LATEST cache
      // value at apply-time (avoids the closure-staleness bug where
      // a concurrent mutation overwrote with an older snapshot). And
      // if the cache is somehow empty, we don't accidentally drop
      // `suggestedCompetitors` / `domain` / `keywords` from a prior
      // analyzeSite call — common cause of "competitor chips
      // disappeared when I added a keyword".
      queryClient.setQueryData<SiteAnalysisResult>(SITE_STATE_KEY, (prev) => {
        if (!prev) {
          return {
            success: true,
            capturedAt: null,
            seoIntelSettings: result.seoIntelSettings,
          };
        }
        return { ...prev, seoIntelSettings: result.seoIntelSettings };
      });
    },
  });
}

/** One vetted authority domain candidate (subset of the cloud shape). */
export interface SuggestedAuthorityDomain {
  domain: string;
  description: string;
}

/**
 * Suggest authority domains for the workspace's Authority tab.
 *
 * Reuses the campaign wizard's detached discovery endpoint
 * (`/structura/v1/scheduler/discover-authority`) — no new cloud
 * surface. The caller derives the keyphrase from the site's strongest
 * signal (a target keyword, else positioning, else the domain) and
 * passes the resolved default text provider + site language. Returns
 * bare domains the editor offers as add-able chips.
 */
export function useSuggestAuthorityDomainsMutation() {
  return useMutation<
    SuggestedAuthorityDomain[],
    Error,
    {
      keyphrase: string;
      language: string;
      provider: string;
      /**
       * Domains already confirmed on the authority list — prompt
       * context + don't-repeat for the discovery model (it used to
       * burn its 12–15 slots on domains the UI then filtered out of
       * view). Sent as `existing_domains` to match the endpoint's
       * snake_case body convention.
       */
      existingDomains?: string[];
    }
  >({
    mutationFn: async ({ existingDomains, ...input }) => {
      const res = await apiFetch<{
        success: boolean;
        domains?: Array<{ domain: string; description?: string }>;
      }>({
        path: "/structura/v1/scheduler/discover-authority",
        method: "POST",
        data: { ...input, existing_domains: existingDomains ?? [] },
      });
      return (res.domains ?? []).map((d) => ({
        domain: d.domain,
        description: d.description ?? "",
      }));
    },
  });
}
