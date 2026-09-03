import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings";

/**
 * Weekly one-off generation allowance, proxied from the cloud's
 * `getSingleGenQuota` (`GET /structura/v1/generate/quota`).
 *
 * `cap: null` means the tier is uncapped (managed cloud plans — their
 * cycle quotas govern instead) and callers render no indicator.
 * Added for wp.org first-impression QA round 4 (2026-09-03): before
 * this, the only way a capped user learned the weekly limit existed
 * was hitting it.
 */
export interface SingleGenQuotaResponse {
  success: boolean;
  /** Weekly cap for this tier, or null when uncapped. */
  cap: number | null;
  /** One-off posts already generated this week (absent when uncapped). */
  used: number | null;
  /** Epoch ms when the weekly bucket resets (next Monday 00:00 UTC). */
  resetsAt: number | null;
  tier: string;
}

export const useSingleGenQuota = () => {
  // `hasWorkspace` (not a license gate): anonymous installs are capped
  // too and need the indicator most.
  const { hasWorkspace } = useLicense();
  return useQuery<SingleGenQuotaResponse>({
    queryKey: ["singleGenQuota"],
    enabled: hasWorkspace === true,
    // Refreshed after each generation attempt anyway via refetch-on-mount
    // when the user navigates back; a short staleTime keeps the count
    // honest without polling.
    staleTime: 60_000,
    queryFn: () => apiFetch<SingleGenQuotaResponse>({ path: "/structura/v1/generate/quota" }),
  });
};
