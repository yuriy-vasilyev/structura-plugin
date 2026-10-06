import type { CatalogModel } from "./types";

/**
 * THE canonical model list. Every other export in this package — the served
 * `MODEL_CATALOG`, the per-role defaults, the batch price map, and the registry
 * binding layer — is derived from this array. Add / retire / re-tier a model
 * here and it propagates everywhere; there is no second list to keep in lockstep.
 *
 * Two classification axes:
 * - `role` (`text` | `image` | `tts`) — the capability.
 * - `tier` (`top` | `mid` | `cheap`) — quality/cost rank within a
 *   `(provider, role)`, read by the binding layer (`getRegistryModelId`).
 *
 * The `default` flag marks the role default served as `defaults.text` /
 * `defaults.image` (the Standard text tier since 2026-10-01). The served
 * `recommended` flag is derived from `RECOMMENDATIONS` (recommendations.ts),
 * never stored here, and `defaults.fast` comes from a frozen binding
 * (bindings.ts). `tts` models are registry-only and never appear in the
 * served catalog (see `buildProvider`).
 *
 * Image models are intentionally limited to mid + top per provider — no
 * fast/cheap image variants. Rationale + cost analysis:
 * `specs/v2/cloud-pregeneration-and-model-catalog.md` §2.1.1. Overall tier +
 * binding design: `specs/model-tier-selection.md`.
 *
 * Prices (`batchInputUsdPerMTok`) are the post-Batch-discount input rate in USD
 * per million tokens. They live on the record so the batch cost estimator can
 * no longer key a price off a stale/short model id. `pricing` carries the full
 * list prices as read from each provider's page on its `pricedAt` date
 * (2026-10-01 refresh: `functions/eval/post-pipeline/model-prices-2026-10-01.md`,
 * gitignored); a rate the page did not show is left out, not guessed.
 *
 * `unlisted` entries are known but not offered: no tier, not served, reachable
 * only by explicit id (the eval harness, the frozen bindings). An unlisted
 * entry with `supersededTier` used to hold that tier: a stored id resolves to
 * the tier's current model (`resolveSupersededTextModelId`). Every id was confirmed on the
 * provider's list-models API before it was added.
 */
export const MODELS: readonly CatalogModel[] = [
  // ---------------------------------------------------------------------------
  // OpenAI
  // ---------------------------------------------------------------------------
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    provider: "openai",
    role: "text",
    // BYOK Top since 2026-10-01 (specs/byok-ai-guidance.md §2).
    tier: "top",
    batchInputUsdPerMTok: 5,
    // 400 on temperature 0.7 (probed 2026-10-01).
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 10, outputUsdPerMTok: 50, batchInputUsdPerMTok: 5, batchOutputUsdPerMTok: 25, longContext: { inputUsdPerMTok: 20, outputUsdPerMTok: 75, batchInputUsdPerMTok: 10, batchOutputUsdPerMTok: 37.5 } },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "openai",
    role: "text",
    // BYOK Standard since 2026-10-01 (specs/byok-ai-guidance.md §2), and the
    // provider's default for a BYOK post that stores no model.
    tier: "mid",
    default: true,
    batchInputUsdPerMTok: 2,
    // Managed writer failover (live synthesis only), owner decision 2026-10-01.
    managedWriter: "failover",
    // 400 on temperature 0.7 (probed 2026-10-01).
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 4, outputUsdPerMTok: 20, batchInputUsdPerMTok: 2, batchOutputUsdPerMTok: 10, longContext: { inputUsdPerMTok: 8, outputUsdPerMTok: 30, batchInputUsdPerMTok: 4, batchOutputUsdPerMTok: 15 }, note: "Promotional pricing at least through 2026-11-21." },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5.2-2025-12-11",
    name: "GPT-5.2",
    provider: "openai",
    role: "text",
    // Superseded 2026-10-01 (specs/byok-ai-guidance.md §2): a campaign that
    // stores this id runs the current Top model. Still callable by
    // explicit id: the frozen bindings in bindings.ts pin it.
    unlisted: true,
    supersededTier: "top",
    batchInputUsdPerMTok: 0.875,
    // Priced as gpt-5.2: the page lists only the undated id.
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 1.75, outputUsdPerMTok: 14, batchInputUsdPerMTok: 0.875, batchOutputUsdPerMTok: 7 },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "openai",
    role: "text",
    // Superseded 2026-10-01 (specs/byok-ai-guidance.md §2): a campaign that
    // stores this id runs the current Standard model. Still callable by
    // explicit id: the frozen bindings in bindings.ts pin it.
    unlisted: true,
    supersededTier: "mid",
    batchInputUsdPerMTok: 0.375,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.75, outputUsdPerMTok: 4.5, batchInputUsdPerMTok: 0.375, batchOutputUsdPerMTok: 2.25 },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5-nano-2025-08-07",
    name: "GPT-5 Nano",
    provider: "openai",
    role: "text",
    tier: "cheap",
    // 400 on any explicit temperature (2026-10-01).
    fixedTemperature: true,
    // Priced as gpt-5-nano (the page lists the undated id).
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.05, outputUsdPerMTok: 0.4, batchInputUsdPerMTok: 0.025, batchOutputUsdPerMTok: 0.2 },
    deprecation: { retiresOn: "2026-12-11", note: "Dated snapshot deprecated; OpenAI names gpt-5.6-luna as the replacement." },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    role: "text",
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 2.5, outputUsdPerMTok: 10, batchInputUsdPerMTok: 1.25, batchOutputUsdPerMTok: 5 },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    role: "text",
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6, batchInputUsdPerMTok: 0.075, batchOutputUsdPerMTok: 0.3 },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  // Known, not offered (2026-10-01 refresh): `unlisted`, no tier, harness-only
  // until the owner binds them. Ids confirmed on OpenAI's list-models API;
  // long-context rates are on the pricing page without their threshold.
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    provider: "openai",
    role: "text",
    unlisted: true,
    // 400 on temperature 0.7 (probed 2026-10-01).
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 2, outputUsdPerMTok: 10, batchInputUsdPerMTok: 1, batchOutputUsdPerMTok: 5, longContext: { inputUsdPerMTok: 4, outputUsdPerMTok: 15, batchInputUsdPerMTok: 2, batchOutputUsdPerMTok: 7.5 } },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "openai",
    role: "text",
    unlisted: true,
    // 400 on temperature 0.7 (probed 2026-10-01).
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5, batchInputUsdPerMTok: 0.05, batchOutputUsdPerMTok: 0.25, longContext: { inputUsdPerMTok: 0.2, outputUsdPerMTok: 0.75, batchInputUsdPerMTok: 0.1, batchOutputUsdPerMTok: 0.375 } },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: "openai",
    role: "text",
    unlisted: true,
    // 400 on temperature 0.7 (probed 2026-10-01).
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 2, outputUsdPerMTok: 12, batchInputUsdPerMTok: 1, batchOutputUsdPerMTok: 6, longContext: { inputUsdPerMTok: 4, outputUsdPerMTok: 18, batchInputUsdPerMTok: 2, batchOutputUsdPerMTok: 9 } },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    provider: "openai",
    role: "text",
    unlisted: true,
    // 400 on temperature 0.7 (probed 2026-10-01).
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.2, outputUsdPerMTok: 1.2, batchInputUsdPerMTok: 0.1, batchOutputUsdPerMTok: 0.6, longContext: { inputUsdPerMTok: 0.4, outputUsdPerMTok: 1.8, batchInputUsdPerMTok: 0.2, batchOutputUsdPerMTok: 0.9 } },
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  // Image — strict mid + top (see header). gpt-image-1-mini is the Cloud-tier
  // mid; gpt-image-2 is the Agency / Cloud Pro top.
  {
    id: "gpt-image-1-mini",
    name: "GPT Image 1 Mini",
    provider: "openai",
    role: "image",
    tier: "mid",
    default: true,
    deprecation: { retiresOn: "2026-12-01", note: "OpenAI shuts gpt-image-1-mini down; gpt-image-2.5-flare is the fast successor." },
    manifest: {
      family: "image",
      endpoint: "v1/images/generations",
      sizes: { "1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536" },
      qualities: ["low", "medium", "high", "auto"],
      default_quality: "high",
    },
  },
  {
    id: "gpt-image-2",
    name: "GPT Image 2",
    provider: "openai",
    role: "image",
    tier: "top",
    manifest: {
      family: "image",
      endpoint: "v1/images/generations",
      sizes: { "1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536" },
      qualities: ["low", "medium", "high", "auto"],
      default_quality: "high",
    },
  },
  // Known, not offered (2026-10-01): token-billed images, no per-image price published.
  {
    id: "gpt-image-2.5-sunburst",
    name: "GPT Image 2.5 Sunburst",
    provider: "openai",
    role: "image",
    unlisted: true,
    // Managed image failover at medium quality (owner decision 2026-10-06,
    // blind image test 2026-10-05). Stays unlisted: no own-key picker offers it.
    managedImage: "failover",
    // Image out $30 / 1M tokens, image in $8, text in $5 (2026-10-01).
    manifest: { family: "image", endpoint: "v1/images/generations", qualities: ["low", "medium", "high", "xhigh", "max", "auto"], default_quality: "high" },
  },
  {
    id: "gpt-image-2.5-flare",
    name: "GPT Image 2.5 Flare",
    provider: "openai",
    role: "image",
    unlisted: true,
    // Image out $30 / 1M tokens, image in $8, text in $5 (2026-10-01).
    manifest: { family: "image", endpoint: "v1/images/generations", qualities: ["low", "medium", "high", "xhigh", "max", "auto"], default_quality: "high" },
  },
  // Text-to-speech (video voiceover) — registry-only, not in the served catalog.
  {
    id: "gpt-4o-mini-tts",
    name: "GPT-4o mini TTS",
    provider: "openai",
    role: "tts",
    manifest: { family: "tts", endpoint: "v1/audio/speech" },
  },

  // ---------------------------------------------------------------------------
  // Google Gemini
  // ---------------------------------------------------------------------------
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "gemini",
    role: "text",
    tier: "top",
    batchInputUsdPerMTok: 1,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 2, outputUsdPerMTok: 12, batchInputUsdPerMTok: 1, batchOutputUsdPerMTok: 6, longContext: { aboveInputTokens: 200000, inputUsdPerMTok: 4, outputUsdPerMTok: 18, batchInputUsdPerMTok: 2, batchOutputUsdPerMTok: 9 } },
    manifest: { family: "text", endpoint: "generateContent" },
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "gemini",
    role: "text",
    // BYOK Standard since 2026-10-01 (specs/byok-ai-guidance.md §2), and the
    // provider's default for a BYOK post that stores no model.
    tier: "mid",
    default: true,
    batchInputUsdPerMTok: 0.375,
    // Low reasoning setting accepted (probed 2026-10-01).
    lowEffort: true,
    // Grounding auditor (every audited non-managed tier), owner decisions 2026-10-01.
    auditor: "standard",
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.75, outputUsdPerMTok: 3.75, batchInputUsdPerMTok: 0.375, batchOutputUsdPerMTok: 1.875, note: "Introductory through 2026-12-31; from 2027-01-01 $1.50 in / $7.50 out, batch $0.75 / $3.75." },
    manifest: { family: "text", endpoint: "generateContent" },
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "gemini",
    role: "text",
    // Superseded 2026-10-01 (specs/byok-ai-guidance.md §2): a campaign that
    // stores this id runs the current Standard model. Still callable by
    // explicit id: the frozen bindings in bindings.ts pin it.
    unlisted: true,
    supersededTier: "mid",
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 1.5, outputUsdPerMTok: 9, batchInputUsdPerMTok: 0.75, batchOutputUsdPerMTok: 4.5 },
    manifest: { family: "text", endpoint: "generateContent" },
  },
  {
    // Gemini's `cheap` — confirmed live by the slice-5 sync script (was a Flash
    // placeholder). Heading extraction / connection-ping / WP-migration resolve
    // here now, so those move Flash → Flash-Lite (the intended cost win).
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    role: "text",
    tier: "cheap",
    batchInputUsdPerMTok: 0.125,
    // Text/image/video input; audio input is $0.50 ($0.25 batch).
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.25, outputUsdPerMTok: 1.5, batchInputUsdPerMTok: 0.125, batchOutputUsdPerMTok: 0.75 },
    manifest: { family: "text", endpoint: "generateContent" },
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    role: "text",
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 1.25, outputUsdPerMTok: 10, longContext: { aboveInputTokens: 200000, inputUsdPerMTok: 2.5, outputUsdPerMTok: 15 } },
    deprecation: { note: "Google limits access to users who already used 2.5 models; new keys may be refused. Not deprecated." },
    manifest: { family: "text", endpoint: "generateContent" },
  },
  // Known, not offered (2026-10-01): `unlisted`, no tier, harness-only.
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    provider: "gemini",
    role: "text",
    unlisted: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 0.3, outputUsdPerMTok: 2.5, batchInputUsdPerMTok: 0.15, batchOutputUsdPerMTok: 1.25 },
    manifest: { family: "text", endpoint: "generateContent" },
  },
  // Image. Flash Image is the default everywhere — strong quality
  // at ~half the batch cost; Pro Image remains selectable.
  {
    id: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    provider: "gemini",
    role: "image",
    tier: "mid",
    default: true,
    // Every Cloud and Cloud Pro image (owner decision 2026-10-06, blind
    // image test 2026-10-05: 126 images, three judges and the owner's ranking).
    managedImage: "primary",
    manifest: {
      family: "image",
      endpoint: "generateContent",
      ratios: ["1:1", "4:3", "16:9", "9:16"],
    },
  },
  {
    id: "gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    provider: "gemini",
    role: "image",
    tier: "top",
    manifest: {
      family: "image",
      endpoint: "generateContent",
      ratios: ["1:1", "4:3", "16:9", "9:16"],
    },
  },
  // Known, not offered (2026-10-01).
  {
    id: "gemini-3.1-flash-lite-image",
    name: "Gemini 3.1 Flash Lite Image",
    provider: "gemini",
    role: "image",
    unlisted: true,
    // $0.0336 per 1K image; image out $30 / 1M tokens (2026-10-01).
    manifest: { family: "image", endpoint: "generateContent" },
  },
  {
    id: "gemini-3.1-flash-tts-preview",
    name: "Gemini 3.1 Flash TTS",
    provider: "gemini",
    role: "tts",
    manifest: { family: "tts", endpoint: "generateContent" },
  },

  // ---------------------------------------------------------------------------
  // Anthropic Claude — no image capability.
  // ---------------------------------------------------------------------------
  // Sonnet 5.5 is the Standard tier and the role default, Opus 5.5 the Top
  // tier (2026-10-01). Haiku is the `cheap` utility model.
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    provider: "anthropic",
    role: "text",
    // BYOK Standard since 2026-10-01 (specs/byok-ai-guidance.md §2), and the
    // provider's default for a BYOK post that stores no model.
    tier: "mid",
    default: true,
    // Managed writer (Cloud and Cloud Pro, live and stock), owner decision 2026-10-01.
    managedWriter: "primary",
    // The managed writer runs through the stock batch path, so the batch
    // cost estimator needs its price.
    batchInputUsdPerMTok: 1,
    // 64,000: within every current Claude model's output maximum (Anthropic answers 400 above a model's maximum).
    maxOutputTokens: 64000,
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 2, outputUsdPerMTok: 10, batchInputUsdPerMTok: 1, batchOutputUsdPerMTok: 5 },
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    provider: "anthropic",
    role: "text",
    // BYOK Top since 2026-10-01 (specs/byok-ai-guidance.md §2).
    tier: "top",
    batchInputUsdPerMTok: 2,
    // Low reasoning setting accepted (probed 2026-10-01).
    lowEffort: true,
    // Grounding auditor (Cloud and Cloud Pro), owner decisions 2026-10-01.
    auditor: "premium",
    // 64,000: within every current Claude model's output maximum (Anthropic answers 400 above a model's maximum).
    maxOutputTokens: 64000,
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 4, outputUsdPerMTok: 20, batchInputUsdPerMTok: 2, batchOutputUsdPerMTok: 10 },
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    role: "text",
    // Superseded 2026-10-01 (specs/byok-ai-guidance.md §2): a campaign that
    // stores this id runs the current Standard model. Still callable by
    // explicit id: the frozen bindings in bindings.ts pin it.
    unlisted: true,
    supersededTier: "mid",
    batchInputUsdPerMTok: 1,
    // 64,000: within every current Claude model's output maximum (Anthropic answers 400 above a model's maximum).
    maxOutputTokens: 64000,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 2, outputUsdPerMTok: 10, batchInputUsdPerMTok: 1, batchOutputUsdPerMTok: 5 },
    fixedTemperature: true,
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    role: "text",
    tier: "cheap",
    fast: true,
    // 64,000: within every current Claude model's output maximum (Anthropic answers 400 above a model's maximum).
    maxOutputTokens: 64000,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 1, outputUsdPerMTok: 5, batchInputUsdPerMTok: 0.5, batchOutputUsdPerMTok: 2.5 },
    deprecation: { note: "Anthropic retires it not sooner than 2026-10-15; no date set yet." },
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
    role: "text",
    // Superseded 2026-10-01 (specs/byok-ai-guidance.md §2): a campaign that
    // stores this id runs the current Top model. Still callable by
    // explicit id: the frozen bindings in bindings.ts pin it.
    unlisted: true,
    supersededTier: "top",
    batchInputUsdPerMTok: 2.5,
    // 64,000: within every current Claude model's output maximum (Anthropic answers 400 above a model's maximum).
    maxOutputTokens: 64000,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 5, outputUsdPerMTok: 25, batchInputUsdPerMTok: 2.5, batchOutputUsdPerMTok: 12.5 },
    fixedTemperature: true,
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    provider: "anthropic",
    role: "text",
    unlisted: true,
    // 64,000: within every current Claude model's output maximum (Anthropic answers 400 above a model's maximum).
    maxOutputTokens: 64000,
    fixedTemperature: true,
    pricing: { pricedAt: "2026-10-01", inputUsdPerMTok: 10, outputUsdPerMTok: 50, batchInputUsdPerMTok: 5, batchOutputUsdPerMTok: 25 },
    manifest: { family: "messages", endpoint: "v1/messages" },
  },
];
