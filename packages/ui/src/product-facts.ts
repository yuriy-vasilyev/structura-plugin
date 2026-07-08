/**
 * Single source of truth for product "facts" that appear as copy across many
 * surfaces — AI model names, which providers each plan supports, plan display
 * names, and per-plan quotas.
 *
 * Why this exists: these strings used to be hand-typed into dozens of content
 * JSON files (`www/content/**`, `web/src/i18n/locales/**`) and drifted — vs
 * pages advertised "GPT-4, GPT-4o" long after the frontier default moved to
 * GPT-5.2, listed Anthropic as a BYOK-Free option (it isn't), and named a
 * retired "Pro" plan. Centralising them here means a model bump or a provider
 * rule change is one edit, and every page picks it up via interpolation
 * (`{{token}}` → value): `productFactTokens()` feeds `www`'s server-side
 * dictionary interpolation and `web`'s i18next `defaultVariables`.
 *
 * This module is intentionally pure data — no React, no i18n runtime — so it
 * can be imported from a Next Server Component, a Vite client bundle, or a
 * test with equal ease. Prices are deliberately NOT here: they live in the
 * Stripe-generated `catalog.generated.ts` and are exposed via each app's
 * `catalog.ts` `priceTokens()` so there is exactly one price source.
 *
 * Provider gating (per Yurii):
 *   • Paid BYOK — bring any key: OpenAI, Gemini, or Anthropic.
 *   • Free — also bring-your-own-key, but OpenAI or Gemini only (no Anthropic).
 *   • Managed Cloud — sequential failover OpenAI → Gemini → Anthropic.
 */

/** Marketing-facing AI model names, grouped by role. Bump these on a model
 *  refresh and every surface updates. */
export const AI_MODELS = {
  /** Frontier defaults on Cloud Pro. */
  openaiFrontier: "GPT-5.2",
  anthropicFrontier: "Claude Opus 4.7",
  geminiFrontier: "Gemini 3 Pro",
  /** Managed-Cloud mid-tier text default. */
  geminiDefault: "Gemini 3 Flash",
  /** Image models. */
  geminiImage: "Gemini Flash Image",
  openaiImageHd: "DALL·E 3 HD",
} as const;

/** The three frontier defaults as a single comma-joined phrase — the exact
 *  string the Cloud Pro card and vs pages render. */
export const FRONTIER_MODELS = `${AI_MODELS.openaiFrontier}, ${AI_MODELS.anthropicFrontier}, ${AI_MODELS.geminiFrontier}`;

/** Providers a paid BYOK user may bring a key for. */
export const BYOK_PROVIDERS = "OpenAI, Gemini, or Anthropic";
/** Providers the Free tier may bring a key for (no Anthropic). */
export const FREE_PROVIDERS = "OpenAI or Gemini";
/** Managed-Cloud sequential failover order. */
export const CLOUD_FAILOVER_CHAIN = "OpenAI → Gemini → Anthropic";

/** Canonical plan display names. There is no plain "Pro" plan. */
export const PLAN_NAMES = {
  free: "Free",
  byok: "BYOK",
  cloud: "Cloud",
  cloudPro: "Cloud Pro",
} as const;

/** Monthly image quota per site, by managed plan. */
export const IMAGE_QUOTA = {
  cloud: 90,
  cloudPro: 150,
} as const;

/** Rough BYOK provider API-cost estimate for daily publishing (not a Stripe
 *  price — it's the customer's own provider bill, so it lives with the facts,
 *  not the catalog). */
export const BYOK_API_COST_ESTIMATE = "$5–15/month";

/**
 * Flat `{ token: value }` map consumed by the content-interpolation layers.
 * Keys are `[A-Za-z0-9]+` so they satisfy both `www`'s `{{\w+}}` matcher and
 * i18next's default `{{key}}` syntax. Numeric quotas are stringified because
 * interpolation substitutes text.
 */
export function productFactTokens(): Record<string, string> {
  return {
    frontierModels: FRONTIER_MODELS,
    modelOpenAiFrontier: AI_MODELS.openaiFrontier,
    modelAnthropicFrontier: AI_MODELS.anthropicFrontier,
    modelGeminiFrontier: AI_MODELS.geminiFrontier,
    modelGeminiDefault: AI_MODELS.geminiDefault,
    modelGeminiImage: AI_MODELS.geminiImage,
    modelOpenAiImageHd: AI_MODELS.openaiImageHd,
    byokProviders: BYOK_PROVIDERS,
    freeProviders: FREE_PROVIDERS,
    failoverChain: CLOUD_FAILOVER_CHAIN,
    planFree: PLAN_NAMES.free,
    planByok: PLAN_NAMES.byok,
    planCloud: PLAN_NAMES.cloud,
    planCloudPro: PLAN_NAMES.cloudPro,
    imageQuotaCloud: String(IMAGE_QUOTA.cloud),
    imageQuotaCloudPro: String(IMAGE_QUOTA.cloudPro),
    byokApiCost: BYOK_API_COST_ESTIMATE,
  };
}
