/**
 * AI guidance for own-key plans in wp-admin: the "Recommended" words,
 * the best-first provider order (Claude, OpenAI, Gemini, used wherever
 * providers are listed since 2026-10-06) and the provider names the advice
 * reads. The recommendation itself lives in `RECOMMENDATIONS`
 * (`@structura/model-catalog`); this module only reads it.
 *
 * Spec: specs/byok-ai-guidance.md §3, §5 (wp-admin), §6.
 */

import { _x } from "@wordpress/i18n";
import { RECOMMENDATIONS } from "@structura/model-catalog";

import type { AIProvider } from "@/features/campaigns/types";

/** Returns the translated "Recommended" chip word. */
export const recommendedWord = (): string => _x("Recommended", "ai advice", "structura");

/** Returns the translated "Recommended for text" chip words. */
export const recommendedForTextWord = (): string =>
  _x("Recommended for text", "ai advice", "structura");

/** Returns the translated "Recommended for images" chip words. */
export const recommendedForImagesWord = (): string =>
  _x("Recommended for images", "ai advice", "structura");

/**
 * Returns the one recommendation chip a provider card carries: "Recommended
 * for text" on the recommended text provider (Claude), "Recommended for
 * images" on the recommended image provider (Gemini), else `null`. One chip
 * style and wording on every surface (owner review 2026-10-06).
 */
export const providerRecommendationLabel = (provider: string): string | null => {
  if (RECOMMENDATIONS.text.provider === provider) return recommendedForTextWord();
  if (RECOMMENDATIONS.image.provider === provider) return recommendedForImagesWord();
  return null;
};

/** Returns the recommended tier for `provider` and `capability`, or `undefined` when it has none. */
export const recommendedTier = (
  provider: string,
  capability: "text" | "image"
): "top" | "mid" | undefined => RECOMMENDATIONS[capability].model[provider as AIProvider];

/** Returns true when `provider` is the recommended text provider. */
export const isRecommendedTextProvider = (provider: string): boolean =>
  RECOMMENDATIONS.text.provider === provider;

/** Returns the recommended text tier for `provider`, or `undefined` when it has none. */
export const recommendedTextTier = (provider: string): "top" | "mid" | undefined =>
  RECOMMENDATIONS.text.model[provider as AIProvider];

/** Returns `providers` ordered best first for text; unranked ones keep their order at the end. */
export const orderTextProviders = <T extends string>(providers: readonly T[]): T[] => {
  const order = (RECOMMENDATIONS.text.order ?? []) as readonly string[];
  const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
  return [...providers].sort((a, b) => rank(a) - rank(b));
};

/**
 * Brand names the advice reads ("Switch to Claude"). Proper nouns, not
 * translated. 2026-10-02 owner decision: the advice names the product
 * ("Claude"), matching the pickers; provider cards keep "Anthropic Claude".
 */
export const ADVICE_PROVIDER_NAMES: Record<AIProvider, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};
