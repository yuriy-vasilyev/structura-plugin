<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

use Structura\Api\Rest_Api;

class Admin_Dashboard
{

    public function add_plugin_menu(): void
    {
        // Ascending Overlap logo — monochrome for WP admin menu (colorized via admin CSS)
        $svg_icon = 'data:image/svg+xml;base64,' . base64_encode('<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="54" width="54" height="24" rx="6" fill="black" opacity="0.3"/>
<rect x="24" y="34" width="48" height="24" rx="6" fill="black" opacity="0.6"/>
<rect x="40" y="14" width="42" height="24" rx="6" fill="black"/>
</svg>
');

        add_menu_page(
            'Structura',
            'Structura',
            'manage_options',
            'structura',
            [$this, 'render_app_container'],
            $svg_icon,
            25,
        );
    }

    public function render_app_container(): void
    {
        echo '<div id="structura-root"></div>';
    }

    public function enqueue_scripts($hook): void
    {
        if ('toplevel_page_structura' !== $hook) {
            return;
        }

        add_filter('script_loader_tag', [$this, 'add_type_attribute'], 10, 3);

        $handle = 'structura-app';
        $data   = [
            'rest_url'                   => esc_url_raw(rest_url()),
            'webhook_url'                => esc_url_raw(rest_url('structura/v1/webhook/receive-blueprint')),
            'nonce'                      => wp_create_nonce('wp_rest'),
            'domain'                     => wp_parse_url(get_site_url(), PHP_URL_HOST),
            // Plugin version + site URL, surfaced so the SPA's PostHog
            // bootstrap can attach them as person properties without
            // a REST round-trip. PostHog itself is opt-in only and
            // doesn't load at all until the admin grants telemetry
            // via Settings → Privacy & Telemetry — these values are
            // unused in that path. See `client/src/lib/posthog.ts`.
            'plugin_version'             => defined('STRUCTURA_VERSION') ? STRUCTURA_VERSION : '0.0.0',
            'site_url'                   => esc_url_raw(get_site_url()),
            // PostHog publishable key + host. Shipped baked-in so every
            // installed plugin can capture telemetry out of the box —
            // we don't control the customer's wp-config.php on a
            // distributed WP plugin. Safe to ship: PostHog's `phc_*`
            // project keys are write-only client credentials designed
            // to live in browser/source code (see PostHog docs →
            // "Project API keys"). They can't read events, fetch
            // person data, or do anything destructive — only ingest.
            //
            // Capture is still strictly opt-in: posthog-js itself isn't
            // loaded until the admin flips Settings → Privacy &
            // Telemetry on (see `client/src/lib/posthog.ts` and the
            // `usePrivacyConsent` gate in `App.tsx`). The constant
            // overrides remain useful for redirecting a specific
            // install to a different PostHog project — e.g. internal
            // staff sites that should land in a separate workspace,
            // or self-hosted installs that want to disable telemetry
            // entirely by defining `STRUCTURA_POSTHOG_KEY` as ''.
            'posthog_key'                => defined('STRUCTURA_POSTHOG_KEY')
                ? STRUCTURA_POSTHOG_KEY
                : 'phc_njdRSnzgr8xffzawGUyQYN5mnBFMmpvdEsKuAqVGq5qN',
            // Default host is our first-party reverse proxy (forwards to
            // us.i.posthog.com) so browser ad-blockers in wp-admin don't
            // drop telemetry traffic.
            'posthog_host'               => defined('STRUCTURA_POSTHOG_HOST')
                ? STRUCTURA_POSTHOG_HOST
                : 'https://p.structurawp.com',
            // Debug mode field removed when the toggle was retired —
            // admin incidents + the Notification Center + per-failure
            // emails cover every observability case it previously
            // enabled. Older SPA builds default the field to false
            // when missing.
            // `DISABLE_WP_CRON` probe — inline-booted so the SPA can
            // render the in-app WpCronDisabledBanner on first paint
            // without waiting for a REST round-trip. The cross-hold
            // wp-admin admin notice (Wp_Cron_Disabled_Notice) uses the
            // same detection; keep them consistent if the definition
            // of "triggered" ever gets more sophisticated than a
            // constant check.
            'wp_cron_disabled'           => Wp_Cron_Disabled_Notice::is_triggered(),
            // Uploads-not-writable probe — inline-booted so the SPA can
            // disable the image-generation toggles (with a "why" + fix
            // link) on first paint instead of letting the user enable
            // images that will silently never save. The cross-wp-admin
            // Image_Uploads_Unwritable_Notice uses the same detection.
            'uploads_unwritable'         => \Structura\Ui\Image_Uploads_Unwritable_Notice::is_triggered(),
            // Cloud → plugin reachability verdict from the last handshake
            // probe (Site_Reachability). Inline-booted so the SPA can paint
            // the CloudUnreachableBanner on first render without a REST
            // round-trip; the cross-wp-admin Site_Unreachable_Notice reads
            // the same source. False when unprobed/reachable.
            'cloud_unreachable'          => \Structura\Core\Site_Reachability::is_unreachable(),
            // Phase 1.7 — pre-generation rollout notice. Surface
            // whether the current admin has dismissed it so the SPA
            // doesn't flash the banner during the REST round-trip.
            // The user-meta key carries the notice version (`v1`)
            // so future rollouts get a fresh prompt without
            // false-positive "already dismissed" reads.
            'pregen_v1_notice_dismissed' => (bool)get_user_meta(
                get_current_user_id(),
                'structura_pregen_v1_notice_dismissed',
                true,
            ),
            // Has this install ever completed a successful license
            // activation? Flipped to `true` by License_Manager::activate()
            // and cleared by the wipe-all uninstall branch. The SPA's
            // `SiteNotConnectedBanner` reads this to suppress the
            // "reconnect" banner on truly-fresh installs (no prior cloud
            // activation doc → nothing to reconnect to). See the contract
            // documented at SiteNotConnectedBanner.tsx §"Fresh-install
            // suppression".
            'had_prior_activation'       => (bool)get_option('structura_had_prior_activation', false),
            // Phase 1.8 — surface the workspace-presence signals so
            // `useLicense().hasWorkspace` derivation has everything it
            // needs without an extra REST round-trip on first paint.
            //
            //   - `has_workspace`: true when the install has an
            //     api_token bound (licensed activation OR successful
            //     anonymous bootstrap). Drives the SPA's flip of the 7
            //     hook gates listed in spec §1.8.4 from
            //     `hasUsableLicense` to `hasWorkspace`.
            //   - `is_anonymous`: true when the workspace exists AND
            //     the plan is "none" (i.e. anonymous shadow
            //     workspace, post-bootstrap). Lets the SPA
            //     distinguish "anonymous workspace bootstrapped" from
            //     "licensed user", which matters for the AI Engine
            //     page (provider count cap + Anthropic locked teaser)
            //     and for the Visuals page's permanent unlicensed
            //     teaser on `none` tier.
            //   - `provider_count_cap`: 1 for none, 2 for free, 3 for
            //     paid. The AI Engine SPA reads this to hide the
            //     "default for text/images" toggles when cap === 1
            //     (single provider, no choice) and to gate the "add
            //     provider" CTA at the cap.
            //   - `activation_id`: passed through so anonymous SPA
            //     queries can reference the activation without
            //     waiting for `useSettingsQuery` to resolve.
            //   - `plan`: same — read on first paint to drive the
            //     `is_anonymous` derivation.
            // Spec: `specs/v2/multi-tenant-and-public-api.md` §Phase 1.8.
            'has_workspace'              => self::has_anonymous_or_licensed_workspace(),
            'is_anonymous'               => self::is_anonymous_workspace(),
            'provider_count_cap'         => \Structura\Core\License_Manager::get_provider_count_cap(),
            'activation_id'              => self::current_activation_id(),
            'plan'                       => \Structura\Core\License_Manager::get_plan(),
            // Bootstrap payload for `useSettingsQuery` — same shape the
            // `/structura/v1/settings` endpoint returns, minus the
            // cloud-derived per-provider `connected` / `masked_key`
            // fields (which would require a synchronous cloud HTTP
            // here). The SPA wires this as TanStack Query
            // `initialData` with `initialDataUpdatedAt: 0`, so first
            // paint renders against the bootstrap and a single
            // background revalidation lands the cloud-derived fields
            // ~500ms later. Spec: see useSettingsQuery comments.
            'bootstrap_settings'         => Rest_Api::build_settings_payload(),
        ];

        // DEV MODE: Load from Vite Server. Both calls intentionally pass
        // `null` for the version arg — Vite owns cache-busting via its
        // own query strings in dev, and we don't want WP appending a
        // `?ver=` that would break Vite's module URL parsing. The
        // production branch below passes a real version. PCP's
        // EnqueuedResourceParameters.MissingVersion is a false positive
        // for the dev-only path.
        if (defined('STRUCTURA_DEV_MODE') && STRUCTURA_DEV_MODE) {
            // phpcs:disable WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Vite owns cache-busting in dev; see comment above the if-block.
            // 1. Load Vite Client (Header, type=module handled by filter)
            wp_enqueue_script('structura-vite-client', 'http://localhost:3000/@vite/client',
                ['wp-api-fetch', 'wp-element', 'wp-i18n', 'wp-url', 'wp-components'], null, false);

            // 2. Load App Entry
            // CHANGE: Added 'wp-i18n', 'wp-url' to dependencies
            // CHANGE: Changed 'false' to 'true' (Load in Footer)
            wp_enqueue_script(
                $handle,
                'http://localhost:3000/src/index.tsx',
                ['wp-api-fetch', 'wp-element', 'wp-i18n', 'wp-url', 'wp-components'],
                null,
                true,
            );
            // phpcs:enable WordPress.WP.EnqueuedResourceParameters.MissingVersion
        } else {
            $asset_file = STRUCTURA_PATH . 'assets/structura.asset.php';

            if (file_exists($asset_file)) {
                $assets = require($asset_file);

                wp_enqueue_script(
                    $handle,
                    STRUCTURA_URL . 'assets/structura.js',
                    $assets['dependencies'],
                    $assets['version'],
                    true,
                );

                wp_set_script_translations($handle, 'structura', STRUCTURA_PATH . 'languages');
            }
        }

        // Phase 1.8 §1.8.4 follow-up — `wp_localize_script` casts every
        // top-level scalar in `$l10n` to a string before serializing
        // (`html_entity_decode((string) $value, …)`). For string fields
        // that's a no-op, but it silently coerces booleans
        // (`has_workspace`, `is_anonymous`, `wp_cron_disabled`,
        // `had_prior_activation`, `pregen_v1_notice_dismissed`) to
        // `"1"` / `""` AND integers (`provider_count_cap`) to `"1"`.
        // The SPA's strict-equality / typeof checks
        // (`config.has_workspace === true`,
        // `typeof config.provider_count_cap === "number"`) then fail
        // and every flag falls through to its fallback — which is
        // exactly how the AI Engine wizard's "Default for text" toggle
        // ended up rendering enabled+unforced on None tier despite the
        // PHP side reporting `cap=1`.
        //
        // `wp_add_inline_script` with `wp_json_encode` injects the
        // payload as a typed JS object literal (booleans stay `true`/
        // `false`, integers stay numbers, nested arrays serialize as
        // objects), preserving type fidelity from PHP through to the
        // SPA. Position `before` ensures the assignment lands before
        // the main entry script reads `window.structuraConfig`.
        wp_add_inline_script(
            $handle,
            'window.structuraConfig = ' . wp_json_encode($data) . ';',
            'before',
        );
    }

    /**
     * True when the install has a usable bearer token bound to it —
     * either from a licensed activation or a successful anonymous
     * bootstrap (Phase 1.8). Drives `structuraConfig.has_workspace`
     * so the SPA can flip its 7 hook gates from `hasUsableLicense`
     * to `hasWorkspace` without a REST round-trip.
     *
     * Why not piggyback on `License_Manager::is_licensed()` — that
     * gates on the `key` field being non-empty, which anonymous
     * workspaces deliberately don't carry. The api_token check is
     * the workspace-presence signal regardless of license state.
     */
    private static function has_anonymous_or_licensed_workspace(): bool
    {
        $payload = \Structura\Core\Key_Manager::get_license_payload();
        if ( ! is_array($payload)) {
            return false;
        }
        $token = $payload['api_token'] ?? '';

        return is_string($token) && $token !== '';
    }

    /**
     * True when the workspace is anonymous (post-bootstrap, pre-claim).
     * Delegates to {@see \Structura\Core\License_Manager::is_anonymous_workspace()}
     * — the single source since 2026-06-06, when the flag also started
     * travelling on the `/settings` REST payload so the SPA can
     * re-derive it reactively after an in-SPA activation (this inline
     * snapshot can't change without a page render).
     */
    private static function is_anonymous_workspace(): bool
    {
        return \Structura\Core\License_Manager::is_anonymous_workspace();
    }

    /**
     * Activation id from the persisted license payload. Empty string
     * when no workspace is bound (pre-bootstrap and pre-license).
     * Surfaced into structuraConfig so SPA queries can reference the
     * activation without re-reading via `useSettingsQuery`.
     */
    private static function current_activation_id(): string
    {
        $payload = \Structura\Core\Key_Manager::get_license_payload();
        if ( ! is_array($payload)) {
            return '';
        }
        $id = $payload['activation_id'] ?? '';

        return is_string($id) ? $id : '';
    }

    public function enqueue_styles($hook): void
    {
        if ('toplevel_page_structura' !== $hook) {
            return;
        }

        // Only load CSS in production. In Dev, Vite injects it via JS.
        if ( ! (defined('STRUCTURA_DEV_MODE') && STRUCTURA_DEV_MODE)) {
            $asset_file = STRUCTURA_PATH . 'assets/structura.asset.php';
            $version    = file_exists($asset_file) ? (require $asset_file)['version'] : '1.0.0';

            wp_enqueue_style(
                'structura-style',
                STRUCTURA_URL . 'assets/structura.css',
                [],
                $version,
            );
        }
    }

    /**
     * Fix: Adds type="module" to scripts loaded from Vite
     *
     * Callback for the `script_loader_tag` filter — WP's documented
     * extension point for rewriting the entire `<script>` tag a
     * `wp_enqueue_script` registration produces. Returning a literal
     * script-tag string here is the only contract this filter accepts;
     * PCP's NonEnqueuedScript rule (which exists to stop plugins from
     * hand-rolled `echo '<script>'` bypassing the enqueue system) is a
     * false positive in this hook.
     */
    public function add_type_attribute($tag, $handle, $src)
    {
        // Only apply for Dev Mode (Vite server handles modules)
        if (defined('STRUCTURA_DEV_MODE') && STRUCTURA_DEV_MODE) {
            if ('structura-app' === $handle || 'structura-vite-client' === $handle) {
                // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript -- script_loader_tag filter requires returning a literal <script> tag; this is WP's documented contract.
                return '<script type="module" src="' . esc_url($src) . '"></script>';
            }
        }

        // In Production (IIFE), we return the tag as is
        return $tag;
    }
}