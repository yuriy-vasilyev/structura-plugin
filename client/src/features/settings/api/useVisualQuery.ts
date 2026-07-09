import { VisualConfig } from "@/features/settings";
import { useQuery } from "@tanstack/react-query";
import { visualKeys } from "@/features/settings/api/keys";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings/api/useLicense";

export const useVisualQuery = () => {
  const { hasUsableLicense, isLicensed } = useLicense();
  return useQuery({
    queryKey: visualKeys.config(),
    queryFn: () => apiFetch<VisualConfig>({ path: "/structura/v1/visual" }),
    // `isLicensed` (plan !== "none") mirrors the VisualsPage locked-teaser
    // gate. Without it, a plan-"none" install that still carries a
    // license_key (the licensed-but-cloud-pending / cancelled-key window,
    // or an anonymous key-shaped bearer) satisfies `hasUsableLicense` and
    // this fetch fires anyway — surfacing a stray "Data Fetch Error:
    // Cookie check failed" toast under the teaser (Yurii 2026-07-09).
    enabled: hasUsableLicense === true && isLicensed,
    staleTime: 1000 * 60 * 10,
  });
};
