/**
 * wp-admin reads of the recommendations (2026-10-06, specs/open-providers.md):
 * Claude is recommended for text, Gemini for images, and providers list in
 * the order Claude, OpenAI, Gemini everywhere. The real catalog runs.
 */
import { describe, expect, it } from "vitest";

import { orderTextProviders, providerRecommendationLabel } from "../aiGuidance";

describe("providerRecommendationLabel", () => {
  it("labels Claude for text, Gemini for images, and OpenAI not at all", () => {
    expect(providerRecommendationLabel("anthropic")).toBe("Recommended for text");
    expect(providerRecommendationLabel("gemini")).toBe("Recommended for images");
    expect(providerRecommendationLabel("openai")).toBeNull();
  });
});

describe("orderTextProviders", () => {
  it("orders Claude, OpenAI, Gemini whatever the catalog order", () => {
    expect(orderTextProviders(["openai", "gemini", "anthropic"])).toEqual(["anthropic", "openai", "gemini"]);
  });
});
