import type { AIProvider, PlanId } from "@structura/types";
import type { ModelRole, ModelTier } from "./types";
import { getDefaultModel, getRegistryModelId, type ImageProvider } from "./catalog";
import {
  FROZEN_FAST_TEXT_MODELS,
  FROZEN_LEGACY_DEFAULT_TEXT_MODELS,
  FROZEN_MANAGED_TEXT_MODELS,
  FROZEN_SOCIAL_COPY_TEXT_MODELS,
  FROZEN_SUGGESTION_TEXT_MODELS,
} from "./frozen";
import { MODELS } from "./model-data";
import { RECOMMENDATIONS } from "./recommendations";

/**
 * Use-case binding layer (spec: `specs/model-tier-selection.md` §3). Each
 * feature resolves to a registry model by REFERENCE — never a hard-coded id —
 * so a model bump/retirement in `model-data.ts` flows to every consumer.
 *
 * Keyed by feature, not surface: the same feature on the onboarding wizard and
 * on a settings/special page resolves identically. The exceptions are the
 * FROZEN bindings, which pin the ids of `frozen.ts` until their own test
 * moves them (2026-10-01, specs/byok-ai-guidance.md §2).
 */

/**
 * Suggestions on BYOK and Free (campaign strategy, positioning, keywords,
 * competitors, topics, personas, visuals, the onboarding wizard) resolve to
 * the quality-top model of 2026-04-28, because suggestions run rarely and
 * quality matters there. FROZEN pending its own test: the 2026-10-01 tier
 * refresh does not move it (specs/byok-ai-guidance.md §2).
 */
export function resolveSuggestionModelId(provider: AIProvider): string {
  return FROZEN_SUGGESTION_TEXT_MODELS[provider];
}

/**
 * The text model for a BYOK or Free post that stores no tier and no model,
 * and for a non-managed campaign's fallback provider: the provider's
 * Standard tier, as a primary would get (2026-10-01).
 */
export function resolveByokDefaultTextModelId(provider: AIProvider): string {
  return getRegistryModelId(provider, "text", "mid") ?? getDefaultModel(provider, "text");
}

/**
 * The model a stored concrete text id runs on a BYOK or Free post: the
 * current model of the tier a superseded id held, else the id unchanged
 * (a current model, or one that never had a tier such as `gpt-4o`).
 * Spec: specs/byok-ai-guidance.md §2.
 */
export function resolveSupersededTextModelId(provider: AIProvider, modelId: string): string {
  const m = MODELS.find((x) => x.provider === provider && x.role === "text" && x.id === modelId);
  if (!m?.supersededTier) return modelId;
  return getRegistryModelId(provider, "text", m.supersededTier) ?? modelId;
}

/**
 * The recommended text tier for a provider (`RECOMMENDATIONS.text.model`),
 * or `mid` for a provider without one (Gemini), and that tier's model.
 */
export function resolveRecommendedTextModel(provider: AIProvider): { tier: "top" | "mid"; model: string } {
  const tier = RECOMMENDATIONS.text.model[provider] ?? "mid";
  return { tier, model: getRegistryModelId(provider, "text", tier) ?? resolveByokDefaultTextModelId(provider) };
}

/**
 * The recommended image tier for a provider (`RECOMMENDATIONS.image.model`)
 * and that tier's model, or `null` for a provider without image models.
 */
export function resolveRecommendedImageModel(provider: AIProvider): { tier: "top" | "mid"; model: string } | null {
  const tier = RECOMMENDATIONS.image.model[provider];
  const model = tier ? getRegistryModelId(provider, "image", tier) : undefined;
  return tier && model ? { tier, model } : null;
}

/**
 * The pre-refresh default text model, for internal utility callers that
 * used `defaults.text` (keyword and authority discovery, keyphrase
 * extraction) and for a managed-AI license on a non-managed plan.
 * FROZEN pending its own test.
 */
export function resolveLegacyDefaultTextModelId(provider: AIProvider): string {
  return FROZEN_LEGACY_DEFAULT_TEXT_MODELS[provider];
}

/**
 * The model BYOK and Free social copy and video scripts run on, from the
 * writer model the post was generated with: the pre-refresh model of the
 * same provider and tier, else the writer model. FROZEN pending its own test.
 */
export function resolveSocialCopyModelId(provider: AIProvider, writerModelId: string): string {
  return FROZEN_SOCIAL_COPY_TEXT_MODELS[provider][writerModelId] ?? writerModelId;
}

/** The fast text model (the authority ranker, served `defaults.fast`). FROZEN pending its own test. */
export function resolveFastModelId(provider: AIProvider): string {
  return FROZEN_FAST_TEXT_MODELS[provider];
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
    getDefaultModel(provider, "text")
  );
}

/**
 * True for the plans whose AI lineup Structura owns (Cloud, Cloud Pro).
 * Mirrors `isManagedPlan` in `@structura/types`, which this package may only
 * import as a type (see `types.ts`).
 */
function isManagedLineupPlan(plan: PlanId | "none" | null | undefined): boolean {
  return plan === "cloud" || plan === "cloud_pro";
}

/**
 * The post-generation grounding audit (`functions/src/ai/grounding-audit.ts`)
 * model for a plan: Cloud and Cloud Pro get the `premium` auditor, every
 * other tier that is audited (BYOK, free single posts with research
 * documents) the `standard` one. Platform-paid in every case. Owner
 * decisions 2026-10-01: Gemini 3.5 Flash (the previous auditor) failed 15 of
 * 33 audits in the shortlist matrix on 2x100 s timeouts and was the only
 * strong auditor that removed a must-keep sentence; later the same day the
 * premium auditor moved to Cloud too (Opus 5.5 found 7 real problems in 12
 * drafts where Gemini 3.8 Flash found none). Spec:
 * `specs/grounding-audit.md` §2.2, §3; `specs/managed-ai-lineup.md` §2.
 */
export function resolveGroundingAuditModel(
  plan: PlanId | "none" | null | undefined,
): { provider: AIProvider; model: string } {
  const role = isManagedLineupPlan(plan) ? "premium" : "standard";
  const m = MODELS.find((x) => x.auditor === role);
  if (!m) throw new Error(`model-catalog: no ${role} grounding auditor`);
  return { provider: m.provider, model: m.id };
}

/** One model of the managed lineup. */
export interface ManagedLineupModel {
  provider: AIProvider;
  model: string;
}

/**
 * The managed writer lineup for a plan: `writer` writes every Cloud and
 * Cloud Pro post (live synthesis, stock batch, Run now, single post) and
 * `failover` takes over live synthesis when the writer fails transiently or
 * times out. Returns `undefined` for every other plan, whose writer stays
 * the campaign's own provider and model. Both plans share one lineup: the
 * model tier is no longer what separates Cloud from Cloud Pro (owner
 * decision 2026-10-01). Spec: `specs/managed-ai-lineup.md` §2.
 */
export function resolveManagedWriterLineup(
  plan: PlanId | "none" | null | undefined,
): { writer: ManagedLineupModel; failover: ManagedLineupModel } | undefined {
  if (!isManagedLineupPlan(plan)) return undefined;
  const pick = (role: "primary" | "failover"): ManagedLineupModel => {
    const m = MODELS.find((x) => x.managedWriter === role);
    if (!m) throw new Error(`model-catalog: no managed ${role} writer`);
    return { provider: m.provider, model: m.id };
  };
  return { writer: pick("primary"), failover: pick("failover") };
}

/** One model of the managed image binding; `quality` is the OpenAI gpt-image quality sent with it. */
export interface ManagedImageModel {
  provider: ImageProvider;
  model: string;
  quality?: "low" | "medium" | "high";
}

/**
 * Quality of the managed image failover. Medium measured $0.012 per image
 * against $0.043 at high in the 2026-10-05 test, and the failover only runs
 * when the primary fails. Owner decision 2026-10-06.
 */
const MANAGED_IMAGE_FAILOVER_QUALITY = "medium" as const;

/**
 * The managed image binding for a plan: `primary` makes every Cloud and
 * Cloud Pro image (live synthesis, stock batch, regenerate, refresh) and
 * `failover` takes over when the primary fails transiently. The campaign's
 * stored image provider, model, tier and fallback are ignored on these
 * plans. Returns `undefined` for every other plan, whose images stay on the
 * campaign's own provider and model. Keyed on the plan like
 * {@link resolveManagedWriterLineup}. The failover is on another provider on
 * purpose: a second model of the same provider shares its outage and quota.
 * Owner decision 2026-10-06 (blind image test 2026-10-05). Spec:
 * `specs/managed-ai-lineup.md` §2.4.
 */
export function resolveManagedImageBinding(
  plan: PlanId | "none" | null | undefined,
): { primary: ManagedImageModel; failover: ManagedImageModel } | undefined {
  if (!isManagedLineupPlan(plan)) return undefined;
  const pick = (role: "primary" | "failover"): ManagedImageModel => {
    const m = MODELS.find((x) => x.managedImage === role);
    if (!m || (m.provider !== "openai" && m.provider !== "gemini")) {
      throw new Error(`model-catalog: no managed ${role} image model`);
    }
    return { provider: m.provider, model: m.id };
  };
  return {
    primary: pick("primary"),
    failover: { ...pick("failover"), quality: MANAGED_IMAGE_FAILOVER_QUALITY },
  };
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
 * — replaces the `PLAN_DEFAULTS` pin table. Images derive from the registry
 * tier. Text is the legacy managed mapping, FROZEN pending its own test at
 * the pre-2026-10-01 ids (frozen.ts): it feeds suggestions and social copy
 * on managed plans, and posts there use the managed lineup instead. Returns
 * `undefined` only if the provider carries no model at the resolved tier or
 * its `mid` fallback; managed callers then fall back to the provider's
 * catalog default.
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
  if (capability === "text") return FROZEN_MANAGED_TEXT_MODELS[plan][provider];
  const tier = resolveManagedTier(plan, capability, provider);
  return (
    getRegistryModelId(provider, capability, tier) ??
    getRegistryModelId(provider, capability, "mid")
  );
}

/**
 * Default output token budget for one text generation: the stock batch path's
 * 64k (room for a reasoning model's thinking plus a long blueprint). Models
 * with a lower maximum carry `maxOutputTokens`.
 */
export const TEXT_OUTPUT_BUDGET = 65536;

/**
 * Output token budget for one text generation with this model, shared by the
 * engine's direct callers and the stock batch path so they never disagree.
 * 2026-10-01: Sonnet 5's adaptive thinking spent the direct path's whole
 * 16,384-token `max_tokens` and returned no JSON, while batch (65,536) worked.
 */
export function resolveTextOutputBudget(provider: AIProvider, modelId: string): number {
  return (
    MODELS.find((m) => m.provider === provider && m.role === "text" && m.id === modelId)?.maxOutputTokens ??
    TEXT_OUTPUT_BUDGET
  );
}

/** False when the model rejects any explicit temperature (`fixedTemperature`); true otherwise, including unknown ids. */
export function acceptsTemperature(provider: AIProvider, modelId: string): boolean {
  return !MODELS.find((m) => m.provider === provider && m.id === modelId)?.fixedTemperature;
}

/** True when the model accepts its provider's low reasoning setting (`lowEffort`); false for unknown ids. */
export function acceptsLowEffort(provider: AIProvider, modelId: string): boolean {
  return !!MODELS.find((m) => m.provider === provider && m.id === modelId)?.lowEffort;
}
