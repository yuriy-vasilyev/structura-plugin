import { useSettingsQuery } from "@/features/settings/api/useSettingsQuery";

/**
 * AI Engine view onto the unified settings payload.
 *
 * Previously this was a separate `useQuery` hitting the same
 * `/structura/v1/settings` endpoint as `useSettingsQuery`, which
 * meant (a) a duplicate roundtrip on /ai-engine first paint and
 * (b) the page-load bootstrap (`window.structuraConfig.bootstrap_settings`)
 * couldn't help here because it only feeds `useSettingsQuery`'s
 * cache. Routed through `useSettingsQuery` with a `select`
 * projector now so the AI Engine page renders against the
 * bootstrap on first paint exactly like Settings does, and
 * settings mutations only need to invalidate one cache key.
 */
export const useAiSettingsQuery = () => {
  return useSettingsQuery((s) => s.ai);
};
