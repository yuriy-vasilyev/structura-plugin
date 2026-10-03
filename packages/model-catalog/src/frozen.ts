import type { AIProvider } from "@structura/types";

/**
 * Model ids pinned by the 2026-10-01 BYOK catalog refresh
 * (specs/byok-ai-guidance.md §2). Each table freezes what one binding
 * resolved to before the refresh moved the text tiers, so that binding does
 * not move with them. Each is FROZEN pending its own test: change one only
 * with a test run of the feature it feeds. Internal to the package; read
 * through the named bindings in `bindings.ts`.
 */

/**
 * Suggestions on BYOK and Free (strategy, positioning, keywords,
 * competitors, topics, personas, visuals, the onboarding wizard). The
 * quality-top model per provider as of 2026-04-28. FROZEN pending its own test.
 */
export const FROZEN_SUGGESTION_TEXT_MODELS: Readonly<Record<AIProvider, string>> = Object.freeze({
  openai: "gpt-5.2-2025-12-11",
  gemini: "gemini-3.1-pro-preview",
  anthropic: "claude-opus-4-8",
});

/**
 * The legacy managed text mapping (plan × stored provider) used by
 * suggestions and social copy on Cloud and Cloud Pro. Cloud was the `mid`
 * tier, Cloud Pro the `top` tier. FROZEN pending its own test: social copy
 * runs under a 30 s deadline with `max_tokens: 1024`, which Sonnet 5.5's
 * adaptive thinking would not fit.
 */
export const FROZEN_MANAGED_TEXT_MODELS: Readonly<Record<"cloud" | "cloud_pro", Readonly<Record<AIProvider, string>>>> =
  Object.freeze({
    cloud: Object.freeze({ openai: "gpt-5.4-mini", gemini: "gemini-3.5-flash", anthropic: "claude-sonnet-5" }),
    cloud_pro: Object.freeze({ openai: "gpt-5.2-2025-12-11", gemini: "gemini-3.1-pro-preview", anthropic: "claude-opus-4-8" }),
  });

/**
 * The served `defaults.text` before the refresh. Kept for the internal
 * callers that read it as a utility model (keyword and authority
 * discovery, keyphrase extraction) and for a managed-AI license on a
 * non-managed plan. FROZEN pending its own test.
 */
export const FROZEN_LEGACY_DEFAULT_TEXT_MODELS: Readonly<Record<AIProvider, string>> = Object.freeze({
  openai: "gpt-5.2-2025-12-11",
  gemini: "gemini-3.1-pro-preview",
  anthropic: "claude-sonnet-5",
});

/**
 * The served `defaults.fast` before the refresh (the authority ranker and
 * any plugin that reads `defaults.fast`). FROZEN pending its own test.
 */
export const FROZEN_FAST_TEXT_MODELS: Readonly<Record<AIProvider, string>> = Object.freeze({
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.5-flash",
  anthropic: "claude-haiku-4-5-20251001",
});

/**
 * Social copy and video script on BYOK and Free: the writer model a post
 * was generated with → the model its social copy runs on. A current tier
 * model maps to the model that held the same provider and tier before
 * the 2026-10-01 refresh, so social copy keeps running where it ran
 * before. FROZEN pending its own test: the adapt step has a 30 s deadline
 * and `max_tokens: 1024`, which the newer models' thinking or reasoning
 * can spend whole, leaving every social post on the title-only fallback.
 * Ids not listed here (including `gemini-3.1-pro-preview`, which kept its
 * tier) run as stored.
 */
export const FROZEN_SOCIAL_COPY_TEXT_MODELS: Readonly<Record<AIProvider, Readonly<Record<string, string>>>> =
  Object.freeze({
    anthropic: Object.freeze({ "claude-sonnet-5-5": "claude-sonnet-5", "claude-opus-5-5": "claude-opus-4-8" }),
    openai: Object.freeze({ "gpt-5.6-sol": "gpt-5.4-mini", "gpt-6-astra": "gpt-5.2-2025-12-11" }),
    gemini: Object.freeze({ "gemini-3.8-flash": "gemini-3.5-flash" }),
  });

/**
 * The served `recommended` flag on IMAGE models, exactly as it was before
 * 2026-10-01. Legacy, not from testing: kept only so old plugin and portal
 * builds preselect the same image model as before (the wp-admin provider
 * wizard picks the recommended image model). New builds show no label for
 * image models. Text `recommended` derives from `RECOMMENDATIONS`.
 * FROZEN pending its own test.
 */
export const FROZEN_RECOMMENDED_IMAGE_MODELS: Readonly<Record<AIProvider, string | undefined>> = Object.freeze({
  openai: "gpt-image-2",
  gemini: "gemini-3.1-flash-image",
  anthropic: undefined,
});
