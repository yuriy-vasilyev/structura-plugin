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

/**
 * One catalog entry — the single record every other structure derives from.
 *
 * Flags are independent booleans rather than a single `tier` enum because the
 * real product choices don't collapse to a linear rank: Anthropic's role
 * default (Sonnet) is a *different* model from its recommended top (Opus), and
 * Gemini deliberately *recommends the cheaper* image model (Flash Image) over
 * the pricier one (Pro Image). See the derivation rules on `MODEL_CATALOG`.
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
   * layer (`getRegistryModelId`). Additive to the legacy `default`/`recommended`
   * /`fast` flags below, which still drive the served `MODEL_CATALOG` shape
   * unchanged during the slice-1→slice-2 transition.
   */
  tier?: ModelTier;
  /**
   * Role default — feeds `MODEL_CATALOG.defaults[role]` and `getDefaultModel`.
   * Exactly one text model and (per image-capable provider) one image model
   * carries this. The `fast` model is the default for the synthetic "fast"
   * role.
   */
  default?: boolean;
  /**
   * The provider's quality-top text (or recommended image) model — what the
   * BYOK picker tags "Recommended" and what `getRecommendedModel` returns.
   */
  recommended?: boolean;
  /**
   * Fast / cheap variant. Hidden from the BYOK picker (fast models
   * underperform on long-form content) and used as `defaults.fast` for
   * internal quick-task callers.
   */
  fast?: boolean;
  /** Optional UI warning, e.g. "Requires org verification". */
  warning?: string;
  /**
   * Post-Batch-discount input price in USD per million tokens — the value the
   * batch cost estimator sums for burn-rate circuit breaking. Present only for
   * models we actually submit through the batch pipeline; absent for models
   * whose cost is metered elsewhere (all image models) or not yet wired.
   */
  batchInputUsdPerMTok?: number;
  /** Runtime routing + capability metadata. */
  manifest: ModelManifest;
}

/** `PlanId` re-exported for the plan-defaults helpers. */
export type { PlanId as CatalogPlanId };
