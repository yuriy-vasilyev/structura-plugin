import type { AIProvider, PlanId } from "@structura/types";

/**
 * Provider + plan identifiers are re-exported from `@structura/types` so the
 * catalog is the single import site for everything model-related. These are
 * TYPE-ONLY re-exports on purpose: the mirror copied into `functions/`
 * (see `pnpm sync:model-catalog`) rewrites the `@structura/types` specifier to
 * functions' local `../types`, and keeping these erasable means the mirror
 * pulls in no runtime dependency on the types package.
 */
export type { AIProvider, PlanId };

/**
 * What a model produces. `text`/`image` drive the product picker + generation;
 * `tts` (text-to-speech, video voiceover) is registry-only — never surfaced in
 * the served catalog or the product picker.
 */
export type ModelRole = "text" | "image" | "tts";

/**
 * Quality/cost rank within a `(provider, role)`. Slice 1 (spec
 * §model-tier-selection §7): `cheap` currently points at the same model as the
 * utility tasks use today (real cheaper ids land via the slice-5 sync script).
 * Not every `(provider, role)` has every tier — image has no `cheap`, and a
 * provider without a distinct cheap model falls back to `mid`.
 */
export type ModelTier = "top" | "mid" | "cheap";

/**
 * Runtime routing + capability metadata for one model, surfaced verbatim on
 * `MODEL_CATALOG[provider].manifest[id]`. Fields are optional because they
 * differ by family — chat/messages/text models carry only `family`/`endpoint`
 * (Anthropic adds `max_output_tokens`); image models carry size/ratio/quality
 * hints. The shape mirrors what the plugin + SPA already read, so it must not
 * change field names without a coordinated client release.
 */
export interface ModelManifest {
  family: string;
  endpoint: string;
  /** Anthropic messages models. */
  max_output_tokens?: number;
  /** OpenAI image models — aspect-ratio → pixel dimension. */
  sizes?: Record<string, string>;
  /** OpenAI image models — selectable quality levels. */
  qualities?: string[];
  /** OpenAI image models — quality used when the caller doesn't specify. */
  default_quality?: string;
  /** Gemini image models — supported aspect ratios. */
  ratios?: string[];
}

/** USD per million tokens at one context-length band. Undefined = not published. */
export interface TokenRates {
  inputUsdPerMTok?: number;
  /** Output, including thinking/reasoning tokens (all three providers bill them as output). */
  outputUsdPerMTok?: number;
  batchInputUsdPerMTok?: number;
  batchOutputUsdPerMTok?: number;
}

/**
 * List prices for one text model as the provider's pricing page showed them on
 * `pricedAt`. A field the page did not show stays undefined rather than
 * guessed. Registry-only: never served on the wire catalog.
 */
export interface ModelPricing extends TokenRates {
  /** ISO date the prices were read from the provider's page. */
  pricedAt: string;
  /**
   * Higher rates the provider charges when a request's input exceeds
   * `aboveInputTokens` (Gemini 3.1 Pro above 200k, GPT-6 long context).
   * `aboveInputTokens` undefined = the page did not state the threshold, so
   * the rates cannot be applied.
   */
  longContext?: TokenRates & { aboveInputTokens?: number };
  /** Pricing caveat shown on the page (introductory rate, promotion). */
  note?: string;
}

/** A provider's announced deprecation or retirement for one model. */
export interface ModelDeprecation {
  /** ISO date the provider shuts the model down, when it gave one. */
  retiresOn?: string;
  note: string;
}

/**
 * One catalog entry — the single record every other structure derives from.
 *
 * `tier` ranks a model within its `(provider, role)`; the independent flags
 * below mark the role default and internal role bindings. What the product
 * recommends to customers lives in `RECOMMENDATIONS`, not here
 * (specs/byok-ai-guidance.md §3).
 */
export interface CatalogModel {
  /** Exact provider API id used in requests. */
  id: string;
  /** Marketing / display name shown in pickers and on marketing pages. */
  name: string;
  provider: AIProvider;
  role: ModelRole;
  /**
   * Quality/cost rank within `(provider, role)` — read by the registry binding
   * layer (`getRegistryModelId`).
   */
  tier?: ModelTier;
  /**
   * Role default — feeds `MODEL_CATALOG.defaults.text|image` and
   * `getDefaultModel`. Exactly one listed text model (the Standard tier since
   * 2026-10-01) and, per image-capable provider, one image model carry this.
   */
  default?: boolean;
  /**
   * Fast / cheap variant. Hidden from the BYOK picker (fast models
   * underperform on long-form content). The served `defaults.fast` comes
   * from the frozen `resolveFastModelId`, not from this flag.
   */
  fast?: boolean;
  /** Optional UI warning, e.g. "Requires org verification". */
  warning?: string;
  /**
   * Post-Batch-discount input price in USD per million tokens — the value the
   * batch cost estimator sums for burn-rate circuit breaking. Present only for
   * models we actually submit through the batch pipeline; absent for models
   * whose cost is metered elsewhere (all image models) or not yet wired.
   * Must equal `pricing.batchInputUsdPerMTok` where both exist (tested); kept
   * as its own field because the estimator's coverage is a separate decision
   * from what the provider charges.
   */
  batchInputUsdPerMTok?: number;
  /**
   * Output token budget for one text generation (`max_tokens` /
   * `maxOutputTokens` / `max_completion_tokens`). Thinking tokens count
   * against it on reasoning models. Absent = `TEXT_OUTPUT_BUDGET`. Set only
   * where the model's own maximum is lower. Registry-only: not served on the
   * wire catalog (the served `manifest.max_output_tokens` is a separate,
   * legacy plugin field).
   */
  maxOutputTokens?: number;
  /**
   * True when the model accepts only its default temperature and answers
   * 400 to any explicit value (gpt-5-nano, 2026-10-01; Anthropic Opus 4.7 and
   * later, per Anthropic's docs). Callers then omit the parameter.
   * Registry-only.
   */
  fixedTemperature?: boolean;
  /**
   * True when the model accepts its provider's low reasoning setting
   * (Gemini `thinkingConfig.thinkingLevel: LOW`, Anthropic
   * `output_config.effort: "low"`, OpenAI `reasoning_effort: "low"`). Set
   * only where a real call confirmed it (2026-10-01: Gemini 3.8 Flash takes
   * LOW and answers 400 to MINIMAL; Opus 5.5 takes low). A caller asking
   * for low effort on any other model sends nothing. Registry-only.
   */
  lowEffort?: true;
  /**
   * Grounding-audit role this model fills, read only by
   * `resolveGroundingAuditModel` (at most one model per role, tested).
   * `premium` audits Cloud Pro, `standard` every other audited tier. An
   * internal binding: it may point at an `unlisted` model without making it
   * customer-visible. Registry-only.
   */
  auditor?: "premium" | "standard";
  /**
   * Managed-lineup writer role this model fills, read only by
   * `resolveManagedWriterLineup` (at most one model per role, tested).
   * `primary` writes every Cloud and Cloud Pro post; `failover` takes over
   * live synthesis when the primary fails transiently or times out. Same
   * pattern as `auditor`: an internal binding that may point at an
   * `unlisted` model without making it customer-visible. Registry-only.
   * Spec: specs/managed-ai-lineup.md §2.
   */
  managedWriter?: "primary" | "failover";
  /** List prices (registry-only). See {@link ModelPricing}. */
  pricing?: ModelPricing;
  /** Provider deprecation / retirement notice (registry-only). */
  deprecation?: ModelDeprecation;
  /**
   * Known to the registry (prices, capabilities) but NOT offered: left out of
   * the served `MODEL_CATALOG` (plugin pickers, defaults, manifest) and never
   * tiered, so no plan or picker can reach it. Only explicit ids select it:
   * the eval harness (to test a model before binding it), a role flag
   * (`auditor`, `managedWriter`) and the frozen bindings that pin a
   * superseded model (2026-10-01 catalog refresh).
   */
  unlisted?: true;
  /**
   * Set on an `unlisted` text model that used to hold this BYOK tier and was
   * replaced by a newer model (2026-10-01 refresh). A campaign, schedule or
   * request that stores only this concrete id runs the tier's current model
   * (`resolveSupersededTextModelId`), and pickers open on this tier
   * (`tierForModelId`). The id itself stays callable for the frozen bindings.
   * Spec: specs/byok-ai-guidance.md §2.
   */
  supersededTier?: Exclude<ModelTier, "cheap">;
  /** Runtime routing + capability metadata. */
  manifest: ModelManifest;
}

/** `PlanId` re-exported for the plan-defaults helpers. */
export type { PlanId as CatalogPlanId };
