/**
 * useSiteIndexingStatusQuery — reads the site's search-engine visibility
 * flag from WP (the `blog_public` option behind Settings → Reading →
 * "Discourage search engines from indexing this site").
 *
 * Primary caller: the IndexNow install modal, which surfaces a warning when
 * the site is discouraged. Pinging Bing about a site that returns
 * `<meta name="robots" content="noindex">` wastes crawl budget and signals
 * to the operator that the integration is misbehaving, so we prefer to warn
 * before install rather than after.
 *
 * The endpoint is cheap (one get_option) and the flag changes rarely — a
 * 5-minute staleTime matches `useSettingsQuery`'s cadence and keeps modal
 * opens snappy on repeat views.
 */
import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings/api/useLicense";

export interface SiteIndexingStatus {
  /** Mirrors WP's `blog_public` option. `true` = site is indexable. */
  blogPublic: boolean;
  /**
   * Inverse of `blogPublic`, named the way the WP admin UI labels the
   * checkbox ("Discourage search engines from indexing this site"). Most
   * UI call sites should branch on this one to match user mental model.
   */
  discourageSearchEngines: boolean;
  success: boolean;
}

export const siteIndexingStatusKey = ["site", "indexing-status"] as const;

export const useSiteIndexingStatusQuery = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: siteIndexingStatusKey,
    queryFn: () =>
      apiFetch<SiteIndexingStatus>({
        path: "/structura/v1/site/indexing-status",
      }),
    enabled: hasWorkspace === true,
    // Matches useSettingsQuery — the flag is a site setting, it doesn't
    // need to be refetched on every navigation.
    staleTime: 1000 * 60 * 5,
  });
};
