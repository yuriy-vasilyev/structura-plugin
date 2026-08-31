import type { AIProvider } from "@structura/types";
import type { CatalogModel, ModelManifest, ModelRole, ModelTier } from "./types";
import { MODELS } from "./model-data";

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

function toEntry(m: CatalogModel): CatalogModelEntry {
  const entry: CatalogModelEntry = { id: m.id, name: m.name };
  if (m.default) entry.default = true;
  if (m.recommended) entry.recommended = true;
  if (m.fast) entry.fast = true;
  if (m.warning !== undefined) entry.warning = m.warning;
  return entry;
}

function buildProvider(provider: AIProvider): ProviderCatalog {
  // Only text + image models are served to plugin pickers — `tts` is
  // registry-only, so it never leaks into defaults / arrays / manifest and the
  // wire contract stays byte-identical.
  const models = MODELS.filter(
    (m) => m.provider === provider && (m.role === "text" || m.role === "image"),
  );
  const text = models.filter((m) => m.role === "text");
  const image = models.filter((m) => m.role === "image");

  const manifest: Record<string, ModelManifest> = {};
  for (const m of models) manifest[m.id] = m.manifest;

  return {
    // Empty-string image default for image-less providers (Anthropic) matches
    // the historical hand-authored catalog.
    defaults: {
      text: text.find((m) => m.default)?.id ?? "",
      fast: text.find((m) => m.fast)?.id ?? "",
      image: image.find((m) => m.default)?.id ?? "",
    },
    text: text.map(toEntry),
    image: image.map(toEntry),
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
 * Single source of truth for default model ids per provider and role. Used by
 * the cloud engine for tier model resolution.
 */
export function getDefaultModel(
  provider: AIProvider,
  role: "text" | "fast" | "image",
): string {
  return MODEL_CATALOG[provider].defaults[role];
}

/**
 * The provider's quality-top text model — what BYOK suggestion calls route to
 * and what the SPA tags with a "Recommended" pill. Returns the entry flagged
 * `recommended`, falling back to the catalog default when none is marked.
 *
 * Why separate from {@link getDefaultModel}: for Anthropic, `default` lands on
 * Sonnet (mid) so existing BYOK saves keep working, while `recommended` is Opus
 * (top) — the model we want driving suggestions. For OpenAI and Gemini the two
 * point at the same entry.
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
 * campaign is never displayed (or silently re-saved) as Top.
 */
export function tierForModelId(
  provider: AIProvider,
  role: ModelRole,
  modelId: string | null | undefined,
): ModelTier | undefined {
  if (!modelId) return undefined;
  return MODELS.find(
    (m) => m.provider === provider && m.role === role && m.id === modelId,
  )?.tier;
}

/**
 * The provider's text-to-speech model id (video voiceover), or `undefined` if
 * the provider has none. Single source for the ids that `channels/video/tts.ts`
 * previously hard-coded as local constants.
 */
export function resolveTtsModelId(provider: AIProvider): string | undefined {
  return MODELS.find((m) => m.provider === provider && m.role === "tts")?.id;
}
