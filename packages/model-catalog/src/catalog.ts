import type { AIProvider } from "@structura/types";
import type { CatalogModel, ModelManifest, ModelRole, ModelTier } from "./types";
import { MODELS } from "./model-data";
import { FROZEN_FAST_TEXT_MODELS, FROZEN_RECOMMENDED_IMAGE_MODELS } from "./frozen";
import { RECOMMENDATIONS } from "./recommendations";

/**
 * One entry as served on `MODEL_CATALOG[provider].text/image`. Flags appear
 * ONLY when true (never `default: false`), matching the shape the plugin + SPA
 * already parse — the `__tests__` deep-equal guards this against drift.
 */
export interface CatalogModelEntry {
  id: string;
  name: string;
  default?: true;
  recommended?: true;
  fast?: true;
  warning?: string;
}

/** The per-provider block of the served catalog. */
export interface ProviderCatalog {
  defaults: { text: string; fast: string; image: string };
  text: CatalogModelEntry[];
  image: CatalogModelEntry[];
  manifest: Record<string, ModelManifest>;
}

export type ModelCatalog = Record<AIProvider, ProviderCatalog>;

/** Fixed provider order — preserved into the served object for stable output. */
const PROVIDER_ORDER: readonly AIProvider[] = ["openai", "gemini", "anthropic"];

function toEntry(m: CatalogModel, recommendedId: string | undefined): CatalogModelEntry {
  const entry: CatalogModelEntry = { id: m.id, name: m.name };
  if (m.default) entry.default = true;
  if (m.id === recommendedId) entry.recommended = true;
  if (m.fast) entry.fast = true;
  if (m.warning !== undefined) entry.warning = m.warning;
  return entry;
}

function buildProvider(provider: AIProvider): ProviderCatalog {
  // Only text + image models are served to plugin pickers — `tts` is
  // registry-only, so it never leaks into defaults / arrays / manifest and the
  // wire contract stays byte-identical.
  // `unlisted` entries (known, not offered) stay out the same way.
  const models = MODELS.filter(
    (m) => m.provider === provider && (m.role === "text" || m.role === "image") && !m.unlisted,
  );
  const text = models.filter((m) => m.role === "text");
  const image = models.filter((m) => m.role === "image");

  const manifest: Record<string, ModelManifest> = {};
  for (const m of models) manifest[m.id] = m.manifest;

  // Text `recommended` is derived from RECOMMENDATIONS since 2026-10-01:
  // the recommended tier's model for Anthropic and OpenAI, nothing for
  // Gemini (specs/byok-ai-guidance.md §2, §3). Image `recommended` stays
  // the frozen legacy value so old clients preselect the same image model.
  const textTier = RECOMMENDATIONS.text.model[provider];
  const recommendedText = textTier ? text.find((m) => m.tier === textTier)?.id : undefined;
  const recommendedImage = FROZEN_RECOMMENDED_IMAGE_MODELS[provider];

  return {
    // Empty-string image default for image-less providers (Anthropic) matches
    // the historical hand-authored catalog.
    defaults: {
      text: text.find((m) => m.default)?.id ?? "",
      // Frozen at the pre-refresh fast models (frozen.ts): the superseded
      // OpenAI and Gemini ones are unlisted now, so no listed entry carries
      // their `fast` flag.
      fast: FROZEN_FAST_TEXT_MODELS[provider],
      image: image.find((m) => m.default)?.id ?? "",
    },
    text: text.map((m) => toEntry(m, recommendedText)),
    image: image.map((m) => toEntry(m, recommendedImage)),
    manifest,
  };
}

/**
 * Curated model catalog served to every plugin installation via the
 * `getAvailableModels` HTTP endpoint (which lives in `functions/`, wrapping
 * this object). Updating {@link MODELS} takes effect for all users on the
 * endpoint's next cache cycle — no plugin release required.
 */
export const MODEL_CATALOG: ModelCatalog = Object.fromEntries(
  PROVIDER_ORDER.map((p) => [p, buildProvider(p)] as const),
) as ModelCatalog;

/**
 * The served default model id per provider and role: `text` is the Standard
 * tier (the BYOK post default), `fast` the frozen fast model, `image` the
 * image role default. Prefer the named bindings in `bindings.ts`, which say
 * what a caller means.
 */
export function getDefaultModel(
  provider: AIProvider,
  role: "text" | "fast" | "image",
): string {
  return MODEL_CATALOG[provider].defaults[role];
}

/**
 * The served `recommended` text entry (derived from `RECOMMENDATIONS`), else
 * the provider's default. No cloud caller reads it since 2026-10-01:
 * suggestions resolve through the frozen `resolveSuggestionModelId`.
 */
export function getRecommendedModel(provider: AIProvider, role: "text"): string {
  const recommended = MODEL_CATALOG[provider][role].find((m) => m.recommended);
  return recommended?.id ?? getDefaultModel(provider, role);
}

/**
 * Image provider subset — Claude has no image generation, so this narrows the
 * type to keep Anthropic from ever being wired for image synthesis.
 */
export type ImageProvider = Extract<AIProvider, "openai" | "gemini">;

/**
 * True when `modelId` is a registered image model for `provider`. Used by the
 * image resolver to validate per-regen model overrides from managed-tier
 * callers. `requireMidOnly` narrows the check to mid-tier (`default`) entries —
 * the Cloud-tier UI gate that lets Cloud users swap among mid models but not
 * elevate to top.
 */
export function isKnownImageModelForProvider(
  provider: ImageProvider,
  modelId: string,
  requireMidOnly = false,
): boolean {
  const entry = MODEL_CATALOG[provider].image.find((m) => m.id === modelId);
  if (!entry) return false;
  if (requireMidOnly) return entry.default === true;
  return true;
}

/**
 * Registry accessor for the binding layer: the concrete model id for a
 * `(provider, role, tier)`, or `undefined` when that provider carries no model
 * at that tier (e.g. Gemini has no distinct `cheap` yet — callers fall back to
 * `mid`). Spec: `specs/model-tier-selection.md` §2.
 */
export function getRegistryModelId(
  provider: AIProvider,
  role: ModelRole,
  tier: ModelTier,
): string | undefined {
  return getRegistryModel(provider, role, tier)?.id;
}

/**
 * The full registry entry (id + display name + metadata) for a
 * `(provider, role, tier)`, or `undefined` if none exists. The tier picker UI
 * uses this to label options with the model name — `Top (Gemini 3.1 Pro)`.
 */
export function getRegistryModel(
  provider: AIProvider,
  role: ModelRole,
  tier: ModelTier,
): CatalogModel | undefined {
  return MODELS.find(
    (m) => m.provider === provider && m.role === role && m.tier === tier,
  );
}

/**
 * Reverse lookup: the quality tier a concrete registry model id belongs to,
 * or `undefined` for a retired/unknown id. Legacy campaigns (pre-tier rollout)
 * store only a concrete model — pickers use this to open on the tier that
 * matches the stored model instead of assuming one, so a legacy Standard-model
 * campaign is never displayed (or silently re-saved) as Top. A superseded id
 * answers the tier it held (`supersededTier`), the tier it now runs on.
 */
export function tierForModelId(
  provider: AIProvider,
  role: ModelRole,
  modelId: string | null | undefined,
): ModelTier | undefined {
  if (!modelId) return undefined;
  const m = MODELS.find(
    (x) => x.provider === provider && x.role === role && x.id === modelId,
  );
  return m?.tier ?? m?.supersededTier;
}

/**
 * The provider's text-to-speech model id (video voiceover), or `undefined` if
 * the provider has none. Single source for the ids that `channels/video/tts.ts`
 * previously hard-coded as local constants.
 */
export function resolveTtsModelId(provider: AIProvider): string | undefined {
  return MODELS.find((m) => m.provider === provider && m.role === "tts")?.id;
}
