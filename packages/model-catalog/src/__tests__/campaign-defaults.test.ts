import { describe, it, expect } from "vitest";
import {
  buildCampaignDefaults,
  getRegistryModelId,
  resolveRecommendedTextModel,
  CONTENT_BLOCKS,
  DEFAULT_CAMPAIGN_CRON,
  SEO_RULES,
  type AIProvider,
  type CampaignDefaultsSeed,
} from "../index";

const ALL: readonly AIProvider[] = ["openai", "gemini", "anthropic"];
// Narrow allowlists exercise the filter. Since 2026-10-06 every plan allows
// every provider (specs/open-providers.md), so no plan sends these today.
const OPENAI_GEMINI: readonly AIProvider[] = ["openai", "gemini"];
const OPENAI_ONLY: readonly AIProvider[] = ["openai"];

const seed = (over: Partial<CampaignDefaultsSeed> = {}): CampaignDefaultsSeed => ({
  allowedProviders: ALL,
  language: "en",
  postLength: 1200,
  seedsModels: true,
  ...over,
});

/** The text and image providers the defaults picked. */
const picked = (...args: Parameters<typeof buildCampaignDefaults>) => {
  const d = buildCampaignDefaults(...args);
  return [d.textProvider, d.imageProvider];
};

describe("buildCampaignDefaults provider pick order", () => {
  it("1. takes the site's preference when it is allowed and connected", () => {
    expect(
      picked(
        { textProvider: "openai", imageProvider: "openai" },
        seed({ connectedProviders: ["gemini", "openai"] })
      )
    ).toEqual(["openai", "openai"]);
  });

  it("2. else the best connected provider the plan allows, each capability in its recommendation order", () => {
    // The preference has no credential. Text takes Anthropic, the best of the
    // connected ones (specs/byok-ai-guidance.md §3, 2026-10-02); images take
    // Gemini before OpenAI (2026-10-06, specs/open-providers.md).
    expect(
      picked(
        { textProvider: "openai", imageProvider: "openai" },
        seed({ connectedProviders: ["gemini", "anthropic"] })
      )
    ).toEqual(["anthropic", "gemini"]);
    expect(picked(null, seed({ connectedProviders: ["gemini", "openai"] }))).toEqual([
      "openai",
      "gemini",
    ]);
    expect(picked(null, seed({ connectedProviders: ["openai", "gemini"] }))).toEqual([
      "openai",
      "gemini",
    ]);
    // A connected provider outside the plan is skipped, not picked.
    expect(
      picked(null, seed({ allowedProviders: OPENAI_GEMINI, connectedProviders: ["anthropic", "openai"] }))
    ).toEqual(["openai", "openai"]);
  });

  it("3. else the site's preference when the plan allows it, connected or not", () => {
    // Nothing connected is in the allowlist, so the allowed preference wins.
    expect(
      picked(
        { textProvider: "openai", imageProvider: "openai" },
        seed({ allowedProviders: OPENAI_GEMINI, connectedProviders: ["anthropic"] })
      )
    ).toEqual(["openai", "openai"]);
  });

  it("4. else Gemini when the plan allows it, else the plan's first provider", () => {
    expect(picked(null, seed())).toEqual(["gemini", "gemini"]);
    expect(
      picked(
        { textProvider: "anthropic", imageProvider: "anthropic" },
        seed({ allowedProviders: OPENAI_GEMINI })
      )
    ).toEqual(["gemini", "gemini"]);
    expect(picked(null, seed({ allowedProviders: OPENAI_ONLY }))).toEqual(["openai", "openai"]);
  });

  it("never seeds Anthropic as the image provider (text-only)", () => {
    expect(
      picked(
        { textProvider: "anthropic", imageProvider: "anthropic" },
        seed({ connectedProviders: ["anthropic", "openai"] })
      )
    ).toEqual(["anthropic", "openai"]);
    expect(
      picked(
        { textProvider: "anthropic", imageProvider: "anthropic" },
        seed({ connectedProviders: ["anthropic"] })
      )
    ).toEqual(["anthropic", "gemini"]);
  });

  it("null allowedProviders skips tier filtering; an absent or empty connected list skips the credential filter", () => {
    expect(picked({ textProvider: "anthropic", imageProvider: "openai" }, seed())).toEqual([
      "anthropic",
      "openai",
    ]);
    expect(
      picked(
        { textProvider: "anthropic", imageProvider: "openai" },
        seed({ allowedProviders: null })
      )
    ).toEqual(["anthropic", "openai"]);
    expect(
      picked({ textProvider: "openai", imageProvider: "openai" }, seed({ connectedProviders: [] }))
    ).toEqual(["openai", "openai"]);
  });
});

describe("buildCampaignDefaults values", () => {
  it("derives the models from the registry's mid tier, never from the site's stored models", () => {
    // The activation's `aiDefaults` carries stale model ids alongside the providers.
    const siteAiDefaults = {
      textProvider: "openai",
      textModel: "retired-text-id",
      imageProvider: "openai",
      imageModel: "retired-image-id",
    };
    const d = buildCampaignDefaults(siteAiDefaults, seed());
    expect(d.textTier).toBe("mid");
    expect(d.imageTier).toBe("mid");
    expect(d.textModel).toBe(getRegistryModelId("openai", "text", "mid"));
    expect(d.imageModel).toBe(getRegistryModelId("openai", "image", "mid"));
    expect(d.imageModel).not.toBe(d.textModel);
  });

  it("opens text on the provider's recommended tier and model", () => {
    for (const provider of ["anthropic", "openai", "gemini"] as const) {
      const d = buildCampaignDefaults({ textProvider: provider }, seed());
      expect(d.textTier).toBe(resolveRecommendedTextModel(provider).tier);
      expect(d.textModel).toBe(resolveRecommendedTextModel(provider).model);
    }
  });

  it("seeds no concrete model when the caller's plan owns it (specs/managed-ai-lineup.md §3.2)", () => {
    const d = buildCampaignDefaults(
      { textProvider: "openai", imageProvider: "openai" },
      seed({ seedsModels: false })
    );
    expect(d).toMatchObject({
      textProvider: "openai",
      textTier: "mid",
      textModel: "",
      imageProvider: "openai",
      imageTier: "mid",
      imageModel: "",
    });
  });

  it("takes the post length from the caller", () => {
    expect(buildCampaignDefaults(null, seed()).postLength).toBe(1200);
    expect(buildCampaignDefaults(null, seed({ postLength: 1500 })).postLength).toBe(1500);
  });

  it("passes the caller's language through untouched", () => {
    expect(buildCampaignDefaults(null, seed({ language: "fa_IR" })).language).toBe("fa_IR");
  });

  it("uses the shared constants and leaves core/code off", () => {
    const d = buildCampaignDefaults(null, seed());
    expect(d.seoRules).toEqual([...SEO_RULES]);
    expect(d.enabledBlocks).toEqual(CONTENT_BLOCKS.filter((b) => b !== "core/code"));
    expect(d.cronSchedule).toBe(DEFAULT_CAMPAIGN_CRON);
    expect(d.bodyImages).toBe(true);
    expect(d.featuredImage).toBe(true);
  });
});
