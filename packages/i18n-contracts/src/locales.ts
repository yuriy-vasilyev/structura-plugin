/**
 * Canonical list of locales supported by the product.
 * Keep in sync with `web/src/i18n/locales/` directory names and email
 * templates under `functions/src/i18n/locales/`.
 */
export const SUPPORTED_LOCALES = ["en", "de", "es", "fr"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}
