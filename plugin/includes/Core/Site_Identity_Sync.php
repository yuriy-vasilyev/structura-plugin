<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Pushes the site's brand surface (name, tagline, language, custom-logo
 * URL, public home URL) to the cloud activation doc, so cloud-side
 * stock-generation can read it synchronously without a per-run REST
 * round-trip back to WordPress.
 *
 * Spec: `specs/v2/cloud-pregeneration-and-model-catalog.md` §1.0e.
 *
 * Hook surface
 * ------------
 * The cloud activation doc gets seeded once at license-activation time
 * (License_Manager pushes the initial bundle alongside `siteName` /
 * `wpVersion`). Refreshes fire when any of these option-change actions run:
 *
 *   - `update_option_blogname`            — site title
 *   - `update_option_blogdescription`     — tagline
 *   - `update_option_WPLANG` / `_locale`  — language
 *   - `update_option_theme_mods_{stylesheet}` — custom-logo (stored as a
 *     theme mod, not a plain option, so we hook the dynamic option name)
 *
 * Why we don't subscribe to `customize_save_after`: the dynamic
 * `theme_mods` option fires for every customizer save AND for direct
 * `set_theme_mod()` calls; covering both with a single subscriber keeps
 * the syncs symmetrical.
 *
 * Failure mode
 * ------------
 * Sync is best-effort. A failed POST is logged at `Log_Service::add('warning')`
 * and the cloud falls back to the plugin-supplied `site_context` block on
 * the per-run payload during the rollout window. Cloud reads tolerate a
 * missing field; the worst observable effect of a failed sync is that
 * stock generation uses a slightly stale brand surface for one cron tick.
 *
 * Debounce
 * --------
 * A short `set_transient` lock (60s) coalesces rapid-fire option saves —
 * the customizer's "save changes" sometimes fires three update_option
 * actions in the same request (theme_mods + blogname + blogdescription).
 * We push the freshest snapshot at the END of the transient window so all
 * three changes ship in one HTTP call rather than three.
 */
class Site_Identity_Sync
{
    private const DEBOUNCE_TRANSIENT  = 'structura_site_identity_pending';
    private const DEBOUNCE_WINDOW_SEC = 60;

    /**
     * Register WP hooks. Called once during plugin bootstrap from `Loader::run`.
     *
     * `update_option_{name}` actions fire AFTER the option is persisted to
     * the DB, with `($old_value, $value, $option)` as the payload — we
     * read the live `get_bloginfo` / `get_theme_mod` calls anyway because
     * deriving "the new logo URL" from a `theme_mods` array would
     * recapitulate WordPress's own resolver.
     */
    public function init(): void
    {
        // Site title + tagline — change-of-the-decade frequency in
        // practice, but they're the highest-impact strings for cloud
        // generation, so keep them watched.
        add_action('update_option_blogname', [$this, 'on_identity_change'], 10, 0);
        add_action('update_option_blogdescription', [$this, 'on_identity_change'], 10, 0);

        // Language: WP < 4.0 stored under `WPLANG`; modern WP uses
        // `_locale` (and `WPLANG` is deprecated but still writable from
        // some admin paths). Watching both is cheap and removes the
        // version-detection coupling.
        add_action('update_option_WPLANG', [$this, 'on_identity_change'], 10, 0);
        add_action('update_option__locale', [$this, 'on_identity_change'], 10, 0);
        // Some installs set the locale via the Network admin user-meta
        // path (`locale` option); cover that too.
        add_action('update_option_locale', [$this, 'on_identity_change'], 10, 0);

        // Custom logo — stored as a theme mod, which lives inside the
        // dynamic `theme_mods_{stylesheet}` option. The stylesheet name
        // is per-install and per-active-theme, so we resolve it at
        // hook-time once. Switching themes triggers a different
        // `theme_mods_{newslug}` option to be written, hence we ALSO
        // hook the `switch_theme` action so the post-switch logo URL
        // reaches the cloud without waiting for the next customizer save.
        $stylesheet = get_stylesheet();
        if ($stylesheet) {
            add_action(
                "update_option_theme_mods_{$stylesheet}",
                [$this, 'on_identity_change'],
                10,
                0
            );
        }
        add_action('switch_theme', [$this, 'on_identity_change'], 10, 0);

        // Public-site profile changes — operator flipping headless mode,
        // editing the public URL, or curating keyPages from the settings
        // UI. Without this hook, the cloud-side `siteIdentity` would
        // lag behind the local override until the next theme/blogname
        // change happened to fire one of the watchers above.
        add_action(
            'update_option_' . Public_Site_Profile::OPTION_NAME,
            [$this, 'on_identity_change'],
            10,
            0
        );

        // The transient-driven debounce flush: a small "shutdown" hook
        // checks whether a sync is pending and, if the debounce window
        // has elapsed, fires the actual cloud POST. Running on shutdown
        // keeps wp-admin saves snappy — the customizer round-trip
        // returns before the HTTP call fires.
        add_action('shutdown', [$this, 'maybe_flush_pending'], 99);
    }

    /**
     * Action callback for every watched option/event. We don't push
     * directly — instead we mark "a sync is needed" via a transient so
     * a burst of customizer saves coalesces into a single HTTP call on
     * `shutdown`.
     */
    public function on_identity_change(): void
    {
        // A sentinel value is enough; the transient's existence is the
        // signal. Re-setting on every change extends the debounce window,
        // which is what we want — the freshest snapshot wins.
        set_transient(self::DEBOUNCE_TRANSIENT, time(), self::DEBOUNCE_WINDOW_SEC);
    }

    /**
     * Shutdown hook handler. Reads the debounce transient; if set, fires
     * the sync and clears it. Safe to call when no sync is pending — it
     * short-circuits before any DB write or HTTP call.
     */
    public function maybe_flush_pending(): void
    {
        if ( ! get_transient(self::DEBOUNCE_TRANSIENT)) {
            return;
        }

        // Clear FIRST. If the HTTP call below stalls, a second customizer
        // save mid-flight will re-set the transient and fire its own
        // sync; we'd rather double-sync than miss an update.
        delete_transient(self::DEBOUNCE_TRANSIENT);

        $this->push_to_cloud();
    }

    /**
     * Build the wire payload by reading WP's authoritative getters.
     *
     * Public so License_Manager can call it once at activation without
     * routing through the transient debounce — the activation request
     * already carries the snapshot in its body, but a follow-up
     * `syncSiteIdentity` POST is what lands the field on the activation
     * doc when an older plugin upgrades into 1.0e mid-license.
     */
    public function push_to_cloud(): void
    {
        $payload = Key_Manager::get_license_payload();
        if ( ! $payload || empty($payload['key']) || empty($payload['secret'])) {
            // No activation yet — there's nothing to push to. The next
            // activation will carry the snapshot via `License_Manager::activate`
            // directly, so no sync is needed here.
            return;
        }

        $body = [
            'licenseKey'       => $payload['key'],
            'domain'           => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'siteIdentity'     => self::collect(),
        ];

        $result = Cloud_Client::post('/syncSiteIdentity', $body, ['timeout' => 10]);

        if (is_wp_error($result)) {
            Log_Service::add(
                'warning',
                'Site_Identity_Sync: cloud sync failed (transport).',
                0,
                'site_identity.sync',
                ['error' => $result->get_error_message()]
            );
            return;
        }

        $code = (int)($result['code'] ?? 0);
        if ($code !== 200) {
            Log_Service::add(
                'warning',
                'Site_Identity_Sync: cloud sync returned non-200.',
                0,
                'site_identity.sync',
                ['code' => $code, 'body' => $result['body'] ?? null]
            );
        }
    }

    /**
     * Snapshot the brand surface from WordPress core APIs. Static so
     * License_Manager can call it inline at activation time without
     * instantiating the service.
     *
     * Reads through {@see Public_Site_Profile::to_site_identity_payload()}
     * — the unified read model that layers headless overrides on top of
     * the WP-getter snapshot. For non-headless installs the returned
     * shape is identical to the legacy `{name, tagline, language,
     * logoUrl, homeUrl}` bundle. Headless installs additionally emit
     * `publicUrl`, `isHeadless`, `description`, `keyPages`,
     * `permalinkStrategy`, `permalinkTemplate`, and
     * `defaultPermalinkLang` — see the cloud-side mirror in
     * `functions/src/types/shared.ts`.
     *
     * Spec: `specs/site-identity-headless.md` §3.1.
     *
     * @return array<string, mixed>
     */
    public static function collect(): array
    {
        return Public_Site_Profile::load()->to_site_identity_payload();
    }
}
