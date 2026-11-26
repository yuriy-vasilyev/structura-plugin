import { useSettingsQuery } from "./useSettingsQuery";

/**
 * ARCHITECTURAL REFACTOR:
 * Derives connected provider lists and capability checks from the new
 * Provider_Registry-driven settings shape.
 */
export const useAiConnections = () => {
  // Read directly from `useSettingsQuery` (rather than the
  // `useAiSettingsQuery` view) so we get `isFetching` alongside
  // `isLoading`. `useAiSettingsQuery` is a `select`-projected view
  // that drops the meta flags; for the connection-state derivation
  // we need to know whether the cloud-derived `connected` /
  // `masked_key` fields have landed yet, which is what
  // `isFetching` answers. The wp_localize bootstrap deliberately
  // omits those two fields (PHP can't synchronously fetch them at
  // page-render time), so on first paint
  // `useAiSettingsQuery().data.providers[*].connected === undefined`
  // even when the SPA already has providers configured cloud-side.
  // Consumers that flash the "no provider connected" banner read
  // `isFetching` together with `isLoading` to avoid that flash.
  const { data: settings, isLoading, isFetching } = useSettingsQuery();
  const ai = settings?.ai;

  const activeProviders = ai?.providers
    ? Object.entries(ai.providers)
        .filter(([_, p]) => p.connected)
        .map(([slug]) => slug)
    : [];

  /** Providers that support a specific capability (text or image). */
  const getProvidersByCapability = (capability: "text" | "image") =>
    ai?.providers
      ? Object.entries(ai.providers)
          .filter(([_, p]) => p.connected && p.capabilities.includes(capability))
          .map(([slug]) => slug)
      : [];

  // "Incomplete" providers (connected, no model selected) went on
  // 2026-11-25: no model is selected any more (specs/byok-ai-guidance.md §2.2).

  return {
    activeProviders,
    textProviders: getProvidersByCapability("text"),
    imageProviders: getProvidersByCapability("image"),
    isLoading,
    /**
     * True while the background revalidation against
     * `/structura/v1/settings` is in flight. Combine with
     * `isLoading` when deciding whether to render UI that depends
     * on the cloud-derived `connected` / `masked_key` fields — on
     * first paint those fields are absent (the wp_localize
     * bootstrap omits them) and only land after the
     * revalidation settles. `DisconnectedProvidersBanner` reads
     * this to skip its first-paint flash.
     */
    isFetching,
    isProviderActive: (slug: string) => activeProviders.includes(slug),
  };
};
