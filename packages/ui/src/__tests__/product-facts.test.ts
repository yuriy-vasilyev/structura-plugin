import { describe, expect, it } from "vitest";
import { OWN_KEY_PROVIDERS, productFactTokens, providerList } from "../product-facts";

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
