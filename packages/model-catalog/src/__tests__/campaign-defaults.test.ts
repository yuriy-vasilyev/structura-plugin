import { describe, it, expect } from "vitest";
import {
  buildCampaignDefaults,
  clampCampaignForPlan,
  CONTENT_BLOCKS,
  DEFAULT_CAMPAIGN_CRON,
  OPT_IN_SEO_RULES,
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
  // Owner decision 2026-11-25 (specs/byok-ai-guidance.md §2.2): no plan
  // picks a model or a tier, and the cloud runs the provider's Standard model
  // whatever a campaign stores, so a new campaign stores neither.
  it("carries no model and no tier on any plan, whatever the site's defaults hold", () => {
    const siteAiDefaults = {
      textProvider: "openai",
      textModel: "gpt-6-astra",
      imageProvider: "openai",
      imageModel: "retired-image-id",
    };
    for (const s of [seed(), seed({ allowedProviders: null })]) {
      const d = buildCampaignDefaults(siteAiDefaults, s);
      expect(d).toMatchObject({ textProvider: "openai", imageProvider: "openai" });
      for (const field of ["textModel", "imageModel", "textTier", "imageTier"]) {
        expect(d).not.toHaveProperty(field);
      }
    }
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
    expect(d.seoRules).toEqual(SEO_RULES.filter((rule) => rule !== "references_list"));
    expect(d.enabledBlocks).toEqual(CONTENT_BLOCKS.filter((b) => b !== "core/code"));
    expect(d.cronSchedule).toBe(DEFAULT_CAMPAIGN_CRON);
    expect(d.bodyImages).toBe(true);
    expect(d.featuredImage).toBe(true);
  });

  it("offers the references list as a toggle and leaves it off (specs/study-lookup.md §12.3)", () => {
    expect(SEO_RULES).toContain("references_list");
    expect(OPT_IN_SEO_RULES).toEqual(["references_list"]);
    // Every plan and seed: no default switches it on.
    for (const s of [seed(), seed({ allowedProviders: null })]) {
      expect(buildCampaignDefaults(null, s).seoRules).not.toContain("references_list");
    }
    // The seven rules that were on before it are on, in the same order.
    expect(buildCampaignDefaults(null, seed()).seoRules).toEqual([
      "include_faq_section",
      "include_action_steps",
      "include_statistics",
      "internal_link_optimization",
      "outbound_link_authority",
      "eeat_signals",
      "entity_coverage",
    ]);
  });
});

describe("clampCampaignForPlan", () => {
  const form = { name: "x", pregenerationEnabled: true, textProvider: "anthropic" as const };

  it("turns pre-generation off on Free and on for managed plans, and leaves BYOK as sent", () => {
    expect(clampCampaignForPlan(form, "free").pregenerationEnabled).toBe(false);
    expect(clampCampaignForPlan({ ...form, pregenerationEnabled: false }, "cloud").pregenerationEnabled).toBe(true);
    expect(clampCampaignForPlan({ ...form, pregenerationEnabled: false }, "byok")).toEqual({ ...form, pregenerationEnabled: false });
  });

  // Since 2026-11-25 no client sends a model, so the clamp adds none (it
  // wrote empty `textModel` and `imageModel` on managed plans before).
  it("adds no model field on any plan", () => {
    for (const plan of ["free", "byok", "cloud", null]) {
      const out = clampCampaignForPlan(form, plan);
      expect(out).not.toHaveProperty("textModel");
      expect(out).not.toHaveProperty("imageModel");
    }
  });
});
