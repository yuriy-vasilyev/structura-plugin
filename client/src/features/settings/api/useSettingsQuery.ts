import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { UnifiedSettings } from "../types";
import { settingsKeys } from "./keys";

/**
 * Bootstrap payload injected by the plugin's `Admin_Dashboard::enqueue_scripts`
 * via `wp_localize_script`. Same shape the `/structura/v1/settings`
 * endpoint returns, minus the cloud-derived per-provider `connected` /
 * `masked_key` fields (the PHP bootstrap can't make a synchronous cloud
 * HTTP without blocking the wp-admin page render).
 *
 * Wired as TanStack Query `initialData` so first paint never shows
 * the AppLoader on the very first wp-admin entry: the SPA renders
 * against the bootstrap immediately and a single background
 * revalidation fills in cloud-derived fields ~500ms later. Returns
 * `undefined` on plugin builds that predate this hydration (back-compat),
 * in which case the query behaves as before — fetch on mount.
 */
function readBootstrapSettings(): UnifiedSettings | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.structuraConfig?.bootstrap_settings;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as UnifiedSettings;
}

export const useSettingsQuery = <T = UnifiedSettings>(select?: (data: UnifiedSettings) => T) => {
  const bootstrap = readBootstrapSettings();

  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => apiFetch<UnifiedSettings>({ path: "/structura/v1/settings" }),
    select,
    staleTime: 1000 * 60 * 5, // Settings don't change often, cache for 5 mins
    // `initialData` skips the bootstrap roundtrip on first mount.
    // `initialDataUpdatedAt: 0` makes TanStack Query treat the
    // injected payload as "infinitely stale" — first render uses it
    // for paint, but a background revalidation fires immediately to
    // fill in the cloud-derived `ai.providers[id].connected` /
    // `masked_key` fields the PHP bootstrap can't populate.
    initialData: bootstrap,
    initialDataUpdatedAt: bootstrap ? 0 : undefined,
  });
};
