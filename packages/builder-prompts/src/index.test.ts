import { SUPPORTED_LOCALES, type SupportedLocale } from "@structura/i18n-contracts";
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

    // 2026-10-21: the copied prompt kept its 72-column breaks in Lovable's chat
    // box, so the clipboard gets each paragraph on one line.
    it.each(PROMPT_PLATFORMS)("unwraps %s to one line per paragraph, same text", (platform) => {
      const wrapped = builderPrompt(platform, locale)!;
      const unwrapped = builderPrompt(platform, locale, { wrap: false })!;
      const paragraphs = unwrapped.split("\n\n");
      expect(paragraphs).toHaveLength(6);
      for (const paragraph of paragraphs) expect(paragraph).not.toContain("\n");
      expect(paragraphs.some((p) => Array.from(p).length > BUILDER_PROMPT_COLUMNS)).toBe(true);
      const normalised = (prompt: string) =>
        prompt.split("\n\n").map((p) => p.replace(/\s+/g, " "));
      expect(normalised(unwrapped)).toEqual(normalised(wrapped));
      expect(builderPrompt(platform, locale, { wrap: true })).toBe(wrapped);
      expect(builderPrompt("custom", locale, { wrap: false })).toBeNull();
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

    it("tells Bolt to build the Supabase function with JWT checks off", () => {
      const bolt = builderPrompt("bolt", locale)!;
      expect(bolt).toContain("structura-articles");
      expect(bolt).toContain("verify_jwt = false");
    });

    // 2026-10-21: Lovable would not create a separate Edge Function on a
    // standard project and built the receiver as a route inside the site.
    it("tells Lovable to build a route inside the site, with the Supabase function as fallback", () => {
      const lovable = builderPrompt("lovable", locale)!;
      expect(lovable).toContain("/api/public/structura-articles");
      // The fallback still names the function, not only the route path.
      expect(lovable.replace("/api/public/structura-articles", "")).toContain("structura-articles");
      expect(lovable).toContain("verify_jwt = false");
      expect(lovable).toContain(SIGNING_SECRET_ENV_VAR);
      expect(lovable).not.toBe(builderPrompt("bolt", locale));
    });

    it("reads the raw body before parsing on v0 and Replit", () => {
      const v0 = builderPrompt("v0", locale)!;
      expect(v0).toContain("app/api/structura/route.ts");
      expect(v0).toContain("request.text()");
      expect(builderPrompt("replit", locale)).toContain("/api/structura");
      expect(builderPrompt("replit", locale)).toContain("JSON");
    });
  });

  // 2026-10-21: Lovable's receiver emitted only the HowTo and FAQPage nodes and
  // dropped the leading BlogPosting.
  it("tells the builder to emit every JSON-LD entry as delivered and add no article node of its own", () => {
    // The storage paragraph (fifth) is shared, so any platform carries it.
    const storage = (locale: SupportedLocale) =>
      builderPrompt("lovable", locale, { wrap: false })!.split("\n\n")[4];
    const en = storage("en");
    expect(en).toMatch(/\bevery\b[^.]*\bpost\.jsonLd\b/i);
    expect(en).toContain("BlogPosting");
    expect(en).toMatch(/\b(do not|don't|never)\b[^.]*\breplace\b/i);
    // A second article node beside ours makes the page report two articles.
    expect(en).toMatch(
      /\b(do not|don't|never)\b[^.;]*\badd\b[^.;]*\bBlogPosting\b[^.;]*\bArticle\b/
    );
    for (const locale of SUPPORTED_LOCALES) {
      expect(storage(locale)).toContain("BlogPosting");
      expect(storage(locale)).toContain("application/ld+json");
      // `Article` is named only as the node type the builder must not add.
      expect(storage(locale)).toMatch(/\bArticle\b/);
    }
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
