/**
 * Fixed on-screen strings, all four product locales — port of `VT.STR`
 * from the design handoff. Layouts are sized against German (longest).
 *
 * Composite locales ("en_GB", "de_AT", "es-419") normalize to their
 * base language, same rule as the functions-side resolveSupportedLocale.
 */

export const SUPPORTED = ["en", "de", "es", "fr"] as const;
export type VideoLocale = (typeof SUPPORTED)[number];

const STR = {
  fullGuide: {
    en: "Full guide",
    de: "Ganze Anleitung",
    es: "Guía completa",
    fr: "Guide complet",
  },
  linkDesc: {
    en: "Link in description",
    de: "Link in der Beschreibung",
    es: "Enlace en la descripción",
    fr: "Lien en description",
  },
  step: { en: "Step", de: "Schritt", es: "Paso", fr: "Étape" },
  of: { en: "of", de: "von", es: "de", fr: "sur" },
} satisfies Record<string, Record<VideoLocale, string>>;

export type StringKey = keyof typeof STR;

export const resolveVideoLocale = (locale: string | undefined): VideoLocale => {
  const base = (locale ?? "en").toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED as readonly string[]).includes(base)
    ? (base as VideoLocale)
    : "en";
};

/** Localized fixed string; unknown locales fall back to English. */
export const str = (key: StringKey, locale: string | undefined): string =>
  STR[key][resolveVideoLocale(locale)];
