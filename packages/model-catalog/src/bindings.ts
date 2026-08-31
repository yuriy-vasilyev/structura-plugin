import type { AIProvider, PlanId } from "@structura/types";
import type { ModelRole, ModelTier } from "./types";
import { getRegistryModelId, getRecommendedModel } from "./catalog";

/**
 * Use-case binding layer (spec: `specs/model-tier-selection.md` §3). Each
 * feature resolves to a registry model by REFERENCE — never a hard-coded id —
 * so a model bump/retirement in `model-data.ts` flows to every consumer.
 *
 * Keyed by feature, not surface: the same feature on the onboarding wizard and
 * on a settings/special page resolves identically.
 */

/**
 * Suggestions (campaign strategy, positioning, keywords, competitors, topics,
 * personas, visuals) resolve to the provider's TOP text model — best quality,
 * even on Cloud, because suggestions run rarely. Falls back to the catalog's
 * recommended entry if no `top` is tagged (defensive; every provider has one).
 */
export function resolveSuggestionModelId(provider: AIProvider): string {
  return (
    getRegistryModelId(provider, "text", "top") ??
    getRecommendedModel(provider, "text")
  );
}

/**
 * Internal utility tasks — competitor-heading extraction, the connection-test
 * ping, WP-migration cleanup — resolve to the provider's CHEAP text model.
 * Falls back to `mid` where a provider has no distinct cheap model yet (Gemini,
 * until the slice-5 sync script confirms a Flash-Lite id — spec §8), so today
 * these stay on the exact model they already use.
 */
export function resolveUtilityModelId(provider: AIProvider): string {
  return (
    getRegistryModelId(provider, "text", "cheap") ??
    getRegistryModelId(provider, "text", "mid") ??
    getRecommendedModel(provider, "text")
  );
}

/**
 * Resolve a BYOK-selected tier to a concrete model id. The BYOK picker offers
 * `top` + `mid`; the campaign stores the tier (not the id), and this resolves it
 * at generation time so a model bump applies to every saved campaign.
 *
 * Returns `undefined` when no tier is stored (a legacy campaign that still holds
 * a concrete model id) — the caller then keeps using that stored model. Falls
 * back to `mid` if the provider carries no model at the requested tier.
 */
export function resolveByokTierModelId(
  provider: AIProvider,
  capability: ModelRole,
  tier: ModelTier | undefined,
): string | undefined {
  if (!tier) return undefined;
  return (
    getRegistryModelId(provider, capability, tier) ??
    getRegistryModelId(provider, capability, "mid")
  );
}

/**
 * Managed-tier → quality tier. The plan owns the tier (the user only picks the
 * provider on Cloud/Cloud Pro): `cloud` → `mid`, `cloud_pro` → `top`.
 *
 * One deliberate exception (spec §4): Cloud Pro **Gemini image** stays on Flash
 * Image (`mid`) rather than Pro Image — flash-image is the recommended default
 * everywhere at ~half the batch cost. This preserves the prior `PLAN_DEFAULTS`
 * pin exactly.
 */
export function resolveManagedTier(
  plan: PlanId,
  capability: ModelRole,
  provider: AIProvider,
): ModelTier {
  const base: ModelTier = plan === "cloud_pro" ? "top" : "mid";
  if (base === "top" && capability === "image" && provider === "gemini") {
    return "mid";
  }
  return base;
}

/**
 * The concrete model a managed campaign runs for `(plan, capability, provider)`
 * — replaces the `PLAN_DEFAULTS` pin table (the ids are now derived from the
 * registry tier). Returns `undefined` only if the provider carries no model at
 * the resolved tier or its `mid` fallback; managed callers then fall back to
 * the provider's catalog default.
 */
export function resolveManagedModelId(
  plan: PlanId,
  capability: ModelRole,
  provider: AIProvider,
): string | undefined {
  // BYOK plans (free, byok) carry no managed pin — the user's own model choice
  // wins. Only Cloud / Cloud Pro resolve a server-owned model here. Returning
  // undefined lets callers fall through to their provider-default path.
  if (plan !== "cloud" && plan !== "cloud_pro") return undefined;
  const tier = resolveManagedTier(plan, capability, provider);
  return (
    getRegistryModelId(provider, capability, tier) ??
    getRegistryModelId(provider, capability, "mid")
  );
}
