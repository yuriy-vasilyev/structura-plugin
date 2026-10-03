import { describe, expect, it } from "vitest";
import {
  BYOK_PROVIDERS,
  FREE_PROVIDERS,
  PLUGIN_ONLY_PROVIDERS,
  productFactTokens,
  providerList,
} from "../product-facts";

/**
 * Provider lists are interpolated into de/es/fr copy, which rendered an
 * English "or" ("OpenAI or Gemini") until 2026-10-03.
 */
describe("providerList", () => {
  const cases = {
    en: ["OpenAI", "OpenAI or Gemini", "OpenAI, Gemini, or Anthropic"],
    de: ["OpenAI", "OpenAI oder Gemini", "OpenAI, Gemini oder Anthropic"],
    es: ["OpenAI", "OpenAI o Gemini", "OpenAI, Gemini o Anthropic"],
    fr: ["OpenAI", "OpenAI ou Gemini", "OpenAI, Gemini ou Anthropic"],
  } as const;

  for (const [locale, [pluginOnly, free, byok]] of Object.entries(cases)) {
    it(`[${locale}] joins each plan's providers in the locale`, () => {
      expect(providerList(locale, "pluginOnly")).toBe(pluginOnly);
      expect(providerList(locale, "free")).toBe(free);
      expect(providerList(locale, "byok")).toBe(byok);
    });

    it(`[${locale}] feeds the provider tokens`, () => {
      const tokens = productFactTokens(locale);
      expect([tokens.pluginOnlyProviders, tokens.freeProviders, tokens.byokProviders]).toEqual([
        pluginOnly,
        free,
        byok,
      ]);
    });
  }

  it("normalises composite locales and falls back to English", () => {
    expect(providerList("de_AT", "free")).toBe("OpenAI oder Gemini");
    expect(providerList("es-419", "byok")).toBe("OpenAI, Gemini o Anthropic");
    expect(providerList("it", "free")).toBe("OpenAI or Gemini");
  });

  it("keeps the English constants and the default tokens in English", () => {
    expect([PLUGIN_ONLY_PROVIDERS, FREE_PROVIDERS, BYOK_PROVIDERS]).toEqual(cases.en);
    expect(productFactTokens().freeProviders).toBe(FREE_PROVIDERS);
  });
});
