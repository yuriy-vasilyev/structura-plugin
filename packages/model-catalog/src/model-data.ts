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
 * The legacy `default`/`recommended`/`fast` flags still drive the served
 * `MODEL_CATALOG` shape UNCHANGED (wire contract for plugin installs) through
 * the slice-1→slice-2 transition; `tier` is additive. `tts` models and any
 * `cheap` models with no legacy flag are registry-only and never appear in the
 * served catalog (see `buildProvider`).
 *
 * Image models are intentionally limited to mid + top per provider — no
 * fast/cheap image variants. Rationale + cost analysis:
 * `specs/v2/cloud-pregeneration-and-model-catalog.md` §2.1.1. Overall tier +
 * binding design: `specs/model-tier-selection.md`.
 *
 * Prices (`batchInputUsdPerMTok`) are the post-Batch-discount input rate in USD
 * per million tokens. They live on the record so the batch cost estimator can
 * no longer key a price off a stale/short model id.
 */
export const MODELS: readonly CatalogModel[] = [
  // ---------------------------------------------------------------------------
  // OpenAI
  // ---------------------------------------------------------------------------
  {
    id: "gpt-5.2-2025-12-11",
    name: "GPT-5.2",
    provider: "openai",
    role: "text",
    tier: "top",
    default: true,
    recommended: true,
    batchInputUsdPerMTok: 2.5,
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "openai",
    role: "text",
    tier: "mid",
    fast: true,
    batchInputUsdPerMTok: 0.5,
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-5-nano-2025-08-07",
    name: "GPT-5 Nano",
    provider: "openai",
    role: "text",
    tier: "cheap",
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    role: "text",
    manifest: { family: "chat", endpoint: "v1/chat/completions" },
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    role: "text",
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
    recommended: true,
    manifest: {
      family: "image",
      endpoint: "v1/images/generations",
      sizes: { "1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536" },
      qualities: ["low", "medium", "high", "auto"],
      default_quality: "high",
    },
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
    default: true,
    recommended: true,
    batchInputUsdPerMTok: 1.5,
    manifest: { family: "text", endpoint: "generateContent" },
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "gemini",
    role: "text",
    tier: "mid",
    fast: true,
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
    batchInputUsdPerMTok: 0.15,
    manifest: { family: "text", endpoint: "generateContent" },
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    role: "text",
    manifest: { family: "text", endpoint: "generateContent" },
  },
  // Image. Flash Image is the RECOMMENDED default everywhere — strong quality
  // at ~half the batch cost; Pro Image remains selectable.
  {
    id: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    provider: "gemini",
    role: "image",
    tier: "mid",
    default: true,
    recommended: true,
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
  // Sonnet stays the role default (mid) so existing BYOK saves and Cloud-tier
  // callers keep landing on the same model. Opus is `recommended` (top). Haiku
  // is the `cheap` utility model.
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    role: "text",
    tier: "mid",
    default: true,
    batchInputUsdPerMTok: 1.5,
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    role: "text",
    tier: "cheap",
    fast: true,
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
    role: "text",
    tier: "top",
    recommended: true,
    batchInputUsdPerMTok: 2.5,
    manifest: { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
  },
];
