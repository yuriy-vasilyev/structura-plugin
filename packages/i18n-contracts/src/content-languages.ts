/**
 * Canonical list of CONTENT languages Structura can generate posts in — the
 * single source of truth for the campaign **Language** dropdown AND the
 * headless delivery `?language=` filter (whose codes are exactly these, since
 * a post's stored language is normalized to its primary subtag).
 *
 * Distinct from {@link SUPPORTED_LOCALES}, which is the product UI locale set
 * (en/de/es/fr). Add a language here once and it appears in the campaign
 * dropdown and the Delivery API parameter docs together.
 *
 * Display names are looked up per surface via i18n
 * (`campaignFlow.languages.<code>`); this module owns only the codes plus an
 * English fallback name for non-localized contexts (API docs, logs).
 */
export const SUPPORTED_CONTENT_LANGUAGES = ["en", "de", "es", "fr", "it", "pt", "nl"] as const;

export type SupportedContentLanguage = (typeof SUPPORTED_CONTENT_LANGUAGES)[number];

/**
 * What the campaign **Language** dropdown offers: every supported content
 * language plus regional writing variants (Austrian / Swiss Standard German).
 *
 * A variant stores verbatim on the campaign (`de_AT`) and changes only how
 * the text is written — vocabulary, orthography, conventions. For delivery
 * feeds and the `?language=` filter it normalizes to its primary subtag
 * (`de`), so the delivery axis stays {@link SUPPORTED_CONTENT_LANGUAGES}.
 *
 * WP-style underscore codes on purpose: the plugin SPA already stores
 * `de_AT` / `de_CH` from its WordPress locale list
 * (`client/src/data/languages.ts`), so both surfaces share one value space.
 */
export const CONTENT_LANGUAGE_OPTIONS = [
  "en",
  "de",
  "de_AT",
  "de_CH",
  "es",
  "fr",
  "it",
  "pt",
  "nl",
] as const;

export type ContentLanguageOption = (typeof CONTENT_LANGUAGE_OPTIONS)[number];

/** English display name per code — for non-i18n contexts (API docs, logs). */
export const CONTENT_LANGUAGE_NAMES: Record<SupportedContentLanguage, string> = {
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
};

export function isSupportedContentLanguage(value: unknown): value is SupportedContentLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_CONTENT_LANGUAGES as readonly string[]).includes(value)
  );
}
