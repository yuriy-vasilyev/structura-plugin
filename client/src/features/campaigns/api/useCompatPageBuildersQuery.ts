import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Shape returned by `GET /structura/v1/compat/page-builders`.
 *
 * The endpoint reads the cached detection option populated by
 * `Compat_Scheduler::refresh()` and decorates each entry with a
 * locale-aware docs URL so the SPA doesn't have to know how the
 * docs site structures its URLs. See
 * `specs/page-builder-compat.md` §4.3.
 */
export interface CompatPageBuilder {
  slug: string;
  label: string;
  kind: "atomic-meta" | "opt-in";
  docs_url: string;
  /**
   * True when `Builder_Compat::opt_out_meta()` writes an opt-out
   * flag for this builder on every Structura post insert. Today
   * that's Divi and WPBakery; Elementor / Beaver / Brizy / Bricks
   * are `false` because they don't auto-claim posts.
   */
  opt_out_meta_active: boolean;
}

export interface CompatPageBuildersResponse {
  detected: CompatPageBuilder[];
  /** ISO-8601 timestamp of the last detection run, or `null` if it has never run. */
  checked_at: string | null;
}

const EMPTY_RESPONSE: CompatPageBuildersResponse = {
  detected: [],
  checked_at: null,
};

/**
 * TanStack Query hook around the compatibility endpoint.
 *
 * The endpoint itself reads an option (cheap), but the response is
 * stable for a whole day (detection reruns daily) so we set a long
 * stale time — there's no reason to refetch on every campaign
 * editor mount.
 *
 * Polling is intentionally not wired. If a site owner installs a
 * new page builder mid-session, they'll see the card after the
 * next campaign editor navigation; that's good enough for a
 * cosmetic surface.
 */
export const useCompatPageBuildersQuery = () => {
  const { hasUsableLicense } = useLicense();
  return useQuery<CompatPageBuildersResponse>({
    queryKey: ["compat", "page-builders"],
    enabled: hasUsableLicense === true,
    queryFn: async () => {
      try {
        const res = await apiFetch<CompatPageBuildersResponse>({
          path: "/structura/v1/compat/page-builders",
        });
        return res ?? EMPTY_RESPONSE;
      } catch {
        // Compat surfaces are non-essential — on any failure fall
        // back to "nothing detected" so the campaign editor never
        // fails to render because of a docs-link endpoint.
        return EMPTY_RESPONSE;
      }
    },
    staleTime: 30 * 60 * 1000, // 30 minutes — detection runs daily
    refetchOnWindowFocus: false,
  });
};
