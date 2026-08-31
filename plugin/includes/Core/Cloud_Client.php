<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Centralized HTTP client for all outbound requests to Structura Cloud.
 *
 * Every request automatically includes `pluginVersion` so the cloud can
 * make version-aware decisions. Responses are checked for the
 * `update_required` signal, which triggers an admin notice when the
 * installed plugin is below the minimum supported version.
 */
class Cloud_Client
{
    /**
     * WordPress option key used to persist the "update required" admin notice.
     */
    private const UPDATE_NOTICE_OPTION = 'structura_update_required';

    /**
     * Connect-timeout target for cURL when reaching the cloud.
     *
     * WordPress's `WP_Http_Curl::request()` hardcodes
     * `CURLOPT_CONNECTTIMEOUT` to `min(10, $r['timeout'])` regardless of
     * what the `timeout` arg is — so even a `timeout: 60` request still
     * fails the TCP connect after 10 seconds. Cloud Functions cold
     * starts on idle revisions can legitimately need 15-25s before the
     * instance accepts the connection. The hardcoded 10s ceiling
     * surfaces in production as `cURL error 28: Failed to connect after
     * 10001 ms` — same message the spec called out in the 2026-04-29
     * ngrok test session.
     *
     * We hook `http_api_curl` (WP's last-mile filter that hands you the
     * cURL handle pre-execute) to override CURLOPT_CONNECTTIMEOUT. The
     * 30-second value is comfortable for the worst observed cold start
     * AND below the 60s `timeout` we use on dispatch calls — leaving
     * ~30s headroom for the actual response.
     */
    private const CLOUD_CONNECT_TIMEOUT_SECONDS = 30;

    /**
     * Send a POST request to a Structura Cloud endpoint.
     *
     * @param string $endpoint  Relative path, e.g. '/activateLicense'
     * @param array  $payload   Request body (pluginVersion is auto-injected)
     * @param array  $args      Optional wp_remote_post overrides (timeout, headers, etc.)
     *
     * @return array|WP_Error  Decoded JSON body on success, WP_Error on transport failure.
     */
    public static function post(string $endpoint, array $payload = [], array $args = [])
    {
        // Hard stop in front of EVERY outbound cloud request: nothing
        // leaves the site until the admin has opted in (wp.org
        // guidelines 7 & 9 — see Anonymous_Bootstrap). Callers already
        // treat a WP_Error as "cloud unreachable", so this degrades the
        // same way a network failure would.
        if ( ! Anonymous_Bootstrap::has_cloud_consent()) {
            return new \WP_Error(
                'structura_cloud_consent_required',
                __('Structura Cloud is not connected yet. Open Structura in wp-admin and choose "Connect to Structura Cloud" first.', 'structura')
            );
        }

        // Auto-inject plugin version into every outbound payload
        $payload['pluginVersion'] = STRUCTURA_VERSION;

        // Surface discriminator. Spec: specs/v2/multi-tenant-and-public-api.md §3 —
        // every plugin → cloud body identifies the surface origin so the cloud's
        // `LicenseActivation.surface` discriminated union (wp / shopify / webflow /
        // api) can branch on a single field instead of inferring from a heuristic.
        // The WP plugin always sends `'wp'` from launch so future surface adapters
        // (e.g. a Shopify app sending `'shopify'`) can target the same endpoints
        // without forcing every deployed WP install to upgrade.
        // Caller-supplied values are honoured so tests / one-off scripts can override.
        if ( ! array_key_exists('surface', $payload)) {
            $payload['surface'] = 'wp';
        }

        // Phase 3.3 (multi-tenant spec §3.3) — every cloud-side endpoint
        // gated by the activation auth helper now expects `activation_id`
        // (UUID) on the wire. Inject it centrally from the persisted
        // license payload so individual call sites don't have to thread
        // the value through every request body. Both the snake_case form
        // (`activation_id`, used by the auth envelope) and the camelCase
        // form (`activationId`, used by the lifecycle endpoints) are
        // populated when missing — callers already supplying either key
        // are honoured verbatim.
        //
        // Phase 3.5 (multi-tenant spec §3.5) — auth is now Bearer-token-
        // based. The persisted `api_token` is injected as
        // `Authorization: Bearer <token>` below; the in-body
        // `licenseKey` / `activation_id` / `activationId` fields stay
        // for log context and so that cloud handlers can keep using the
        // same destructured names while the bearer middleware does the
        // identity work.
        $stashed = Key_Manager::get_license_payload();
        $stashed_activation_id = is_array($stashed)
            ? ($stashed['activation_id'] ?? '')
            : '';
        $stashed_api_token = is_array($stashed)
            ? ($stashed['api_token'] ?? '')
            : '';
        $stashed_license_key = is_array($stashed)
            ? ($stashed['key'] ?? '')
            : '';
        if ($stashed_activation_id !== '') {
            if ( ! array_key_exists('activation_id', $payload)) {
                $payload['activation_id'] = $stashed_activation_id;
            }
            if ( ! array_key_exists('activationId', $payload)) {
                $payload['activationId'] = $stashed_activation_id;
            }
        }
        if ($stashed_license_key !== '' && ! array_key_exists('licenseKey', $payload)) {
            $payload['licenseKey'] = $stashed_license_key;
        }

        $headers = ['Content-Type' => 'application/json'];
        if ($stashed_api_token !== '') {
            $headers['Authorization'] = 'Bearer ' . $stashed_api_token;
        }

        $defaults = [
            'timeout' => 30,
            'headers' => $headers,
            'body'    => json_encode($payload),
        ];

        // Merge caller overrides. Headers are MERGED (not replaced) so
        // a caller that wants to add a custom header (e.g.
        // `X-Structura-Trace-Id`) doesn't accidentally drop the
        // bearer/Content-Type defaults below — caller keys still take
        // precedence on conflict.
        $request_args = array_merge($defaults, $args);
        if (isset($args['headers']) && is_array($args['headers'])) {
            $request_args['headers'] = array_merge($headers, $args['headers']);
        }

        // If the caller passed a custom body, honour theirs. Otherwise use ours.
        if (isset($args['body'])) {
            $request_args['body'] = $args['body'];
        }

        $url = STRUCTURA_API_BASE . $endpoint;

        // Override WP's hardcoded 10s connect-timeout for THIS request
        // only. The filter checks the cURL handle's actual URL so it
        // doesn't accidentally widen the timeout for unrelated calls
        // happening on the same request lifecycle.
        //
        // The raw curl_* calls below are intentional: `http_api_curl` is
        // WordPress's documented extension point for tuning the cURL
        // handle WP itself just built, so the WordPress.WP.AlternativeFunctions
        // rule (which exists to stop plugins from bypassing the WP HTTP
        // API) is a false positive in this hook.
        $connect_timeout_filter = static function ($handle) use ($url) {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_getinfo -- hooking WP's own http_api_curl action; see comment above.
            $current_url = curl_getinfo($handle, CURLINFO_EFFECTIVE_URL);
            if (is_string($current_url) && strpos($current_url, STRUCTURA_API_BASE) === 0) {
                // phpcs:ignore WordPress.WP.AlternativeFunctions.curl_curl_setopt -- hooking WP's own http_api_curl action; see comment above.
                curl_setopt($handle, CURLOPT_CONNECTTIMEOUT, self::CLOUD_CONNECT_TIMEOUT_SECONDS);
            }
        };
        add_action('http_api_curl', $connect_timeout_filter, 10, 1);

        $response = wp_remote_post($url, $request_args);

        // Always remove the filter, even when wp_remote_post throws —
        // otherwise a long-lived request lifecycle (e.g. WP-CLI batch)
        // would inherit the override on every subsequent cloud call.
        remove_action('http_api_curl', $connect_timeout_filter, 10);

        if (is_wp_error($response)) {
            return $response;
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        // Handle minimum version enforcement from the cloud
        if (is_array($body) && isset($body['error']) && $body['error'] === 'update_required') {
            self::flag_update_required($body['minVersion'] ?? 'unknown');
        } else {
            // If any successful response comes back, clear the flag — the version is fine.
            self::clear_update_required();
        }

        // Self-heal a dead anonymous bearer (see method docblock). Runs
        // for every response so the strike counter can both accrue on
        // 401s and reset the moment the token authenticates again.
        self::maybe_self_heal_anonymous_bearer($code, $stashed_api_token, $stashed_license_key);

        return [
            'code' => $code,
            'body' => $body,
            'raw'  => $response,
        ];
    }

    /**
     * WP option holding the count of consecutive 401s seen on an
     * anonymous bearer. Autoload off — only the self-heal path reads it.
     */
    private const AUTH_401_STRIKES_OPTION = 'structura_anon_auth_401_strikes';

    /**
     * How many consecutive admin-load auth failures we tolerate before
     * treating an anonymous bearer as permanently dead.
     *
     * Why not heal on the first 401: the cloud returns the SAME
     * `401 {"success":false,"error":"Unauthorized."}` for a genuinely
     * revoked/deleted token AND for a transient Firestore error during
     * the token lookup (functions/src/auth/tokenMiddleware.ts wraps the
     * lookup in try/catch and 401s on any throw). Re-bootstrapping on a
     * single 401 would make every anonymous install discard its bearer
     * and mint a new shadow workspace during any cloud hiccup — a
     * thundering herd of re-bootstraps plus a pile of orphaned
     * workspaces. Requiring consecutive failures across separate admin
     * loads rules the blip out.
     */
    private const SELF_HEAL_401_THRESHOLD = 2;

    /**
     * Per-request guard so at most ONE auth verdict is recorded per WP
     * request. A single admin page load can fire several authenticated
     * cloud calls; without this, one transient-401 window would stack
     * several strikes at once and defeat the consecutive-loads gate.
     * Resets naturally per PHP request in production; tests reset it via
     * reflection.
     */
    private static bool $authVerdictRecordedThisRequest = false;

    /**
     * Detect and recover from a dead anonymous bearer.
     *
     * Background: once an anonymous install has a bearer, the plugin
     * historically treated it as "good until revoked" and never
     * re-checked — so if the backing workspace/activation/token was
     * deleted or revoked server-side (common when testing a local site
     * against prod, or after a support teardown), every cloud call
     * 401'd forever and the only fix was manually clearing wp_options.
     *
     * This clears the stale credentials after
     * {@see self::SELF_HEAL_401_THRESHOLD} consecutive 401s so
     * {@see Anonymous_Bootstrap::maybe_bootstrap()} re-mints a fresh
     * shadow workspace on the next admin load. The stable install-id
     * sticker is kept, so the cloud's idempotent re-bootstrap can reuse
     * the same identity wherever the install record still exists.
     *
     * Scope: anonymous installs only (no license key). A licensed
     * install's revoked token needs an explicit re-activation with the
     * stored key — a different, non-silent flow — so we must never wipe
     * it here.
     *
     * @param int    $code        HTTP status of the response just received.
     * @param string $sent_token  The bearer we actually sent ('' if none).
     * @param string $license_key The stashed license key ('' if anonymous).
     */
    private static function maybe_self_heal_anonymous_bearer(int $code, string $sent_token, string $license_key): void
    {
        // Only authenticated calls from an anonymous install are
        // eligible. No bearer sent (e.g. the bootstrap handshake itself)
        // means the response carries no verdict about our token; a
        // license key present means this is a licensed install.
        if ($sent_token === '' || $license_key !== '') {
            return;
        }

        // Record at most one verdict per WP request — see the guard's
        // docblock.
        if (self::$authVerdictRecordedThisRequest) {
            return;
        }
        self::$authVerdictRecordedThisRequest = true;

        if ($code !== 401) {
            // Any non-401 response proves the bearer authenticated — a
            // 200, or even a 403 gate that only fires AFTER auth passes.
            // Clear any strikes accrued from earlier transient 401s.
            if ((int) get_option(self::AUTH_401_STRIKES_OPTION, 0) !== 0) {
                delete_option(self::AUTH_401_STRIKES_OPTION);
            }
            return;
        }

        $strikes = (int) get_option(self::AUTH_401_STRIKES_OPTION, 0) + 1;

        if ($strikes < self::SELF_HEAL_401_THRESHOLD) {
            update_option(self::AUTH_401_STRIKES_OPTION, $strikes, false);
            return;
        }

        // Threshold reached — the anonymous bearer is dead. Drop the
        // credentials and the strike counter; the next admin load
        // re-bootstraps.
        delete_option(self::AUTH_401_STRIKES_OPTION);
        Key_Manager::clear_license_payload();
        Log_Service::add(
            'warn',
            'Cloud_Client: anonymous bearer rejected (401) '
                . self::SELF_HEAL_401_THRESHOLD
                . 'x in a row; cleared stale credentials, will re-bootstrap on next admin load.',
            0,
            'anonymous_bootstrap',
        );
    }

    /**
     * Convenience: Send a POST and return just the decoded body.
     * Returns WP_Error on transport failure, or the decoded array.
     *
     * @param string $endpoint
     * @param array  $payload
     * @param array  $args
     *
     * @return array|\WP_Error
     */
    public static function post_json(string $endpoint, array $payload = [], array $args = [])
    {
        $result = self::post($endpoint, $payload, $args);

        if (is_wp_error($result)) {
            return $result;
        }

        return $result['body'];
    }

    /**
     * Per-request cache of the activation's AI provider bindings —
     * the map returned by the cloud's `/listProviderCredentials`
     * endpoint, keyed by provider id. Static + WP-request-lifetime so
     * code paths that call `Provider_Registry::has_text_provider()`
     * three times during a single Settings page render only pay one
     * round trip.
     *
     * `null` = "haven't fetched yet"; an empty array = "fetched, no
     * bindings." The distinction matters because the cloud being
     * unreachable should NOT result in repeated retries within the
     * same request — we cache the empty result and move on.
     *
     * @var array<string, array<string, mixed>>|null
     */
    private static $provider_bindings_cache = null;

    /**
     * Return the activation's AI provider bindings as a
     * `provider_id => binding` map. Bindings carry whatever the cloud
     * surfaced via `listProviderCredentials` (`credId`, `label`,
     * `maskedKey`, `addedAt`, `lastUsedAt`).
     *
     * Cached for the duration of the WP request — see the static
     * cache property above. Failure modes (no bearer, expired
     * license, transport error) collapse to an empty map so callers
     * can render "no providers connected" rather than 502'ing the
     * page they're rendering.
     *
     * Pass `$force_refresh = true` after a save / disconnect so the
     * subsequent `has_key`-style probes see the new state.
     *
     * @param bool $force_refresh
     *
     * @return array<string, array<string, mixed>>
     */
    public static function get_provider_bindings(bool $force_refresh = false): array
    {
        if ($force_refresh) {
            self::$provider_bindings_cache = null;
        }
        if (self::$provider_bindings_cache !== null) {
            return self::$provider_bindings_cache;
        }

        $response = self::post('/listProviderCredentials', []);
        $map = [];
        if ( ! is_wp_error($response) && is_array($response)) {
            $body = $response['body'] ?? [];
            if (is_array($body) && ! empty($body['success']) && is_array($body['bindings'] ?? null)) {
                foreach ($body['bindings'] as $binding) {
                    if (is_array($binding) && isset($binding['provider'])) {
                        $map[(string)$binding['provider']] = $binding;
                    }
                }
            }
        }
        self::$provider_bindings_cache = $map;
        return $map;
    }

    /**
     * Drop the per-request bindings cache. Production callers invoke
     * this immediately after a save / disconnect so any subsequent
     * read inside the same WP request observes the post-mutation
     * state. Unit tests use it to exercise consecutive states without
     * faking a fresh PHP process.
     */
    public static function reset_provider_bindings_cache(): void
    {
        self::$provider_bindings_cache = null;
    }

    // ──────────────────────────────────────────────────────────────
    //  Minimum Version Enforcement (Admin Notice)
    // ──────────────────────────────────────────────────────────────

    /**
     * Store the required minimum version so the admin notice can display it.
     */
    private static function flag_update_required(string $min_version): void
    {
        update_option(self::UPDATE_NOTICE_OPTION, $min_version, false);
    }

    /**
     * Clear the update-required flag (called when a normal response is received).
     */
    private static function clear_update_required(): void
    {
        delete_option(self::UPDATE_NOTICE_OPTION);
    }

    /**
     * Register the admin notice hook. Called once from Loader.
     */
    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_show_update_notice']);
    }

    /**
     * Display a persistent admin notice when the plugin version is below the
     * cloud-enforced minimum.
     */
    public static function maybe_show_update_notice(): void
    {
        $min_version = get_option(self::UPDATE_NOTICE_OPTION, false);

        if ( ! $min_version) {
            return;
        }

        printf(
            '<div class="notice notice-error"><p><strong>%s</strong> %s</p></div>',
            esc_html__('Structura Update Required:', 'structura'),
            sprintf(
                /* translators: 1: currently-installed plugin version, 2: minimum version the cloud requires. */
                esc_html__('Your Structura plugin (v%1$s) is below the minimum supported version (v%2$s). Please update to continue using cloud features.', 'structura'),
                esc_html(STRUCTURA_VERSION),
                esc_html($min_version)
            )
        );
    }
}
