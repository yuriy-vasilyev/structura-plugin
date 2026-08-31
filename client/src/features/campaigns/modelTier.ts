/**
 * Shared model-quality-TIER helpers for the campaign + single-post pickers.
 *
 * The wp-admin SPA never shows a raw model list. For BYOK/free plans the only
 * model choice is a quality TIER — Top / Standard — resolved to a concrete
 * model at generation time; the campaign stores the tier (and mirrors the
 * concrete model for display / back-compat). Managed plans pick no model at all
 * (the cloud owns it). These helpers back both `CampaignAiEngineSection` and
 * `ProviderToggle` so the two pickers stay byte-identical.
 *
 * The tier→model mapping comes from the bundled `@structura/model-catalog`
 * registry (the served catalog carries no tier tags), so a catalog bump flows
 * to every picker automatically.
 */

import { __ } from "@wordpress/i18n";
import { getRegistryModel, getRegistryModelId, tierForModelId } from "@structura/model-catalog";

import { AIProvider } from "@/features/campaigns/types";

/** BYOK model quality tiers, in display order. */
export const MODEL_TIERS = ["top", "mid"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** Localized tier label — "Top" / "Standard" (mirrors the web portal picker). */
export const tierLabel = (tier: ModelTier): string =>
  tier === "top" ? __("Top", "structura") : __("Standard", "structura");

/**
 * Tier dropdown options for a `(provider, capability)`, labeled with the
 * concrete model name from the registry — e.g. "Top (Gemini 3.1 Pro)" /
 * "Standard (Gemini 3.5 Flash)". A tier the provider has no model for is
 * skipped (defensive — every provider carries top+mid today).
 */
export const buildTierOptions = (provider: AIProvider, capability: "text" | "image") =>
  MODEL_TIERS.flatMap((tier) => {
    const model = getRegistryModel(provider, capability, tier);
    return model ? [{ value: tier, label: `${tierLabel(tier)} (${model.name})` }] : [];
  });

/**
 * The concrete model id a `(provider, capability, tier)` resolves to — mirrored
 * onto the campaign's `textModel`/`imageModel` for display / back-compat while
 * the tier stays the source of truth. Returns `undefined` when the provider has
 * no model for the tier; callers fall back to the existing value.
 */
export const mirrorModelForTier = (
  provider: AIProvider,
  capability: "text" | "image",
  tier: ModelTier
): string | undefined => getRegistryModelId(provider, capability, tier);

/**
 * The tier a picker should OPEN on. Stored tier wins; a legacy pre-tier
 * campaign derives it from its stored concrete model so the UI never claims a
 * tier generation won't run (a mid-model campaign displayed as "Top" was the
 * 2026-07-23 regression); an unknown/retired model falls back to `mid` — the
 * cheaper guess on the user's own key.
 */
export const effectiveTier = (
  provider: AIProvider,
  capability: "text" | "image",
  storedTier: ModelTier | null | undefined,
  storedModel: string | null | undefined
): ModelTier => {
  if (storedTier) return storedTier;
  const derived = tierForModelId(provider, capability, storedModel);
  return derived === "top" || derived === "mid" ? derived : "mid";
};
