<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Single source of truth for "the public website Structura is writing for."
 *
 * The plugin historically reached for `get_home_url()`, `get_bloginfo()`,
 * `get_permalink()`, and `get_site_icon_url()` directly in ~10 places —
 * an implicit assumption that the WordPress install IS the public website
 * readers visit. That assumption breaks on headless deployments
 * (`cms.structurawp.com`, `cms.formulafoundry.io`, `cms.xerx.io`) where
 * the front end lives on a separate Next.js / Astro origin and the WP
 * install is purely an authoring backend.
 *
 * `Public_Site_Profile` collapses every "what's the public face?" question
 * into one read model. In non-headless mode (`isHeadless: false`) it's a
 * thin view over the WP getters — every accessor returns what the legacy
 * code path returned, so customer-side behaviour is unchanged. In
 * headless mode it reads the operator-supplied overrides (publicUrl,
 * keyPages, permalinkStrategy, …) and the rest of the plugin gets the
 * right answers without knowing about the toggle.
 *
 * Storage
 * -------
 * One JSON-encoded option, `structura_public_site_profile`. Single key
 * keeps writes atomic and avoids the per-field option-name explosion
 * that would otherwise ship six new `update_option_*` watchers into
 * `Site_Identity_Sync`.
 *
 * Constant seeding
 * ----------------
 * `STRUCTURA_MARKETING_SITE_URL` (the per-deployment PHP constant we ship
 * on Structura's own headless installs) seeds the option on first plugin
 * load if the option is missing — see `seed_from_constant_if_missing()`.
 * Once the option exists, it wins; the constant becomes a no-op so
 * operators can override from the UI without touching `wp-config.php`.
 *
 * The constant + legacy `structura_marketing_site_url` option remain
 * readable for one minor version per AGENTS.md §10. Marked `@deprecated`
 * in `Context_Builder`; will be removed in 2.0.
 *
 * Lifecycle
 * ---------
 * Pure read model. Construct via `Public_Site_Profile::load()` once per
 * request and pass the instance around — every accessor is O(1) on the
 * instance, so there's no benefit to caching across requests, and the
 * fresh read keeps the snapshot consistent with the most recent option
 * write within the same request.
 *
 * Spec: `specs/site-identity-headless.md`.
 */
final class Public_Site_Profile
{
    /**
     * Option name. Public so callers (Site_Identity_Sync, integration
     * tests) can subscribe to `update_option_{name}` without
     * recapitulating the literal.
     */
    public const OPTION_NAME = 'structura_public_site_profile';

    /**
     * `Public_Site_Profile::OPTION_NAME` is the active config; this is the
     * legacy single-purpose option that
     * `Context_Builder::public_permalink_for_post` historically read. Kept
     * readable for back-compat through 1.x; removed in 2.0.
     *
     * @deprecated 1.x — use {@see OPTION_NAME}.
     */
    public const LEGACY_MARKETING_OPTION = 'structura_marketing_site_url';

    /**
     * Allowed `permalinkStrategy` values. Centralised so cloud-side
     * `normaliseSiteIdentity` (functions/src/licenses/index.ts) and this
     * class read from the same source of truth.
     */
    public const STRATEGY_INHERIT     = 'inherit';
    public const STRATEGY_PREFIX_SWAP = 'prefixSwap';
    public const STRATEGY_TEMPLATE    = 'template';

    /**
     * Description max length. Mirrors `SITE_IDENTITY_DESCRIPTION_MAX_LEN`
     * cloud-side — keep both ends of the wire in lockstep.
     */
    public const DESCRIPTION_MAX_LEN = 600;

    /** Cap on `keyPages` array length. Mirrors cloud-side. */
    public const KEY_PAGES_MAX = 8;

    /** Site title — equivalent to `get_bloginfo('name')` today. */
    public string $name;

    /** Tagline — `get_bloginfo('description')`. */
    public string $tagline;

    /** BCP-47 language tag — `get_bloginfo('language')`. */
    public string $language;

    /** Resolved logo URL (custom logo, falling back to site icon). */
    public string $logoUrl;

    /**
     * The WP install's own origin (`home_url('/')` normalised, no
     * trailing slash). Always equals the WP origin, regardless of
     * headless mode — used by the cloud-side recent-posts digest fetch
     * (`{homeUrl}/wp-json/wp/v2/posts`).
     */
    public string $homeUrl;

    /**
     * The public website readers visit. Equals `$homeUrl` in
     * non-headless mode; points at the front-end origin in headless mode.
     * Always normalised — no trailing slash.
     *
     * Use this for AI grounding payloads, channel share-cards, and any
     * "the public URL of the post" answer.
     */
    public string $publicUrl;

    /** True when the operator has explicitly enabled headless mode. */
    public bool $isHeadless;

    /** Optional brand description for AI grounding (≤ 600 chars). */
    public string $description;

    /**
     * Curated list of high-value non-blog pages.
     *
     * Each entry is an associative array `['url' => string, 'label' =>
     * string, 'role' => string]`. Empty array means "operator hasn't
     * configured any" — non-headless installs usually leave this empty
     * and rely on `Context_Builder::detect_landing_urls()` walking the
     * WP nav menu instead.
     *
     * @var array<int, array{url: string, label: string, role: string}>
     */
    public array $keyPages;

    /**
     * Permalink strategy. One of {@see STRATEGY_INHERIT},
     * {@see STRATEGY_PREFIX_SWAP}, {@see STRATEGY_TEMPLATE}.
     */
    public string $permalinkStrategy;

    /**
     * Template string used when `$permalinkStrategy === STRATEGY_TEMPLATE`.
     * Tokens: `{slug}`, `{lang}`, `{year}`, `{month}`. Concatenated
     * against `$publicUrl`.
     */
    public string $permalinkTemplate;

    /**
     * Default language token for `prefixSwap` / `template` resolution.
     * Falls back to the BCP-47 prefix of `$language`, then to `'en'`.
     */
    public string $defaultPermalinkLang;

    /**
     * Construct via {@see load()}. Direct instantiation is permitted but
     * intended for tests — production callers should always go through
     * the static factory so the WP-getter snapshot is consistent.
     *
     * @param array<string, mixed> $values
     */
    public function __construct(array $values)
    {
        $this->name                 = (string)($values['name'] ?? '');
        $this->tagline              = (string)($values['tagline'] ?? '');
        $this->language             = (string)($values['language'] ?? '');
        $this->logoUrl              = (string)($values['logoUrl'] ?? '');
        $this->homeUrl              = (string)($values['homeUrl'] ?? '');
        $this->publicUrl            = (string)($values['publicUrl'] ?? $this->homeUrl);
        $this->isHeadless           = (bool)($values['isHeadless'] ?? false);
        $this->description          = (string)($values['description'] ?? '');
        $this->keyPages             = self::sanitize_key_pages($values['keyPages'] ?? []);
        $this->permalinkStrategy    = self::sanitize_strategy($values['permalinkStrategy'] ?? self::STRATEGY_INHERIT);
        $this->permalinkTemplate    = (string)($values['permalinkTemplate'] ?? '');
        $this->defaultPermalinkLang = (string)($values['defaultPermalinkLang'] ?? '');
    }

    /**
     * Load the profile for the current request.
     *
     * Reads {@see OPTION_NAME}, layered on top of WordPress core getters
     * for the brand-surface values that aren't part of the headless
     * override (name, tagline, language, logoUrl, homeUrl). The result
     * is a fully-populated value object — every accessor returns a
     * usable answer in both headless and non-headless mode.
     *
     * Cheap to call repeatedly (no DB writes, two `get_option` reads at
     * worst), but callers that branch on the same profile multiple times
     * within a request should grab one instance at the entry point and
     * pass it down.
     */
    public static function load(): self
    {
        // ── Brand surface, always sourced from WP core ────────────────
        // Even in headless mode we keep the WP-side identity reads as
        // the default — the operator can override on the cloud side
        // (siteIdentity merge), but the plugin sync ships the WP truth.
        $logo_url       = '';
        $custom_logo_id = get_theme_mod('custom_logo');
        if ($custom_logo_id) {
            $logo_url = wp_get_attachment_image_url($custom_logo_id, 'full') ?: '';
        }
        if ($logo_url === '') {
            $logo_url = get_site_icon_url(256) ?: '';
        }

        $home_url = (string)home_url('/');
        $home_url = rtrim($home_url, '/');

        // ── Headless override layer ───────────────────────────────────
        $option = get_option(self::OPTION_NAME, []);
        if ( ! is_array($option)) {
            // A bad write (manual SQL edit, plugin conflict) shouldn't
            // poison every read-path — fall back to defaults.
            $option = [];
        }

        $public_url = isset($option['publicUrl']) ? (string)$option['publicUrl'] : '';
        $public_url = $public_url !== '' ? rtrim($public_url, '/') : $home_url;

        // Permalink strategy resolution:
        //
        //   - `inherit` when the install isn't headless. Post URLs ARE the
        //     WP permalinks; rewriting would be wrong.
        //
        //   - `prefixSwap` (the default) when `isHeadless: true` AND a
        //     `publicUrl` is set. The "Inherit" choice is silently
        //     coerced to `prefixSwap` for headless installs because the
        //     combination is semantically contradictory — the operator
        //     just told us "my public website lives elsewhere," and
        //     emitting the CMS-origin URL anyway sends LinkedIn / X /
        //     IndexNow / webhooks to the wrong host (cms.xerx.io
        //     instead of www.xerx.io). Operators who picked `template`
        //     keep `template`; only `inherit` gets the auto-correct.
        //
        //   - `template` when explicitly picked — preserves the custom-
        //     pattern escape hatch for non-`/blog/{slug}` headless
        //     sites.
        //
        // The SPA settings UI hides the "Inherit" option when the
        // headless toggle is on (2026-05-22) so future saves never
        // create the contradiction in the first place. This reader-
        // side coercion handles installs whose option was saved
        // before that UI change shipped.
        $is_headless    = (bool)($option['isHeadless'] ?? false);
        $stored_strategy = $option['permalinkStrategy'] ?? null;
        $default_strategy = $is_headless && $public_url !== ''
            ? self::STRATEGY_PREFIX_SWAP
            : self::STRATEGY_INHERIT;
        $resolved_strategy = $stored_strategy ?? $default_strategy;
        if (
            $is_headless
            && $public_url !== ''
            && $resolved_strategy === self::STRATEGY_INHERIT
        ) {
            $resolved_strategy = self::STRATEGY_PREFIX_SWAP;
        }
        $strategy = self::sanitize_strategy($resolved_strategy);

        $language = (string)get_bloginfo('language');

        return new self([
            'name'                 => (string)get_bloginfo('name'),
            'tagline'              => (string)get_bloginfo('description'),
            'language'             => $language,
            'logoUrl'              => $logo_url,
            'homeUrl'              => $home_url,
            'publicUrl'            => $public_url,
            'isHeadless'           => (bool)($option['isHeadless'] ?? false),
            'description'          => (string)($option['description'] ?? ''),
            'keyPages'             => $option['keyPages'] ?? [],
            'permalinkStrategy'    => $strategy,
            'permalinkTemplate'    => (string)($option['permalinkTemplate'] ?? ''),
            'defaultPermalinkLang' => self::resolve_default_lang(
                (string)($option['defaultPermalinkLang'] ?? ''),
                $language
            ),
        ]);
    }

    /**
     * Seed the profile option from `STRUCTURA_MARKETING_SITE_URL` if the
     * option has never been written. Idempotent — `add_option` is a
     * no-op when the option exists, so subsequent boots become free.
     *
     * Called from plugin bootstrap once per request. Operators editing
     * the profile through the UI thereafter overwrite the seeded values
     * normally; the constant stops being read.
     *
     * Why a constant-to-option seed rather than constant-as-source-of-
     * truth: the headless settings UI (Phase 2) needs a writable record
     * the operator can edit. Mirroring the constant value into the
     * option once gives the UI a starting point; making the constant
     * live-readable forever would mean every profile read does
     * `defined(...)` + `get_option(...)` and the UI would have to
     * special-case "constant-defined, option-overrides" precedence on
     * every render.
     */
    public static function seed_from_constant_if_missing(): void
    {
        if ( ! defined('STRUCTURA_MARKETING_SITE_URL')) {
            return;
        }
        $constant = (string)\STRUCTURA_MARKETING_SITE_URL;
        if ($constant === '') {
            return;
        }

        $existing = get_option(self::OPTION_NAME, null);
        if ($existing !== null) {
            // Option already written — operator has either run through
            // the settings UI or a prior boot already seeded. Either way
            // the option wins.
            return;
        }

        add_option(self::OPTION_NAME, [
            'isHeadless'           => true,
            'publicUrl'            => rtrim($constant, '/'),
            'description'          => '',
            'keyPages'             => [],
            'permalinkStrategy'    => self::STRATEGY_PREFIX_SWAP,
            'permalinkTemplate'    => '',
            'defaultPermalinkLang' => 'en',
        ]);
    }

    /**
     * Resolve the public URL for a post.
     *
     * Strategy mapping:
     *   - `inherit`    → `get_permalink($post_id)` unchanged.
     *   - `prefixSwap` → `{publicUrl}/{lang}/blog/{slug}`.
     *   - `template`   → `{publicUrl}{permalinkTemplate}` with tokens
     *                    `{slug}`, `{lang}`, `{year}`, `{month}` swapped.
     *
     * Defensive fallback: any post without a usable `post_name` returns
     * `get_permalink($post_id)` regardless of strategy. Auto-drafts and
     * posts saved before a slug is assigned would otherwise produce a
     * `/blog/` URL that 404s on the public site — handing the LLM a
     * broken URL is worse than regressing the one edge-case post to
     * the WP origin.
     */
    public function permalink_for_post(int $post_id): string
    {
        if ($post_id <= 0) {
            return '';
        }

        if ($this->permalinkStrategy === self::STRATEGY_INHERIT) {
            return (string)get_permalink($post_id);
        }

        $slug = (string)get_post_field('post_name', $post_id);
        if ($slug === '') {
            return (string)get_permalink($post_id);
        }

        $lang = $this->defaultPermalinkLang !== '' ? $this->defaultPermalinkLang : 'en';

        if ($this->permalinkStrategy === self::STRATEGY_PREFIX_SWAP) {
            return rtrim($this->publicUrl, '/') . '/' . $lang . '/blog/' . $slug;
        }

        if ($this->permalinkStrategy === self::STRATEGY_TEMPLATE) {
            $template = $this->permalinkTemplate !== ''
                ? $this->permalinkTemplate
                : '/{lang}/blog/{slug}';

            $year  = (string)get_post_time('Y', true, $post_id);
            $month = (string)get_post_time('m', true, $post_id);

            $rendered = strtr($template, [
                '{slug}'  => $slug,
                '{lang}'  => $lang,
                '{year}'  => $year,
                '{month}' => $month,
            ]);

            // Template can be either rooted (`/news/{slug}`) or absolute
            // (`https://other.example.com/{slug}`). Rooted templates
            // anchor against `publicUrl`; absolute templates pass
            // through. Detect by protocol prefix.
            if (preg_match('#^https?://#i', $rendered)) {
                return $rendered;
            }

            return rtrim($this->publicUrl, '/') . '/' . ltrim($rendered, '/');
        }

        // Defensive: an unrecognised strategy got past sanitize_strategy.
        // Returning the WP permalink keeps the site working — no broken
        // URLs leak into AI prompts.
        return (string)get_permalink($post_id);
    }

    /**
     * Return the URLs Structura should treat as "key landing pages" for
     * AI grounding.
     *
     * In headless mode (or whenever the operator has populated
     * `keyPages`) we return those URLs directly — Structura can't see
     * the public site's nav from inside WP, so the operator's curated
     * list IS the source of truth. In non-headless mode with an empty
     * `keyPages` list we delegate to the legacy nav-menu walk done by
     * `Context_Builder::detect_landing_urls` (which the caller invokes
     * — keeping the menu-walking out of this class avoids a circular
     * require).
     *
     * @return string[] Up to 3 absolute URLs, possibly empty.
     */
    public function landing_urls_from_key_pages(): array
    {
        $urls = [];
        foreach ($this->keyPages as $page) {
            if (isset($page['url']) && is_string($page['url']) && $page['url'] !== '') {
                $urls[] = $page['url'];
            }
            if (count($urls) >= 3) {
                break;
            }
        }
        return $urls;
    }

    /**
     * Build the wire payload for `Site_Identity_Sync::push_to_cloud()`.
     *
     * Shape mirrors the `SiteIdentity` interface in
     * `packages/types/src/index.ts` — keep this method and that
     * interface in lockstep. The cloud-side `normaliseSiteIdentity`
     * accepts every field optionally and drops malformed values, so
     * shipping a too-large payload is safer than under-shipping.
     *
     * @return array<string, mixed>
     */
    public function to_site_identity_payload(): array
    {
        $payload = [
            'name'     => $this->name,
            'tagline'  => $this->tagline,
            // BCP-47 form (`en-US`); cloud's SERP `hl` resolver handles
            // the `_` → `-` normalisation.
            'language' => $this->language,
            'logoUrl'  => $this->logoUrl,
            'homeUrl'  => $this->homeUrl,
        ];

        // Only emit the public-site-profile fields when headless mode is
        // explicitly on. A non-headless install shipping `publicUrl ===
        // homeUrl` would persist redundant data on every customer doc;
        // gating on `isHeadless` keeps the activation doc lean for the
        // 95% case while still enabling the extension when it matters.
        if ($this->isHeadless) {
            $payload['isHeadless']           = true;
            $payload['publicUrl']            = $this->publicUrl;
            $payload['description']          = $this->description;
            $payload['keyPages']             = $this->keyPages;
            $payload['permalinkStrategy']    = $this->permalinkStrategy;
            $payload['permalinkTemplate']    = $this->permalinkTemplate;
            $payload['defaultPermalinkLang'] = $this->defaultPermalinkLang;
        }

        return $payload;
    }

    /**
     * Normalise an incoming `keyPages` value into the canonical
     * `[{url, label, role}, ...]` shape, dropping items that fail
     * shape/value checks. Mirrors `normaliseKeyPage` cloud-side.
     *
     * @param mixed $raw
     *
     * @return array<int, array{url: string, label: string, role: string}>
     */
    private static function sanitize_key_pages($raw): array
    {
        if ( ! is_array($raw)) {
            return [];
        }

        $allowed_roles = [
            'about', 'features', 'services', 'pricing',
            'case_studies', 'blog_index', 'contact', 'other',
        ];

        $out = [];
        foreach ($raw as $item) {
            if ( ! is_array($item)) continue;

            $url = isset($item['url']) ? (string)$item['url'] : '';
            if ( ! preg_match('#^https?://#i', $url)) continue;

            $label = isset($item['label']) ? trim((string)$item['label']) : '';
            if ($label === '') continue;

            $role = isset($item['role']) ? (string)$item['role'] : '';
            if ( ! in_array($role, $allowed_roles, true)) continue;

            $out[] = [
                'url'   => $url,
                'label' => $label,
                'role'  => $role,
            ];

            if (count($out) >= self::KEY_PAGES_MAX) break;
        }
        return $out;
    }

    /**
     * Coerce an arbitrary string to a known strategy. Unknown values
     * collapse to `STRATEGY_INHERIT` — the safest default because it
     * preserves the legacy `get_permalink()` behaviour for non-headless
     * installs and avoids leaking malformed URLs into AI prompts.
     *
     * @param mixed $raw
     */
    private static function sanitize_strategy($raw): string
    {
        $allowed = [self::STRATEGY_INHERIT, self::STRATEGY_PREFIX_SWAP, self::STRATEGY_TEMPLATE];
        return in_array($raw, $allowed, true) ? (string)$raw : self::STRATEGY_INHERIT;
    }

    /**
     * Pick the language token used for `prefixSwap` / `template`
     * resolution, in priority order:
     *   1. Operator-set `defaultPermalinkLang` from the option.
     *   2. BCP-47 prefix of `$site_language` (e.g. `en-US` → `en`).
     *   3. `'en'` as a final fallback so URLs always resolve.
     */
    private static function resolve_default_lang(string $configured, string $site_language): string
    {
        if ($configured !== '') {
            return $configured;
        }
        if ($site_language !== '') {
            $prefix = strtolower(strtok($site_language, '-_'));
            if ($prefix !== false && $prefix !== '') {
                return $prefix;
            }
        }
        return 'en';
    }
}
