/**
 * Site default models with the provider wizard's "Use recommended model"
 * switch (2026-10-06, specs/open-providers.md). A provider that stores a
 * tier resolves it through the bundled catalog, so the site default
 * follows the catalog when that tier's model moves; a provider that stores
 * only a model id keeps it. The real catalog runs, nothing is mocked.
 */
import { describe, expect, it } from "vitest";
import { getRegistryModelId } from "@structura/model-catalog";

import {
  planHasImageGeneration,
  resolveDefaultModel,
  resolveDefaultTier,
  usesRecommendedModel,
} from "../helpers";

const catalogDefaults = { openai: { text: "catalog-text", image: "catalog-image" } };

describe("resolveDefaultModel with a stored tier", () => {
  it("a stored tier wins over the stored model id", () => {
    const providerSettings = {
      openai: { text_model: "gpt-stale-id", text_tier: "mid" as const, image_model: "x", image_tier: "top" as const },
    };
    expect(resolveDefaultModel({ provider: "openai", capability: "text", providerSettings, catalogDefaults })).toBe(
      getRegistryModelId("openai", "text", "mid"),
    );
    expect(resolveDefaultModel({ provider: "openai", capability: "image", providerSettings, catalogDefaults })).toBe(
      getRegistryModelId("openai", "image", "top"),
    );
  });

  it("an empty tier keeps the model the site picked", () => {
    const providerSettings = { openai: { text_model: "gpt-6-astra", text_tier: "" } };
    expect(resolveDefaultModel({ provider: "openai", capability: "text", providerSettings, catalogDefaults })).toBe(
      "gpt-6-astra",
    );
  });

  it("no setting at all falls back to the catalog default", () => {
    expect(resolveDefaultModel({ provider: "openai", capability: "text", providerSettings: {}, catalogDefaults })).toBe(
      "catalog-text",
    );
  });
});

describe("resolveDefaultTier", () => {
  it("is the stored tier, else the tier of the stored model, else undefined", () => {
    expect(resolveDefaultTier({ provider: "anthropic", capability: "text", providerSettings: { anthropic: { text_tier: "top" } } })).toBe("top");
    const mid = getRegistryModelId("anthropic", "text", "mid");
    expect(resolveDefaultTier({ provider: "anthropic", capability: "text", providerSettings: { anthropic: { text_model: mid } } })).toBe("mid");
    expect(resolveDefaultTier({ provider: "anthropic", capability: "text", providerSettings: { anthropic: { text_model: "gpt-4o" } } })).toBeUndefined();
    expect(resolveDefaultTier({ provider: "anthropic", capability: "text", providerSettings: undefined })).toBeUndefined();
  });
});

// Opening every provider to every plan (2026-10-06) did not open image
// generation: anonymous installs still have none, as a plan feature.
describe("planHasImageGeneration", () => {
  it("is false on anonymous (`none`) and true on every other plan", () => {
    expect(planHasImageGeneration("none")).toBe(false);
    for (const plan of ["free", "byok", "cloud", "cloud_pro"]) expect(planHasImageGeneration(plan)).toBe(true);
  });
});

describe("usesRecommendedModel (the switch's state, Generate a Post 2026-10-06)", () => {
  it("is on for a stored tier, for no stored model, and for the recommended model", () => {
    expect(usesRecommendedModel("openai", "text", "top", "anything")).toBe(true);
    expect(usesRecommendedModel("openai", "text", "", "")).toBe(true);
    expect(usesRecommendedModel("anthropic", "text", "", getRegistryModelId("anthropic", "text", "mid"))).toBe(true);
    expect(usesRecommendedModel("gemini", "image", undefined, getRegistryModelId("gemini", "image", "mid"))).toBe(true);
  });

  it("is off for another model stored without a tier", () => {
    expect(usesRecommendedModel("anthropic", "text", "", getRegistryModelId("anthropic", "text", "top"))).toBe(false);
    expect(usesRecommendedModel("openai", "image", undefined, "gpt-image-retired")).toBe(false);
  });
});
