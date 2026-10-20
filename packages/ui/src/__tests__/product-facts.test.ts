import { describe, expect, it } from "vitest";
import {
  OWN_KEY_PROVIDERS,
  cloudOptionTokens,
  productFactTokens,
  providerList,
} from "../product-facts";

/**
 * Provider lists are interpolated into de/es/fr copy, which rendered an
 * English "or" ("OpenAI or Gemini") until 2026-10-03. Since 2026-10-06 every
 * own-key plan (no account, Free, BYOK) takes the same three providers
 * (specs/open-providers.md), so there is one list.
 */
describe("providerList", () => {
  const cases = {
    en: "OpenAI, Gemini or Claude",
    de: "OpenAI, Gemini oder Claude",
    es: "OpenAI, Gemini o Claude",
    fr: "OpenAI, Gemini ou Claude",
  } as const;

  for (const [locale, list] of Object.entries(cases)) {
    it(`[${locale}] joins the providers in the locale and feeds the token`, () => {
      expect(providerList(locale)).toBe(list);
      expect(productFactTokens(locale).byokProviders).toBe(list);
    });
  }

  it("normalises composite locales and falls back to English", () => {
    expect(providerList("de_AT")).toBe("OpenAI, Gemini oder Claude");
    expect(providerList("es-419")).toBe("OpenAI, Gemini o Claude");
    expect(providerList("it")).toBe("OpenAI, Gemini or Claude");
  });

  it("keeps the English constant and the default token in English", () => {
    expect(OWN_KEY_PROVIDERS).toBe(cases.en);
    expect(productFactTokens().byokProviders).toBe(OWN_KEY_PROVIDERS);
  });

  it("no longer serves per-plan provider tokens (the split ended 2026-10-06)", () => {
    const tokens = productFactTokens();
    expect(tokens).not.toHaveProperty("freeProviders");
    expect(tokens).not.toHaveProperty("pluginOnlyProviders");
  });
});

/**
 * Cloud volume options (2026-10-12, specs/cloud-volume-pricing.md): Cloud Pro
 * is the 100-post option of Cloud, and option facts come from each app's
 * generated catalog, not from constants here.
 */
describe("cloudOptionTokens", () => {
  const OPTIONS = [
    { maxPosts: 100, maxImages: 150, videoMonthlyCap: 40 },
    { maxPosts: 30, maxImages: 90, videoMonthlyCap: 10 },
  ];

  it("lists the options smallest first, joined in the locale", () => {
    expect(cloudOptionTokens(OPTIONS)).toMatchObject({
      cloudPostOptions: "30 or 100",
      cloudImageOptions: "90 or 150",
      cloudVideoOptions: "10 or 40",
    });
    expect(cloudOptionTokens(OPTIONS, "de").cloudPostOptions).toBe("30 oder 100");
    expect(cloudOptionTokens(OPTIONS, "es_ES").cloudImageOptions).toBe("90 o 150");
    expect(cloudOptionTokens(OPTIONS, "fr").cloudVideoOptions).toBe("10 ou 40");
  });

  it("keys per-option facts by the option's posts number", () => {
    expect(cloudOptionTokens(OPTIONS)).toMatchObject({
      cloudOption30Posts: "30",
      cloudOption30Images: "90",
      cloudOption30Videos: "10",
      cloudOption100Posts: "100",
      cloudOption100Images: "150",
      cloudOption100Videos: "40",
    });
  });

  it("follows a newly listed option without a code change", () => {
    const tokens = cloudOptionTokens([
      ...OPTIONS,
      { maxPosts: 300, maxImages: 400, videoMonthlyCap: 80 },
    ]);
    expect(tokens.cloudPostOptions).toBe("30, 100 or 300");
    expect(tokens.cloudOption300Images).toBe("400");
  });

  it("serves no Cloud Pro plan name or quota tokens any more", () => {
    const tokens = productFactTokens();
    for (const key of [
      "planCloudPro",
      "postQuotaCloud",
      "postQuotaCloudPro",
      "imageQuotaCloud",
      "imageQuotaCloudPro",
    ]) {
      expect(tokens).not.toHaveProperty(key);
    }
    expect(tokens.planCloud).toBe("Cloud");
  });
});
