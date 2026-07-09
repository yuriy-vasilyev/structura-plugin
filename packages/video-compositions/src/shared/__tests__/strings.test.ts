import { describe, expect, it } from "vitest";
import { resolveVideoLocale, str } from "../strings";

describe("video locale strings", () => {
  it("resolves composite locales to their base language", () => {
    expect(resolveVideoLocale("de_AT")).toBe("de");
    expect(resolveVideoLocale("en-GB")).toBe("en");
    expect(resolveVideoLocale("es-419")).toBe("es");
  });

  it("falls back to English for unknown/absent locales", () => {
    expect(resolveVideoLocale("pt_BR")).toBe("en");
    expect(resolveVideoLocale(undefined)).toBe("en");
  });

  it("returns the localized string for all four locales", () => {
    expect(str("linkDesc", "en")).toBe("Link in description");
    expect(str("linkDesc", "de")).toBe("Link in der Beschreibung");
    expect(str("linkDesc", "es")).toBe("Enlace en la descripción");
    expect(str("linkDesc", "fr")).toBe("Lien en description");
  });
});
