/**
 * wp-admin reads of the recommendations (2026-10-06, specs/open-providers.md):
 * Claude is recommended for text, Gemini for images, and providers list in
 * the order Claude, OpenAI, Gemini everywhere. The real catalog runs.
 */
import { describe, expect, it } from "vitest";

import {
  orderTextProviders,
  providerRecommendationLabel,
  recommendedTier,
} from "../aiGuidance";

describe("providerRecommendationLabel", () => {
  it("labels Claude for text, Gemini for images, and OpenAI not at all", () => {
    expect(providerRecommendationLabel("anthropic")).toBe("Recommended for text");
    expect(providerRecommendationLabel("gemini")).toBe("Recommended for images");
    expect(providerRecommendationLabel("openai")).toBeNull();
  });
});

describe("recommendedTier", () => {
  it("is the recommended tier per capability, or undefined where we recommend no model", () => {
    expect(recommendedTier("anthropic", "text")).toBe("mid");
    expect(recommendedTier("openai", "text")).toBe("mid");
    expect(recommendedTier("gemini", "text")).toBeUndefined();
    expect(recommendedTier("gemini", "image")).toBe("mid");
    expect(recommendedTier("openai", "image")).toBe("mid");
    expect(recommendedTier("anthropic", "image")).toBeUndefined();
  });
});

describe("orderTextProviders", () => {
  it("orders Claude, OpenAI, Gemini whatever the catalog order", () => {
    expect(orderTextProviders(["openai", "gemini", "anthropic"])).toEqual(["anthropic", "openai", "gemini"]);
  });
});
