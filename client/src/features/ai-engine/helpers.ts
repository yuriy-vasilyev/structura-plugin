import { AvailableModel } from "./types";

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

/**
 * Returns true when the plan generates images. Anonymous installs (`none`)
 * do not: a plan feature, unchanged when every provider opened to every
 * plan (2026-10-06).
 */
export const planHasImageGeneration = (plan: string): boolean => plan !== "none";
