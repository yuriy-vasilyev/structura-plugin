import { SUPPORTED_LOCALES } from "@structura/i18n-contracts";
import { describe, expect, it } from "vitest";

import {
  ARTICLE_DELIVERY_CONTRACT_URL,
  BUILDER_PLATFORMS,
  BUILDER_PROMPT_COLUMNS,
  SIGNING_SECRET_ENV_VAR,
  builderPrompt,
} from "./index";

const PROMPT_PLATFORMS = BUILDER_PLATFORMS.filter((p) => p !== "custom");

describe("builderPrompt", () => {
  it("covers Lovable, Bolt, v0 and Replit, and has no prompt for Custom", () => {
    expect(PROMPT_PLATFORMS).toEqual(["lovable", "bolt", "v0", "replit"]);
    for (const locale of SUPPORTED_LOCALES) expect(builderPrompt("custom", locale)).toBeNull();
  });

  describe.each(SUPPORTED_LOCALES)("%s", (locale) => {
    it.each(PROMPT_PLATFORMS)("wraps %s at 72 columns without breaking words", (platform) => {
      const prompt = builderPrompt(platform, locale)!;
      for (const line of prompt.split("\n")) {
        expect(Array.from(line).length).toBeLessThanOrEqual(BUILDER_PROMPT_COLUMNS);
        expect(line).toBe(line.trim());
      }
      // Six paragraphs: opening, contract, receiver, verification, storage, ending.
      expect(prompt.split("\n\n")).toHaveLength(6);
    });

    it.each(PROMPT_PLATFORMS)(
      "names the signing secret and links the contract for %s",
      (platform) => {
        const prompt = builderPrompt(platform, locale)!;
        expect(prompt).toContain(SIGNING_SECRET_ENV_VAR);
        expect(prompt).not.toContain("STRUCTURA_WEBHOOK_SECRET");
        // The link must survive wrapping on one line so it stays clickable.
        expect(
          prompt.split("\n").some((line) => line.endsWith(ARTICLE_DELIVERY_CONTRACT_URL))
        ).toBe(true);
        expect(prompt).toContain("X-Structura-Signature");
        expect(prompt).toContain("event_id");
      }
    );

    it("tells Lovable and Bolt to build the same Supabase function with JWT checks off", () => {
      const lovable = builderPrompt("lovable", locale)!;
      expect(builderPrompt("bolt", locale)).toBe(lovable);
      expect(lovable).toContain("structura-articles");
      expect(lovable).toContain("verify_jwt = false");
    });

    it("reads the raw body before parsing on v0 and Replit", () => {
      const v0 = builderPrompt("v0", locale)!;
      expect(v0).toContain("app/api/structura/route.ts");
      expect(v0).toContain("request.text()");
      expect(builderPrompt("replit", locale)).toContain("/api/structura");
      expect(builderPrompt("replit", locale)).toContain("JSON");
    });
  });

  it("is written in each locale, not English copies", () => {
    const prompts = SUPPORTED_LOCALES.map((locale) => builderPrompt("v0", locale));
    expect(new Set(prompts).size).toBe(SUPPORTED_LOCALES.length);
  });

  it("points at a contract page that exists in the docs", () => {
    expect(ARTICLE_DELIVERY_CONTRACT_URL).toBe(
      "https://docs.structurawp.com/en/reference/article-delivery"
    );
  });
});
