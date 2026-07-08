<?php

namespace Structura\Api;

use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * REST API for plugin admin telemetry consent.
 *
 * Stores a single site-wide WP option (`structura_privacy_consent`)
 * holding the admin's opt-in choice for anonymous plugin-usage analytics
 * (PostHog, US-hosted, Phase 2). The option is the source of truth on
 * every request that fires telemetry, so a plugin admin can revoke at
 * any time and the change takes effect immediately on the next page
 * load — there's no in-memory caching layer that could stale.
 *
 * Default: telemetry is OFF until an admin explicitly opts in via the
 * Settings → Privacy & Telemetry card. This is intentional for two
 * reasons: (a) wp-admin runs on the customer's domain, so we can't
 * piggy-back on the .structurawp.com cookie used by the marketing site;
 * (b) plugin admins are paid customers, not anonymous site visitors, so
 * showing a Klaro-style banner inside wp-admin would be unusual and
 * out-of-place. Settings-page opt-in matches how WP plugins typically
 * handle telemetry (e.g., WP Stats, Jetpack tracking).
 *
 * Spec: Phase 1 of the analytics rollout (see `MEMORY.md` →
 * project_structura_analytics_plan).
 */
class Privacy_Rest_Api
{
    private string $namespace = 'structura/v1';

    /**
     * WP option name. Site-wide rather than per-user because the
     * "should this plugin send telemetry" decision is an installation-
     * level data-controller decision, not a per-admin preference. If
     * we later need per-admin controls, the schema can grow a `byUser`
     * map under the same option without changing the wire format here.
     */
    private const OPTION_NAME = 'structura_privacy_consent';

    /**
     * Schema version. Bumping invalidates prior choices and the SPA
     * surfaces the consent prompt again — same pattern as the
     * `structura_consent` cookie used on the marketing site.
     */
    private const VERSION = 1;

    public function register_routes(): void
    {
        // Single route, two methods. Mirrors the WP REST convention of
        // co-locating GET + POST under one register_rest_route call so
        // they share the same permission_callback contract.
        register_rest_route($this->namespace, '/privacy/consent', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_consent'],
                'permission_callback' => [$this, 'check_admin_permission'],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'set_consent'],
                'permission_callback' => [$this, 'check_admin_permission'],
            ],
        ]);
    }

    /**
     * Plugin telemetry consent is an admin-controller decision; only
     * users with `manage_options` can view or change it. This matches
     * the rest of the Settings page surface (data-persistence, log
     * retention, debug mode all gated the same way).
     */
    public function check_admin_permission(): bool
    {
        return current_user_can('manage_options');
    }

    /**
     * GET /structura/v1/privacy/consent
     *
     * Returns the stored consent state, or a default "no choice yet"
     * shape if the option has never been written. The SPA uses
     * `hasMadeChoice` to differentiate between "default deny" and
     * "explicitly denied" — both produce telemetryEnabled=false, but
     * the UX could differ (e.g., we may surface a one-time advisory
     * inside Settings if hasMadeChoice is false).
     */
    public function get_consent()
    {
        $stored = get_option(self::OPTION_NAME, null);

        // Never set, or stored shape is malformed (option corrupted /
        // wrong type) — treat as "no choice yet". Defensive against a
        // legacy site that might have something else under this key.
        if ( ! is_array($stored) || ! isset($stored['version'])) {
            return rest_ensure_response($this->default_state());
        }

        // Schema version mismatch — treat as never-chosen so the admin
        // gets re-asked when policy materially changes (same pattern
        // as the marketing-site `structura_consent` cookie).
        if ((int) $stored['version'] !== self::VERSION) {
            return rest_ensure_response($this->default_state());
        }

        return rest_ensure_response([
            'version'          => self::VERSION,
            'choseAt'          => isset($stored['choseAt']) ? (int) $stored['choseAt'] : null,
            'telemetryEnabled' => ! empty($stored['telemetryEnabled']),
            'hasMadeChoice'    => true,
        ]);
    }

    /**
     * POST /structura/v1/privacy/consent
     *
     * Body: { telemetryEnabled: boolean }
     *
     * Writes the option and returns the updated state. Logs the change
     * with the user id so an admin reviewing the System Logs can audit
     * who flipped the switch and when.
     */
    public function set_consent(\WP_REST_Request $request)
    {
        $body = $request->get_json_params();
        $telemetry_enabled = isset($body['telemetryEnabled'])
            ? (bool) $body['telemetryEnabled']
            : false;

        $state = [
            'version'          => self::VERSION,
            'choseAt'          => time(),
            'telemetryEnabled' => $telemetry_enabled,
        ];

        update_option(self::OPTION_NAME, $state);

        Log_Service::add(
            'info',
            sprintf(
                '[privacy] Telemetry consent set to %s by user %d',
                $telemetry_enabled ? 'granted' : 'denied',
                get_current_user_id()
            ),
            0,
            'privacy'
        );

        return rest_ensure_response([
            'version'          => self::VERSION,
            'choseAt'          => $state['choseAt'],
            'telemetryEnabled' => $telemetry_enabled,
            'hasMadeChoice'    => true,
        ]);
    }

    /**
     * Default consent state when the option has never been written or
     * when the schema version doesn't match. Always denied; the admin
     * has to explicitly opt in via the Settings card.
     */
    private function default_state(): array
    {
        return [
            'version'          => self::VERSION,
            'choseAt'          => null,
            'telemetryEnabled' => false,
            'hasMadeChoice'    => false,
        ];
    }
}
