<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Self-hosted update checker for Structura.
 *
 * Hooks into WordPress's native update system so users see "Update Available"
 * in wp-admin — identical UX to wp.org-hosted plugins — but the update is
 * served from our own GCS bucket.
 *
 * Transition to wp.org:
 * Once the plugin is published on wp.org under the same slug ("structura"),
 * this class automatically detects it and stops injecting self-hosted updates,
 * letting WordPress use the official repository instead. No reinstall needed.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WP.ORG SUBMISSION GATE — DO NOT FORGET BEFORE BUILDING THE WP.ORG ZIP
 * ──────────────────────────────────────────────────────────────────────────
 * wp.org's plugin guideline #11 prohibits any code path that fetches updates
 * from a non-wp.org source — even a code path that "steps aside" on detection
 * (the `is_on_wporg()` check at the bottom of this file does NOT satisfy the
 * rule). Before publishing to the wp.org plugin directory, both the
 * `require_once` and `Self_Updater::init()` call in Loader.php must be gated
 * behind `defined('STRUCTURA_WPORG_BUILD')` so the entire class is excluded
 * from the wp.org distribution.
 *
 * The release pipeline that produces the wp.org ZIP is responsible for
 * defining `STRUCTURA_WPORG_BUILD` (typically via a sed-injected `define()`
 * near the top of `structura.php`). For local / agency-internal builds this
 * constant is left undefined and the auto-updater stays active so test sites
 * keep receiving releases via the GCS manifest.
 *
 * Pre-submission checklist for this file:
 *   - [ ] Loader.php:113   wrap `Self_Updater::init();` in `if (!defined('STRUCTURA_WPORG_BUILD'))`
 *   - [ ] Loader.php:218   wrap `require_once …Self_Updater.php` in the same guard
 *   - [ ] release.yml      ensure the wp.org build step injects the constant
 *   - [ ] Plugin Check Tool over the produced ZIP — must report no
 *         "PluginCheck.CodeAnalysis.RequiresFromExternal" or similar findings.
 */
class Self_Updater
{
    /**
     * GCS-hosted JSON endpoint that describes the latest release.
     * Updated automatically by the release GitHub Actions workflow.
     */
    private const UPDATE_URL = 'https://storage.googleapis.com/structura-releases/releases/structura-update.json';

    /**
     * WordPress transient key for caching the remote update check.
     */
    private const CACHE_KEY = 'structura_self_update_check';

    /**
     * How long to cache the remote check (in seconds). 6 hours.
     */
    private const CACHE_TTL = 6 * HOUR_IN_SECONDS;

    /**
     * Plugin basename as WordPress knows it: "structura/structura.php".
     */
    private static string $basename = '';

    /**
     * Boot the updater. Called once from Loader.
     */
    public static function init(): void
    {
        self::$basename = plugin_basename(STRUCTURA_PATH . 'structura.php');

        // Inject our update data into WordPress's plugin update transient.
        add_filter('pre_set_site_transient_update_plugins', [self::class, 'check_for_update']);

        // Supply plugin info for the "View details" modal in wp-admin.
        add_filter('plugins_api', [self::class, 'plugin_info'], 10, 3);

        // Clear cache when WordPress force-checks for updates.
        add_filter('upgrader_process_complete', [self::class, 'clear_cache'], 10, 0);
    }

    /**
     * Read the installed version from the plugin header on disk.
     *
     * Uses get_plugin_data() instead of the STRUCTURA_VERSION constant
     * so the comparison always matches what WordPress displays in the
     * plugin list — even if OPcache serves a stale compiled constant
     * right after an update.
     *
     * @return string
     */
    private static function get_installed_version(): string
    {
        if ( ! function_exists('get_plugin_data')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $data = get_plugin_data(STRUCTURA_PATH . 'structura.php', false, false);

        return $data['Version'] ?? STRUCTURA_VERSION;
    }

    /**
     * Inject update data into the update_plugins transient.
     *
     * @param object $transient The update_plugins transient object.
     * @return object
     */
    public static function check_for_update(object $transient): object
    {
        if (empty($transient->checked)) {
            return $transient;
        }

        // If the plugin is now available on wp.org, step aside entirely.
        if (self::is_on_wporg()) {
            return $transient;
        }

        $remote = self::fetch_remote_metadata();

        if ( ! $remote) {
            return $transient;
        }

        $installed = self::get_installed_version();

        // Compare versions — only inject an update if remote is newer.
        if (version_compare($installed, $remote->version, '<')) {
            $update              = new \stdClass();
            $update->slug        = $remote->slug;
            $update->plugin      = self::$basename;
            $update->new_version = $remote->version;
            $update->url         = $remote->homepage ?? '';
            $update->package     = $remote->download_url;

            // Optional: tested/requires metadata for the update row.
            if ( ! empty($remote->requires)) {
                $update->requires = $remote->requires;
            }
            if ( ! empty($remote->requires_php)) {
                $update->requires_php = $remote->requires_php;
            }
            if ( ! empty($remote->tested)) {
                $update->tested = $remote->tested;
            }

            $transient->response[self::$basename] = $update;
        } else {
            // Tell WordPress "no update available" — prevents it from
            // querying wp.org for an unknown slug on every page load.
            $no_update              = new \stdClass();
            $no_update->slug        = $remote->slug;
            $no_update->plugin      = self::$basename;
            $no_update->new_version = $installed;
            $no_update->url         = $remote->homepage ?? '';
            $no_update->package     = '';

            $transient->no_update[self::$basename] = $no_update;
        }

        return $transient;
    }

    /**
     * Supply rich plugin information for the "View details" modal.
     *
     * @param false|object|array $result
     * @param string             $action
     * @param object             $args
     * @return false|object
     */
    public static function plugin_info($result, string $action, object $args)
    {
        if ($action !== 'plugin_information') {
            return $result;
        }

        if ( ! isset($args->slug) || $args->slug !== 'structura') {
            return $result;
        }

        // If on wp.org, let the default handler serve the info.
        if (self::is_on_wporg()) {
            return $result;
        }

        $remote = self::fetch_remote_metadata();

        if ( ! $remote) {
            return $result;
        }

        $info                = new \stdClass();
        $info->name          = $remote->name ?? 'Structura';
        $info->slug          = $remote->slug ?? 'structura';
        $info->version       = $remote->version;
        $info->author        = $remote->author ?? '';
        $info->author_profile = $remote->author_profile ?? '';
        $info->homepage      = $remote->homepage ?? '';
        $info->requires      = $remote->requires ?? '';
        $info->requires_php  = $remote->requires_php ?? '';
        $info->tested        = $remote->tested ?? '';
        $info->download_link = $remote->download_url;
        $info->trunk         = $remote->download_url;
        $info->last_updated  = $remote->last_updated ?? '';

        // Sections for the info modal tabs.
        $info->sections = [
            'description' => $remote->sections->description ?? '',
            'changelog'   => $remote->sections->changelog ?? '',
        ];

        // Banners (optional).
        if ( ! empty($remote->banners)) {
            $info->banners = (array) $remote->banners;
        }

        return $info;
    }

    /**
     * Fetch and cache the remote update metadata JSON.
     *
     * @return object|null Decoded JSON object, or null on failure.
     */
    private static function fetch_remote_metadata(): ?object
    {
        $cached = get_transient(self::CACHE_KEY);

        if (is_object($cached)) {
            return $cached;
        }

        // A cached string "none" means a previous fetch failed — return null
        // without hitting the network. (WordPress coerces null to "" in
        // transients, so we use a sentinel string instead.)
        if ($cached === 'none') {
            return null;
        }

        $response = wp_remote_get(self::UPDATE_URL, [
            'timeout' => 15,
            'headers' => ['Accept' => 'application/json'],
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            // Cache the failure briefly (30 min) so we don't hammer GCS.
            set_transient(self::CACHE_KEY, 'none', 30 * MINUTE_IN_SECONDS);
            return null;
        }

        $body = json_decode(wp_remote_retrieve_body($response));

        if ( ! is_object($body) || empty($body->version) || empty($body->download_url)) {
            return null;
        }

        set_transient(self::CACHE_KEY, $body, self::CACHE_TTL);

        return $body;
    }

    /**
     * Check whether the plugin is now hosted on wp.org.
     *
     * Cached for 24 hours. Once true, the self-hosted updater permanently
     * steps aside and lets WordPress use the official repository.
     *
     * @return bool
     */
    private static function is_on_wporg(): bool
    {
        $cache_key = 'structura_on_wporg';
        $cached    = get_transient($cache_key);

        if ($cached !== false) {
            return $cached === 'yes';
        }

        $response = wp_remote_get('https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&slug=structura', [
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            // Can't reach wp.org — assume not listed, check again later.
            set_transient($cache_key, 'no', 6 * HOUR_IN_SECONDS);
            return false;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response));

        // wp.org returns 200 with a valid object if the slug exists.
        // It returns {"error":"Plugin not found"} or a non-200 if not.
        $on_wporg = ($code === 200 && is_object($body) && ! isset($body->error));

        set_transient($cache_key, $on_wporg ? 'yes' : 'no', DAY_IN_SECONDS);

        return $on_wporg;
    }

    /**
     * Clear the cached remote metadata so a fresh check happens immediately.
     */
    public static function clear_cache(): void
    {
        delete_transient(self::CACHE_KEY);
    }
}
