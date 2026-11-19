import { describe, it, expect } from "vitest";
import { campaignChangeReplacesPreparedPosts, type PreparedPostsCampaignFields } from "../index";

// The rule the cloud's `onCampaignUpdated` trigger discards prepared posts by
// and the customer portal's campaign edit page warns with before a save
// (specs/stock-preview-and-edit.md §6). The cloud wrapper's own cases stay in
// functions/src/stock/__tests__/triggers.test.ts.

const campaign = (over: Partial<PreparedPostsCampaignFields> = {}): PreparedPostsCampaignFields => ({
  personaId: "p-ida",
  objective: "Teach home baristas to dial in espresso",
  language: "en",
  campaignMode: "authority",
  postLength: 1500,
  enabledBlocks: ["core/paragraph", "core/heading"],
  keywordBank: ["espresso grind size", "espresso channeling"],
  featuredImage: true,
  bodyImages: true,
  ...over,
});

const KEPT = { replaces: false, languageChanged: false };
const REPLACED = { replaces: true, languageChanged: false };

describe("campaignChangeReplacesPreparedPosts", () => {
  it("replaces nothing on create: there is no saved campaign to compare", () => {
    expect(campaignChangeReplacesPreparedPosts(undefined, campaign())).toEqual(KEPT);
    expect(campaignChangeReplacesPreparedPosts(undefined, campaign({ language: "de" }))).toEqual(KEPT);
  });

  it("replaces nothing when no tracked field changed", () => {
    expect(campaignChangeReplacesPreparedPosts(campaign(), campaign())).toEqual(KEPT);
  });

  it.each([
    ["persona", { personaId: "p-bob" }],
    ["persona, from a fixed one to a rotation", { personaId: "random" }],
    ["objective", { objective: "Teach home baristas to steam milk" }],
    ["campaign mode", { campaignMode: "conversion" }],
    ["post length", { postLength: 800 }],
    ["enabled blocks, one swapped", { enabledBlocks: ["core/paragraph", "core/list"] }],
    ["enabled blocks, one added", { enabledBlocks: ["core/paragraph", "core/heading", "core/list"] }],
    ["enabled blocks, same set in another order", { enabledBlocks: ["core/heading", "core/paragraph"] }],
    ["featured image switch, turned off", { featuredImage: false }],
    ["body image switch, turned off", { bodyImages: false }],
  ] as const)("replaces the prepared posts when the %s changes", (_field, change) => {
    expect(campaignChangeReplacesPreparedPosts(campaign(), campaign(change))).toEqual(REPLACED);
  });

  it("a persona id stored as a number is not the same persona as its string", () => {
    expect(campaignChangeReplacesPreparedPosts(campaign({ personaId: 7 }), campaign({ personaId: "7" }))).toEqual(REPLACED);
  });

  it("treats a missing block list as an empty one", () => {
    expect(campaignChangeReplacesPreparedPosts(campaign({ enabledBlocks: undefined }), campaign({ enabledBlocks: [] }))).toEqual(KEPT);
    expect(campaignChangeReplacesPreparedPosts(campaign({ enabledBlocks: null }), campaign({ enabledBlocks: [] }))).toEqual(KEPT);
  });

  // uniconfoto, 2026-11-17: two posts prepared while images were off went out
  // without images after the customer switched them back on. Such a post
  // carries no image concept, so nothing can be rendered for it later.
  it("replaces the prepared posts when images are switched back on", () => {
    const off = campaign({ featuredImage: false, bodyImages: false });
    expect(campaignChangeReplacesPreparedPosts(off, campaign())).toEqual(REPLACED);
    expect(campaignChangeReplacesPreparedPosts(off, campaign({ bodyImages: false }))).toEqual(REPLACED);
    expect(campaignChangeReplacesPreparedPosts(off, campaign({ featuredImage: false }))).toEqual(REPLACED);
  });

  it("treats a missing image switch as off", () => {
    const off = campaign({ featuredImage: false, bodyImages: false });
    expect(campaignChangeReplacesPreparedPosts(campaign({ featuredImage: undefined, bodyImages: null }), off)).toEqual(KEPT);
    expect(campaignChangeReplacesPreparedPosts(off, campaign({ featuredImage: undefined, bodyImages: undefined }))).toEqual(KEPT);
  });

  it("reports a language change, which replaces even the posts the customer edited", () => {
    expect(campaignChangeReplacesPreparedPosts(campaign(), campaign({ language: "de" }))).toEqual({
      replaces: true,
      languageChanged: true,
    });
    // With other changes in the same save the language still decides.
    expect(
      campaignChangeReplacesPreparedPosts(campaign(), campaign({ language: "de", objective: "Neu", personaId: "p-bob" })),
    ).toEqual({ replaces: true, languageChanged: true });
  });

  it("a regional variant is another language", () => {
    expect(campaignChangeReplacesPreparedPosts(campaign({ language: "de" }), campaign({ language: "de_AT" }))).toEqual({
      replaces: true,
      languageChanged: true,
    });
  });

  describe("the keyword bank compares as a set of keyword texts", () => {
    it("a reorder replaces nothing", () => {
      expect(
        campaignChangeReplacesPreparedPosts(
          campaign({ keywordBank: ["a", "b", "c"] }),
          campaign({ keywordBank: ["c", "a", "b"] }),
        ),
      ).toEqual(KEPT);
    });

    it("an added or a removed keyword replaces the prepared posts", () => {
      const before = campaign({ keywordBank: ["a", "b"] });
      expect(campaignChangeReplacesPreparedPosts(before, campaign({ keywordBank: ["a", "b", "c"] }))).toEqual(REPLACED);
      expect(campaignChangeReplacesPreparedPosts(before, campaign({ keywordBank: ["a"] }))).toEqual(REPLACED);
      expect(campaignChangeReplacesPreparedPosts(before, campaign({ keywordBank: ["a", "z"] }))).toEqual(REPLACED);
    });

    it("an empty bank against a missing one replaces nothing", () => {
      expect(campaignChangeReplacesPreparedPosts(campaign({ keywordBank: undefined }), campaign({ keywordBank: [] }))).toEqual(KEPT);
      expect(campaignChangeReplacesPreparedPosts(campaign({ keywordBank: null }), campaign({ keywordBank: [] }))).toEqual(KEPT);
    });

    // Older campaigns store strings, newer ones `{ keyword, source,
    // usageCount }` objects, and the portal form holds strings: the same bank
    // in either shape is the same bank.
    it("a string entry and an object entry with the same keyword are the same keyword", () => {
      expect(
        campaignChangeReplacesPreparedPosts(
          campaign({ keywordBank: ["a", "b"] }),
          campaign({ keywordBank: [{ keyword: "b", source: "manual", usageCount: 0 }, "a"] }),
        ),
      ).toEqual(KEPT);
      expect(
        campaignChangeReplacesPreparedPosts(
          campaign({ keywordBank: [{ keyword: "a", source: "discovery", usageCount: 4 }] }),
          campaign({ keywordBank: ["a"] }),
        ),
      ).toEqual(KEPT);
    });

    // 2026-06-17 regression: comparing the objects themselves (by reference,
    // or with their `usageCount`) staled freshly seeded stock on the campaign
    // write the seed path itself makes.
    it("usageCount churn and fresh object references replace nothing", () => {
      const bank = () => [
        { keyword: "a", source: "manual", usageCount: 0 },
        { keyword: "b", source: "manual", usageCount: 2 },
      ];
      const churned = bank().map((k) => ({ ...k, usageCount: k.usageCount + 1 }));
      expect(campaignChangeReplacesPreparedPosts(campaign({ keywordBank: bank() }), campaign({ keywordBank: churned }))).toEqual(KEPT);
      expect(campaignChangeReplacesPreparedPosts(campaign({ keywordBank: bank() }), campaign({ keywordBank: bank() }))).toEqual(KEPT);
    });

    it("an object entry whose keyword text changed replaces the prepared posts", () => {
      expect(
        campaignChangeReplacesPreparedPosts(
          campaign({ keywordBank: [{ keyword: "a", source: "manual", usageCount: 0 }] }),
          campaign({ keywordBank: [{ keyword: "b", source: "manual", usageCount: 0 }] }),
        ),
      ).toEqual(REPLACED);
    });
  });

  it("ignores every field it does not track", () => {
    const before = { ...campaign(), name: "Old", cronSchedule: "0 9 * * 1", textProvider: "gemini" };
    const after = { ...campaign(), name: "New", cronSchedule: "0 9 * * 2,4", textProvider: "anthropic" };
    expect(campaignChangeReplacesPreparedPosts(before, after)).toEqual(KEPT);
  });
});
