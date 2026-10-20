/**
 * Single source of truth for product "facts" that appear as copy across many
 * surfaces — which providers each plan supports, plan display names, and
 * per-plan quotas.
 *
 * Why this exists: these strings used to be hand-typed into dozens of content
 * JSON files (`www/content/**`, `web/src/i18n/locales/**`) and drifted — vs
 * pages advertised "GPT-4, GPT-4o" long after the frontier default moved to
 * GPT-5.2, listed Anthropic as a BYOK-Free option (it wasn't, until
 * 2026-10-06), and named a retired "Pro" plan. Centralising them here means a quota or a provider
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
 * Provider gating (owner, 2026-10-06; specs/open-providers.md):
 *   • Every bring-your-own-key plan (the plugin with no account, Free, BYOK)
 *     takes an OpenAI, Gemini or Claude key. Until 2026-10-06 the plugin with
 *     no account took OpenAI only and Free took OpenAI or Gemini.
 *   • Managed Cloud — one AI lineup chosen by us; copy never names a provider
 *     or model for it (specs/managed-ai-lineup.md §3). That is why there are
 *     no model-name or failover facts here.
 *
 * Cloud is one plan with volume options since 2026-10-12
 * (specs/cloud-volume-pricing.md): the posts, images and video caps of each
 * option live on its Stripe price, so they are not facts here. Each app reads
 * them from its generated catalog and turns them into tokens with
 * {@link cloudOptionTokens}, so a new listed price needs no code change.
 */

import type { SupportedLocale } from "@structura/i18n-contracts";

/** Providers every bring-your-own-key plan accepts, in display order. */
const KEY_PROVIDERS: readonly string[] = ["OpenAI", "Gemini", "Claude"];

/** "or" per locale. */
const OR: Record<SupportedLocale, string> = {
  en: "or",
  de: "oder",
  es: "o",
  fr: "ou",
};

/**
 * Returns `values` as a localized "A, B or C" list. `locale` may be
 * composite (`de_AT`, `es-419`); unknown locales fall back to English.
 */
function orList(values: readonly string[], locale: string): string {
  if (values.length < 2) return values.join("");
  const lang = locale.slice(0, 2).toLowerCase();
  const loc: SupportedLocale = lang in OR ? (lang as SupportedLocale) : "en";
  const last = values[values.length - 1];
  return `${values.slice(0, -1).join(", ")} ${OR[loc]} ${last}`;
}

/**
 * Returns the providers as a localized "A, B or C" list. `locale` may be
 * composite (`de_AT`, `es-419`); unknown locales fall back to English.
 */
export function providerList(locale: string): string {
  return orList(KEY_PROVIDERS, locale);
}

/** Providers every bring-your-own-key plan accepts, as an English list. */
export const OWN_KEY_PROVIDERS = providerList("en");

/**
 * Canonical plan display names. There is no "Pro" plan: Cloud Pro was folded
 * into Cloud as its 100-post option on 2026-10-12.
 */
export const PLAN_NAMES = {
  free: "Free",
  byok: "BYOK",
  cloud: "Cloud",
} as const;

/**
 * One listed Cloud option, as its Stripe price metadata describes it. A post
 * counts when it is delivered and includes its research, writing and images
 * (specs/managed-ai-lineup.md §4).
 */
export interface CloudOptionFacts {
  /** Posts per site per UTC month; also the option's identity. */
  maxPosts: number;
  /** Images per site per month. */
  maxImages: number;
  /** AI videos per site per month. */
  videoMonthlyCap: number;
}

/**
 * Returns the content tokens for the listed Cloud options: localized lists
 * across options (`cloudPostOptions` → "30 or 100") and per-option values
 * (`cloudOption30Images` → "90"). A content token for an option that is no
 * longer listed stays unresolved, which the content tests catch.
 */
export function cloudOptionTokens(
  options: readonly CloudOptionFacts[],
  locale = "en"
): Record<string, string> {
  const sorted = [...options].sort((a, b) => a.maxPosts - b.maxPosts);
  const tokens: Record<string, string> = {
    cloudPostOptions: orList(
      sorted.map((o) => String(o.maxPosts)),
      locale
    ),
    cloudImageOptions: orList(
      sorted.map((o) => String(o.maxImages)),
      locale
    ),
    cloudVideoOptions: orList(
      sorted.map((o) => String(o.videoMonthlyCap)),
      locale
    ),
  };
  for (const o of sorted) {
    tokens[`cloudOption${o.maxPosts}Posts`] = String(o.maxPosts);
    tokens[`cloudOption${o.maxPosts}Images`] = String(o.maxImages);
    tokens[`cloudOption${o.maxPosts}Videos`] = String(o.videoMonthlyCap);
  }
  return tokens;
}

/** Rough BYOK provider API-cost estimate for daily publishing (not a Stripe
 *  price — it's the customer's own provider bill, so it lives with the facts,
 *  not the catalog). */
export const BYOK_API_COST_ESTIMATE = "$5–15/month";

/**
 * Flat `{ token: value }` map consumed by the content-interpolation layers.
 * Keys are `[A-Za-z0-9]+` so they satisfy both `www`'s `{{\w+}}` matcher and
 * i18next's default `{{key}}` syntax. Provider lists are joined in `locale`
 * (default English). Cloud option facts come from {@link cloudOptionTokens}.
 */
export function productFactTokens(locale = "en"): Record<string, string> {
  return {
    // Named for BYOK, but every own-key plan takes this list since 2026-10-06.
    byokProviders: providerList(locale),
    planFree: PLAN_NAMES.free,
    planByok: PLAN_NAMES.byok,
    planCloud: PLAN_NAMES.cloud,
    byokApiCost: BYOK_API_COST_ESTIMATE,
  };
}
