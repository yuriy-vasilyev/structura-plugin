import { getRegistryModelId, tierForModelId } from "@structura/model-catalog";
import type { AIProvider } from "@/features/campaigns/types";
import { recommendedTier } from "@/features/campaigns/aiGuidance";
import { AvailableModel } from "./types";

/** `settings.ai.providers` — per-provider connection status, chosen models and tiers. */
type ProviderModelSettings = {
  [providerId: string]: {
    text_model?: string;
    image_model?: string;
    text_tier?: string;
    image_tier?: string;
  };
};

/** Returns the stored tier for a provider and capability, or `undefined` when none is stored. */
const storedTier = (
  settings: ProviderModelSettings[string] | undefined,
  capability: "text" | "image"
): "top" | "mid" | undefined => {
  const tier = capability === "text" ? settings?.text_tier : settings?.image_tier;
  return tier === "top" || tier === "mid" ? tier : undefined;
};

/**
 * Resolves the model a campaign should default to for a provider +
 * capability when the form holds an empty model field.
 *
 * Priority:
 *   0. The per-provider TIER the setup wizard's "Use recommended model"
 *      switch stored (2026-10-06, specs/open-providers.md), resolved
 *      through the bundled catalog so the default follows the catalog
 *      when that tier's model moves.
 *   1. The workspace's per-provider model — the one the user picked in
 *      the AI Engine setup wizard (required there before save). This is
 *      what the AI Engine page displays as "the provider's model" and
 *      what the onboarding wizard already seeds new campaigns with
 *      (`WizardStep2AiEngine` → `useFinishWizard`), so campaign
 *      backfill must agree or the two creation paths drift.
 *   2. The catalog's recommended default for the provider.
 *   3. `""` — neither source has hydrated; callers leave the field
 *      empty and the cloud's server-side fallback (engine.ts /
 *      image-resolver.ts) covers the run.
 *
 * Every surface that auto-fills an empty campaign model field must go
 * through this helper — the form-provider backfill in CampaignContext
 * and ProviderToggle's mount effect both do. Two surfaces resolving
 * different models for the same empty field is how a user ends up
 * running a model they never saw.
 */
export const resolveDefaultModel = ({
  provider,
  capability,
  providerSettings,
  catalogDefaults,
}: {
  provider: string;
  capability: "text" | "image";
  /** `settings.ai.providers` — per-provider connection status + chosen models. */
  providerSettings?: ProviderModelSettings;
  /** `availableModels.defaults` — catalog-recommended models per provider. */
  catalogDefaults?: {
    [providerId: string]: { text?: string; image?: string };
  };
}): string => {
  const tier = storedTier(providerSettings?.[provider], capability);
  const fromTier = tier ? getRegistryModelId(provider as AIProvider, capability, tier) : undefined;
  if (fromTier) return fromTier;
  const configured =
    capability === "text"
      ? providerSettings?.[provider]?.text_model
      : providerSettings?.[provider]?.image_model;
  return configured || catalogDefaults?.[provider]?.[capability] || "";
};

/**
 * Returns the warning string for a model, if any.
 * Reads the `warning` field from the model catalog data
 * rather than hardcoding per-model strings.
 */
export const maybeGetModelWarning = ({
  model,
  models,
}: {
  model: string;
  models?: AvailableModel[];
}): string | null => {
  if (!models) return null;
  const entry = models.find((m) => m.id === model);
  return entry?.warning ?? null;
};

/**
 * Returns the tier a new campaign seeded from the site default should store:
 * the provider's stored tier, else the tier of its stored model, else
 * `undefined` (an unknown or never-tiered model).
 */
export const resolveDefaultTier = ({
  provider,
  capability,
  providerSettings,
}: {
  provider: string;
  capability: "text" | "image";
  providerSettings?: ProviderModelSettings;
}): "top" | "mid" | undefined => {
  const settings = providerSettings?.[provider];
  const tier = storedTier(settings, capability);
  if (tier) return tier;
  const model = capability === "text" ? settings?.text_model : settings?.image_model;
  const derived = tierForModelId(provider as AIProvider, capability, model);
  return derived === "top" || derived === "mid" ? derived : undefined;
};

/**
 * Returns true when a connected provider's "Use recommended model" switch is
 * on for a capability: a stored tier, no stored model, or the stored model
 * is the recommended one (specs/open-providers.md §4).
 */
export const usesRecommendedModel = (
  provider: string,
  capability: "text" | "image",
  tier?: string,
  model?: string
): boolean =>
  tier === "top" ||
  tier === "mid" ||
  !model ||
  model ===
    getRegistryModelId(provider as AIProvider, capability, recommendedTier(provider, capability) ?? "mid");

/**
 * Returns true when the plan generates images. Anonymous installs (`none`)
 * do not: a plan feature, unchanged when every provider opened to every
 * plan (2026-10-06).
 */
export const planHasImageGeneration = (plan: string): boolean => plan !== "none";
