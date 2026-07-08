/**
 * Build a clickable URL on docs.structurawp.com for a given page slug.
 *
 * Why this helper exists
 * ----------------------
 * The docs site routes every page through
 * `docs/app/[lang]/[[...mdxPath]]/page.tsx` — there is no un-prefixed
 * catch-all. `nextra/locales` middleware redirects bare URLs into
 * `/{detected-locale}/...` based on `Accept-Language`. `next.config.mjs`
 * advertises four locales (`en/de/es/fr`), but `docs/content/` only
 * ships `en/` for now (specs/docs-site-rewrite.md §8 — i18n phase 1 is
 * English-only). So a German visitor clicking a bare
 * `https://docs.structurawp.com/foo` lands on `/de/foo` → 404.
 *
 * Until the de/es/fr translations land we pin every outbound link to
 * `/en/`. Phase-2 unfreeze: derive `DOCS_LOCALE` from the wp-admin
 * locale via `@wordpress/i18n` `getLocaleData()` (or whatever the
 * SPA settles on for current-locale). Every call site already passes
 * a locale-agnostic slug, so the change is one line here.
 */
export const DOCS_BASE = "https://docs.structurawp.com";

const DOCS_LOCALE = "en";

export function docsUrl(slug = ""): string {
  const path = slug.replace(/^\/+/, "");
  return path
    ? `${DOCS_BASE}/${DOCS_LOCALE}/${path}`
    : `${DOCS_BASE}/${DOCS_LOCALE}`;
}
