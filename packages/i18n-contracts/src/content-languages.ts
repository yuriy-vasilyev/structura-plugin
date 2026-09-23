/**
 * Canonical list of CONTENT languages Structura can generate posts in WITH
 * full search-data support (DataForSEO keyword + domain data) — the single
 * source of truth for the campaign **Language** dropdown's "Supported" group
 * AND the headless delivery `?language=` filter (whose codes are exactly
 * these, since a post's stored language is normalized to its primary subtag).
 *
 * Distinct from {@link SUPPORTED_LOCALES}, which is the product UI locale set
 * (en/de/es/fr). Add a language here once and it appears in the campaign
 * dropdown and the Delivery API parameter docs together — and the DataForSEO
 * location map in `functions/src/seo-intel/providers/dataforseo.ts` must gain
 * its market code in the same PR (the type forces it).
 *
 * Grew from 7 to 20 on 2026-09-22 (spec `campaign-language-and-smart-setup.md`
 * §3.3): every entry was checked live against DataForSEO Labs'
 * `locations_and_languages` and returns keyword data for its home market.
 * Writing was never the limit — the generator accepts any language code —
 * only the search data and the market mapping were.
 */
export const SUPPORTED_CONTENT_LANGUAGES = [
  "en",
  "de",
  "es",
  "fr",
  "it",
  "pt",
  "nl",
  "pl",
  "sv",
  "da",
  "nb",
  "fi",
  "cs",
  "hu",
  "ro",
  "el",
  "uk",
  "tr",
  "ja",
  "ko",
] as const;

export type SupportedContentLanguage = (typeof SUPPORTED_CONTENT_LANGUAGES)[number];

/**
 * What the campaign **Language** dropdown's "Supported" group offers: every
 * supported content language plus regional writing variants.
 *
 * A variant stores verbatim on the campaign (`de_AT`) and changes how the
 * text is written — vocabulary, orthography, conventions — and which market
 * the search data is pulled for (Austria, not Germany). For delivery feeds
 * and the `?language=` filter it normalizes to its primary subtag (`de`), so
 * the delivery axis stays {@link SUPPORTED_CONTENT_LANGUAGES}.
 *
 * German is deliberately three entries (Germany / Austria / Switzerland):
 * DACH readers clock the wrong variant instantly, and each is its own Google
 * market. English, Portuguese and Spanish each carry their largest
 * second market for the same reason.
 *
 * WP-style underscore codes on purpose: the plugin SPA stores WordPress
 * locale codes, so both surfaces share one value space.
 */
export const CONTENT_LANGUAGE_OPTIONS = [
  "en",
  "en_GB",
  "de",
  "de_AT",
  "de_CH",
  "es",
  "es_MX",
  "fr",
  "it",
  "pt",
  "pt_BR",
  "nl",
  "pl",
  "sv",
  "da",
  "nb",
  "fi",
  "cs",
  "hu",
  "ro",
  "el",
  "uk",
  "tr",
  "ja",
  "ko",
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
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  nb: "Norwegian",
  fi: "Finnish",
  cs: "Czech",
  hu: "Hungarian",
  ro: "Romanian",
  el: "Greek",
  uk: "Ukrainian",
  tr: "Turkish",
  ja: "Japanese",
  ko: "Korean",
};

export function isSupportedContentLanguage(value: unknown): value is SupportedContentLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_CONTENT_LANGUAGES as readonly string[]).includes(value)
  );
}

export function isContentLanguageOption(value: unknown): value is ContentLanguageOption {
  return (
    typeof value === "string" &&
    (CONTENT_LANGUAGE_OPTIONS as readonly string[]).includes(value)
  );
}

/** Regional variants the picker keeps distinct, keyed by `language-region`. */
const REGIONAL_OPTIONS: Record<string, ContentLanguageOption> = {
  "en-gb": "en_GB",
  "de-at": "de_AT",
  "de-ch": "de_CH",
  "es-mx": "es_MX",
  "pt-br": "pt_BR",
};

/**
 * Normalise a site or WordPress locale to the campaign picker's value space,
 * or `null` when the language has no supported entry.
 *
 * Accepts BCP-47 (`de-AT`, `en-US`), WP underscore form (`de_AT`,
 * `de_CH_informal`) and bare codes (`de`). A region that the picker keeps as
 * its own variant is preserved (`de-AT` → `de_AT`, `pt-BR` → `pt_BR`); every
 * other region collapses to the bare language (`en-US` → `en`, `fr-CA` → `fr`).
 *
 * @remarks
 * Exists so a campaign can default to its SITE's language: the activation
 * carries `siteIdentity.language` in BCP-47 from `get_bloginfo('language')`,
 * while the campaign field and the picker use WP-style codes. Before this
 * helper every surface seeded `"en"` regardless of the site (2026-09-22).
 */
export function toContentLanguageOption(
  raw: string | null | undefined,
): ContentLanguageOption | null {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().toLowerCase().replace(/_/g, "-").split("-").filter(Boolean);
  if (parts.length === 0 || parts[0] === "default") return null;
  const [lang, region] = parts;
  const regional = region ? REGIONAL_OPTIONS[`${lang}-${region}`] : undefined;
  if (regional) return regional;
  return isSupportedContentLanguage(lang) ? lang : null;
}

/**
 * Whether a campaign language gets search data (`"full"`) or only AI
 * research (`"ai_only"`). Any code — a picker option, a `WP_LOCALE_CATALOG`
 * entry, or a raw WP locale — resolves; the answer depends only on whether
 * its base language is in {@link SUPPORTED_CONTENT_LANGUAGES}.
 *
 * `"ai_only"` still writes and publishes normally: discovery takes the
 * LLM-only path and the UI shows an honest note. It is also the demand
 * signal the cloud records (spec §3.4).
 */
export type ContentLanguageSupport = "full" | "ai_only";

export function resolveLanguageSupport(raw: string | null | undefined): ContentLanguageSupport {
  return toContentLanguageOption(raw) ? "full" : "ai_only";
}

/**
 * Human label for a content language in the viewer's UI locale, via
 * `Intl.DisplayNames` ("German (Austria)" / "Deutsch (Österreich)"), so the
 * picker never needs a hand-maintained name table per UI locale. Falls back
 * to the English name and finally the code when Intl cannot resolve it.
 */
export function contentLanguageLabel(code: string, uiLocale = "en"): string {
  const tag = code.replace(/_/g, "-");
  const base = tag.split("-")[0].toLowerCase();
  try {
    const names = new Intl.DisplayNames([uiLocale, "en"], { type: "language", languageDisplay: "standard" });
    // Intl echoes unknown subtags back ("xx (YY)"), so probe the base language
    // first: a real language resolves to a name, an unknown one to itself.
    const baseName = names.of(base);
    if (baseName && baseName.toLowerCase() !== base) {
      const name = names.of(tag);
      if (name) return name;
    }
  } catch {
    /* fall through */
  }
  return isSupportedContentLanguage(base) ? CONTENT_LANGUAGE_NAMES[base] : code;
}

export interface WpLocaleOption {
  /** WordPress locale code as stored by WP core (`pl_PL`, `de_DE_formal`). */
  value: string;
  /** Native-script display name, as WP's own language dropdown shows it. */
  label: string;
}

/**
 * The full WordPress locale catalogue — the "Other…" second level of the
 * campaign Language picker on both surfaces. Copied from WP core's language
 * list (it was `client/src/data/languages.ts` until 2026-09-22); the plugin's
 * stored campaign languages have always been drawn from it, so keeping the
 * exact values preserves every existing campaign doc.
 *
 * Labels are native-script on purpose (a Polish speaker looks for "Polski"),
 * unlike the Supported group which renders in the UI locale.
 */
export const WP_LOCALE_CATALOG: readonly WpLocaleOption[] = [
  { value: "en_US", label: "English (United States)" },
  { value: "af", label: "Afrikaans" },
  { value: "am", label: "አማርኛ" },
  { value: "arg", label: "Aragonés" },
  { value: "ar", label: "العربية" },
  { value: "ary", label: "العربية المغربية" },
  { value: "as", label: "অসমীয়া" },
  { value: "azb", label: "گؤنئی آذربایجان" },
  { value: "az", label: "Azərbaycan dili" },
  { value: "bel", label: "Беларуская мова" },
  { value: "bg_BG", label: "Български" },
  { value: "bn_BD", label: "বাংলা" },
  { value: "bo", label: "བོད་ཡིག" },
  { value: "bs_BA", label: "Bosanski" },
  { value: "ca", label: "Català" },
  { value: "ceb", label: "Cebuano" },
  { value: "cs_CZ", label: "Čeština" },
  { value: "cy", label: "Cymraeg" },
  { value: "da_DK", label: "Dansk" },
  { value: "de_AT", label: "Deutsch (Österreich)" },
  { value: "de_DE", label: "Deutsch" },
  { value: "de_DE_formal", label: "Deutsch (Sie)" },
  { value: "de_CH", label: "Deutsch (Schweiz)" },
  { value: "de_CH_informal", label: "Deutsch (Schweiz, Du)" },
  { value: "dsb", label: "Dolnoserbšćina" },
  { value: "dzo", label: "རྫོང་ཁ" },
  { value: "el", label: "Ελληνικά" },
  { value: "en_CA", label: "English (Canada)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "en_ZA", label: "English (South Africa)" },
  { value: "en_AU", label: "English (Australia)" },
  { value: "en_NZ", label: "English (New Zealand)" },
  { value: "eo", label: "Esperanto" },
  { value: "es_MX", label: "Español de México" },
  { value: "es_AR", label: "Español de Argentina" },
  { value: "es_ES", label: "Español" },
  { value: "es_PE", label: "Español de Perú" },
  { value: "es_CR", label: "Español de Costa Rica" },
  { value: "es_VE", label: "Español de Venezuela" },
  { value: "es_EC", label: "Español de Ecuador" },
  { value: "es_DO", label: "Español de República Dominicana" },
  { value: "es_UY", label: "Español de Uruguay" },
  { value: "es_PR", label: "Español de Puerto Rico" },
  { value: "es_GT", label: "Español de Guatemala" },
  { value: "es_CL", label: "Español de Chile" },
  { value: "es_CO", label: "Español de Colombia" },
  { value: "et", label: "Eesti" },
  { value: "eu", label: "Euskara" },
  { value: "fa_IR", label: "فارسی" },
  { value: "fa_AF", label: "(فارسی (افغانستان" },
  { value: "fi", label: "Suomi" },
  { value: "fr_CA", label: "Français du Canada" },
  { value: "fr_BE", label: "Français de Belgique" },
  { value: "fr_FR", label: "Français" },
  { value: "fur", label: "Friulian" },
  { value: "fy", label: "Frysk" },
  { value: "gd", label: "Gàidhlig" },
  { value: "gl_ES", label: "Galego" },
  { value: "gu", label: "ગુજરાતી" },
  { value: "haz", label: "هزاره گی" },
  { value: "he_IL", label: "עִבְרִית" },
  { value: "hi_IN", label: "हिन्दी" },
  { value: "hr", label: "Hrvatski" },
  { value: "hsb", label: "Hornjoserbšćina" },
  { value: "hu_HU", label: "Magyar" },
  { value: "hy", label: "Հայերեն" },
  { value: "id_ID", label: "Bahasa Indonesia" },
  { value: "is_IS", label: "Íslenska" },
  { value: "it_IT", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "jv_ID", label: "Basa Jawa" },
  { value: "ka_GE", label: "ქართული" },
  { value: "kab", label: "Taqbaylit" },
  { value: "kk", label: "Қазақ тілі" },
  { value: "km", label: "ភាសាខ្មែរ" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "ko_KR", label: "한국어" },
  { value: "ckb", label: "كوردی&lrm;" },
  { value: "kir", label: "Кыргызча" },
  { value: "lo", label: "ພາສາລາວ" },
  { value: "lt_LT", label: "Lietuvių kalba" },
  { value: "lv", label: "Latviešu valoda" },
  { value: "mk_MK", label: "Македонски јазик" },
  { value: "ml_IN", label: "മലയാളം" },
  { value: "mn", label: "Монгол" },
  { value: "mr", label: "मराठी" },
  { value: "ms_MY", label: "Bahasa Melayu" },
  { value: "my_MM", label: "ဗမာစာ" },
  { value: "nb_NO", label: "Norsk bokmål" },
  { value: "ne_NP", label: "नेपाली" },
  { value: "nl_BE", label: "Nederlands (België)" },
  { value: "nl_NL_formal", label: "Nederlands (Formeel)" },
  { value: "nl_NL", label: "Nederlands" },
  { value: "nn_NO", label: "Norsk nynorsk" },
  { value: "oci", label: "Occitan" },
  { value: "pa_IN", label: "ਪੰਜਾਬੀ" },
  { value: "pl_PL", label: "Polski" },
  { value: "ps", label: "پښتو" },
  { value: "pt_BR", label: "Português do Brasil" },
  { value: "pt_AO", label: "Português de Angola" },
  { value: "pt_PT", label: "Português" },
  { value: "pt_PT_ao90", label: "Português (AO90)" },
  { value: "rhg", label: "Ruáinga" },
  { value: "ro_RO", label: "Română" },
  { value: "ru_RU", label: "Русский" },
  { value: "sah", label: "Сахалыы" },
  { value: "snd", label: "سنڌي" },
  { value: "si_LK", label: "සිංහල" },
  { value: "sk_SK", label: "Slovenčina" },
  { value: "skr", label: "سرائیکی" },
  { value: "sl_SI", label: "Slovenščina" },
  { value: "sq", label: "Shqip" },
  { value: "sr_RS", label: "Српски језик" },
  { value: "sv_SE", label: "Svenska" },
  { value: "sw", label: "Kiswahili" },
  { value: "szl", label: "Ślōnskŏ gŏdka" },
  { value: "ta_IN", label: "தமிழ்" },
  { value: "ta_LK", label: "தமிழ்" },
  { value: "te", label: "తెలుగు" },
  { value: "th", label: "ไทย" },
  { value: "tl", label: "Tagalog" },
  { value: "tr_TR", label: "Türkçe" },
  { value: "tt_RU", label: "Татар теле" },
  { value: "tah", label: "Reo Tahiti" },
  { value: "ug_CN", label: "ئۇيغۇرچە" },
  { value: "uk", label: "Українська" },
  { value: "ur", label: "اردو" },
  { value: "uz_UZ", label: "O‘zbekcha" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "zh_TW", label: "繁體中文" },
  { value: "zh_HK", label: "香港中文" },
  { value: "zh_CN", label: "简体中文" },
];

/**
 * Catalogue entries that are NOT already covered by the Supported group, for
 * the "Other…" list. A catalogue code whose base language is supported
 * (`de_DE_formal`, `fr_CA`) is deliberately excluded: the user picks it from
 * the Supported group and gets full search data.
 */
export function otherWpLocales(): readonly WpLocaleOption[] {
  return WP_LOCALE_CATALOG.filter((entry) => resolveLanguageSupport(entry.value) === "ai_only");
}
