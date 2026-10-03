/**
 * Single source of truth for product "facts" that appear as copy across many
 * surfaces — which providers each plan supports, plan display names, and
 * per-plan quotas.
 *
 * Why this exists: these strings used to be hand-typed into dozens of content
 * JSON files (`www/content/**`, `web/src/i18n/locales/**`) and drifted — vs
 * pages advertised "GPT-4, GPT-4o" long after the frontier default moved to
 * GPT-5.2, listed Anthropic as a BYOK-Free option (it isn't), and named a
 * retired "Pro" plan. Centralising them here means a quota or a provider
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
 * Provider gating (per Yurii, plugin-only case confirmed 2026-10-03):
 *   • Paid BYOK — bring any key: OpenAI, Gemini, or Anthropic.
 *   • Free — also bring-your-own-key, but OpenAI or Gemini only (no Anthropic).
 *   • The plugin with no account (anonymous mode) — bring-your-own-key, OpenAI only.
 *   • Managed Cloud and Cloud Pro — one AI lineup chosen by us; copy never
 *     names a provider or model for these plans (specs/managed-ai-lineup.md §3).
 *     That is why there are no model-name or failover facts here.
 */

import type { SupportedLocale } from "@structura/i18n-contracts";

/** A plan that runs on the customer's own AI key. */
export type KeyPlan = "pluginOnly" | "free" | "byok";

/** Providers each bring-your-own-key plan accepts, in display order. */
export const PROVIDERS_BY_PLAN: Record<KeyPlan, readonly string[]> = {
  pluginOnly: ["OpenAI"],
  free: ["OpenAI", "Gemini"],
  byok: ["OpenAI", "Gemini", "Anthropic"],
};

/** "or" per locale; Spanish uses "u" before a word that starts with an o sound. */
const OR: Record<SupportedLocale, (next: string) => string> = {
  en: () => "or",
  de: () => "oder",
  es: (next) => (/^h?o/i.test(next) ? "u" : "o"),
  fr: () => "ou",
};

/**
 * Returns the plan's providers as a localized "A, B or C" list. Only English
 * takes the Oxford comma. `locale` may be composite (`de_AT`, `es-419`);
 * unknown locales fall back to English.
 */
export function providerList(locale: string, plan: KeyPlan): string {
  const lang = locale.slice(0, 2).toLowerCase();
  const loc: SupportedLocale = lang in OR ? (lang as SupportedLocale) : "en";
  const names = PROVIDERS_BY_PLAN[plan];
  if (names.length === 1) return names[0];
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(", ");
  const comma = loc === "en" && names.length > 2 ? "," : "";
  return `${head}${comma} ${OR[loc](last)} ${last}`;
}

/** Providers a paid BYOK user may bring a key for (English). */
export const BYOK_PROVIDERS = providerList("en", "byok");
/** Providers the Free tier may bring a key for, no Anthropic (English). */
export const FREE_PROVIDERS = providerList("en", "free");
/** Providers the plugin accepts with no account, anonymous mode (English). */
export const PLUGIN_ONLY_PROVIDERS = providerList("en", "pluginOnly");

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

/**
 * Monthly posts quota per site, by managed plan (owner, 2026-10-01). A post
 * counts when it is delivered to the customer and includes its research,
 * writing and images. Spec: specs/managed-ai-lineup.md §4, §6.1.
 */
export const POST_QUOTA = {
  cloud: 30,
  cloudPro: 100,
} as const;

/** Rough BYOK provider API-cost estimate for daily publishing (not a Stripe
 *  price — it's the customer's own provider bill, so it lives with the facts,
 *  not the catalog). */
export const BYOK_API_COST_ESTIMATE = "$5–15/month";

/**
 * Flat `{ token: value }` map consumed by the content-interpolation layers.
 * Keys are `[A-Za-z0-9]+` so they satisfy both `www`'s `{{\w+}}` matcher and
 * i18next's default `{{key}}` syntax. Numeric quotas are stringified because
 * interpolation substitutes text. Provider lists are joined in `locale`
 * (default English).
 */
export function productFactTokens(locale = "en"): Record<string, string> {
  return {
    byokProviders: providerList(locale, "byok"),
    freeProviders: providerList(locale, "free"),
    pluginOnlyProviders: providerList(locale, "pluginOnly"),
    planFree: PLAN_NAMES.free,
    planByok: PLAN_NAMES.byok,
    planCloud: PLAN_NAMES.cloud,
    planCloudPro: PLAN_NAMES.cloudPro,
    imageQuotaCloud: String(IMAGE_QUOTA.cloud),
    imageQuotaCloudPro: String(IMAGE_QUOTA.cloudPro),
    postQuotaCloud: String(POST_QUOTA.cloud),
    postQuotaCloudPro: String(POST_QUOTA.cloudPro),
    byokApiCost: BYOK_API_COST_ESTIMATE,
  };
}
