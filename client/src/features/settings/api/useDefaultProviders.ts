import { useAiSettingsQuery } from "@/features/ai-engine";
import { useAiConnections } from "./useAiConnections";
import { useLicense } from "./useLicense";
import { AIProvider } from "@/features/campaigns/types";
import { getProvidersForTier, isManagedPlan, type PlanId } from "@structura/types";

/**
 * Resolves the effective default text and image providers.
 *
 * Priority:
 *  1. User-configured default (settings.ai.defaults)
 *  2. First connected provider with matching capability
 *  3. "gemini" as ultimate fallback (cheapest for Cloud, most common)
 *
 * Key flags:
 *  - `hasExplicitDefaults` — user has explicitly set at least a text default provider
 *  - `isFullyConfigured` — user has explicit defaults for BOTH text + image AND models
 *    chosen for each. When true, the ProviderToggle can be tucked into Advanced Settings.
 *    When false, it should be visible inline so the user can configure.
 */
export const useDefaultProviders = () => {
  const { data: ai } = useAiSettingsQuery();
  const { textProviders, imageProviders, activeProviders, incompleteProviders, isProviderIncomplete } = useAiConnections();
  const { plan } = useLicense();

  const isCloud = isManagedPlan(plan as PlanId);
  const defaults = ai?.defaults;
  const providers = ai?.providers;

  // For Cloud users, the configured default is always valid
  // For BYOK users, only valid if the provider is still connected
  const isValidProvider = (slug: string | undefined, connectedList: string[]): boolean => {
    if (!slug) return false;
    if (isCloud) return true;
    return connectedList.includes(slug);
  };

  const hasExplicitTextDefault = isValidProvider(defaults?.text_provider, textProviders);
  const hasExplicitImageDefault = isValidProvider(defaults?.image_provider, imageProviders);

  // Resolve effective providers — fallback to first connected, then "gemini"
  const resolveProvider = (
    hasExplicit: boolean,
    explicitSlug: string | undefined,
    capabilityProviders: string[],
  ): AIProvider => {
    if (hasExplicit) return explicitSlug as AIProvider;
    if (isCloud) return "gemini";
    return (capabilityProviders[0] ?? activeProviders[0] ?? "gemini") as AIProvider;
  };

  const defaultTextProvider = resolveProvider(hasExplicitTextDefault, defaults?.text_provider, textProviders);
  const defaultImageProvider = resolveProvider(hasExplicitImageDefault, defaults?.image_provider, imageProviders);

  // Available providers list (for campaign-level overrides).
  //
  // Two filters are layered:
  //   1. Connectivity — Cloud users get all 3 providers (we run the
  //      keys server-side); BYOK users see only providers they've
  //      actually connected.
  //   2. Tier policy (2026-05-03 Yurii — `PROVIDERS_FOR_TIER`).
  //      "On 'none' tier we only allow OpenAI; on Free —
  //      OpenAI + Gemini; on any paid tier — everything." The matrix
  //      lives in `@structura/types` so the cloud's
  //      `validateProviderForTier` and this filter can't drift.
  //
  // Order matters: connectivity first, then tier intersect. This is
  // also the SECURITY boundary's mirror — the cloud will reject any
  // create/update that proposes a provider outside the tier-allowed
  // set, so showing one in the picker would let the user save and
  // immediately see a 403. Filtering here keeps the picker honest.
  const tierAllowed = getProvidersForTier(plan);
  const tierAllowedSet = new Set<string>(tierAllowed);
  const connectivityProviders: string[] = isCloud
    ? ["gemini", "openai", "anthropic"]
    : activeProviders;
  const availableProviders: string[] = connectivityProviders.filter((p) =>
    tierAllowedSet.has(p),
  );

  // Text-only providers (no image generation capability)
  const TEXT_ONLY_PROVIDERS = ["anthropic"];

  // Image-capable subset — filters out text-only providers (e.g. Claude)
  const availableImageProviders: string[] = availableProviders.filter(
    (p) => !TEXT_ONLY_PROVIDERS.includes(p)
  );

  // True when user has explicitly set defaults — UI should use them silently.
  const hasExplicitDefaults = hasExplicitTextDefault;

  // Multiple providers available for override selection
  const hasMultipleProviders = availableProviders.length > 1;

  // True when providers were auto-resolved (not explicitly chosen by user).
  const isAutoResolved = !hasExplicitTextDefault && activeProviders.length > 0;

  // True when BOTH default providers are explicitly set.
  // Models are guaranteed by the provider setup wizard (required before save),
  // so we only need to check for explicit default selections here.
  // Cloud users are always fully configured — providers/models are managed server-side.
  // When true, ProviderToggle is tucked into Advanced Settings.
  // When false, it's visible inline during campaign creation.
  const isFullyConfigured = isCloud || (hasExplicitTextDefault && hasExplicitImageDefault);

  return {
    defaultTextProvider,
    defaultImageProvider,
    availableProviders,
    availableImageProviders,
    incompleteProviders,
    isProviderIncomplete,
    hasExplicitDefaults,
    hasExplicitTextDefault,
    hasExplicitImageDefault,
    hasMultipleProviders,
    isAutoResolved,
    isFullyConfigured,
    isCloud,
  };
};
