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

  /**
   * Incomplete providers: connected (API key saved) but missing model selection.
   * A text provider is incomplete if it has no text_model set.
   * An image provider is incomplete if it has no image_model set.
   * We check both since a provider can have multiple capabilities.
   */
  const incompleteProviders = ai?.providers
    ? Object.entries(ai.providers)
        .filter(([_, p]) => {
          if (!p.connected) return false;
          const needsText = p.capabilities.includes("text") && !p.text_model;
          const needsImage = p.capabilities.includes("image") && !p.image_model;
          return needsText || needsImage;
        })
        .map(([slug]) => slug)
    : [];

  return {
    activeProviders,
    textProviders: getProvidersByCapability("text"),
    imageProviders: getProvidersByCapability("image"),
    incompleteProviders,
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
    isProviderIncomplete: (slug: string) => incompleteProviders.includes(slug),
  };
};
