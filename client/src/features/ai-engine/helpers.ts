import { AvailableModel } from "./types";

/**
 * Resolves the model a campaign should default to for a provider +
 * capability when the form holds an empty model field.
 *
 * Priority:
 *   1. The workspace's per-provider model — the one the user picked in
 *      the AI Engine setup wizard (required there before save). This is
 *      what the AI Engine page displays as "the provider's model" and
 *      what the onboarding wizard already seeds new campaigns with
 *      (`WizardStep2AiEngine` → `useFinishWizard`), so campaign
 *      backfill must agree or the two creation paths drift.
 *   2. The catalog's recommended default for the provider.
 *   3. `""` — neither source has hydrated; callers leave the field
 *      empty and the cloud's server-side fallback (engine.ts /
 *      image-resolver.ts) covers the run.
 *
 * Every surface that auto-fills an empty campaign model field must go
 * through this helper — the form-provider backfill in CampaignContext
 * and ProviderToggle's mount effect both do. Two surfaces resolving
 * different models for the same empty field is how a user ends up
 * running a model they never saw.
 */
export const resolveDefaultModel = ({
  provider,
  capability,
  providerSettings,
  catalogDefaults,
}: {
  provider: string;
  capability: "text" | "image";
  /** `settings.ai.providers` — per-provider connection status + chosen models. */
  providerSettings?: {
    [providerId: string]: { text_model?: string; image_model?: string };
  };
  /** `availableModels.defaults` — catalog-recommended models per provider. */
  catalogDefaults?: {
    [providerId: string]: { text?: string; image?: string };
  };
}): string => {
  const configured =
    capability === "text"
      ? providerSettings?.[provider]?.text_model
      : providerSettings?.[provider]?.image_model;
  return configured || catalogDefaults?.[provider]?.[capability] || "";
};

/**
 * Returns the warning string for a model, if any.
 * Reads the `warning` field from the model catalog data
 * rather than hardcoding per-model strings.
 */
export const maybeGetModelWarning = ({
  model,
  models,
}: {
  model: string;
  models?: AvailableModel[];
}): string | null => {
  if (!models) return null;
  const entry = models.find((m) => m.id === model);
  return entry?.warning ?? null;
};
