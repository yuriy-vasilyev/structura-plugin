<?php

namespace Structura\Channels;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * WP→Cloud proxy for activation-scoped channel connections.
 *
 * Every method in here is a one-call pass-through to the matching cloud
 * function. The plugin keeps no local state — the source of truth is the
 * `licenses/{l}/activations/{a}/connections` (summary) and
 * `connectionSecrets` (encrypted blob) collections. We do this rather than
 * caching in WP for two reasons:
 *
 *   1. There's only ever one writer of a connection (the user, via this
 *      proxy), so the cloud read is already authoritative.
 *   2. The encrypted blob never lands client-side; even a "convenience"
 *      cache risks leaking ciphertext to owner-readable surfaces.
 *
 * Auth envelope mirrors `Channel_Event_Forwarder::build_payload()`:
 * the same license_key + activation_secret + site_url tuple every Structura
 * cloud endpoint expects. This means we share the cloud's `authenticate()`
 * helper without inventing a second auth model.
 *
 * Spec: specs/integrations-store-spec.md §5.1, §5.3, §6.5, §7.2
 */
class Channels_Connections_Service implements Channels_Connections_Service_Interface
{
    private const ENDPOINT_LIST            = '/channelsListConnections';
    private const ENDPOINT_SAVE_WEBHOOK    = '/channelsSaveWebhookConnection';
    private const ENDPOINT_SAVE_CREDENTIAL = '/channelsSaveCredentialConnection';
    private const ENDPOINT_DELETE          = '/channelsDeleteConnection';
    private const ENDPOINT_UPDATE_SETTINGS = '/channelsUpdateConnectionSettings';
    private const ENDPOINT_CATALOG         = '/channelsListCatalog';
    private const ENDPOINT_OAUTH_INIT      = '/channelsOAuthInit';

    /**
     * Default `wp_remote_post` overrides. Connection management is interactive
     * (user clicks "Connect" / "Remove" and waits for feedback), so we DO
     * block on the cloud — but with a tight timeout so a flaky cloud doesn't
     * lock the wp-admin tab forever.
     */
    private const HTTP_ARGS = ['timeout' => 15];

    /**
     * @inheritDoc
     */
    public function list_connections()
    {
        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        return $this->call(self::ENDPOINT_LIST, $envelope, 'list');
    }

    /**
     * @inheritDoc
     *
     * Catalog is a pure read, but we keep it in this service (not a new one)
     * because it shares the same auth envelope, transport wrapper, and error
     * logging channel as the other three methods. Splitting it out would
     * duplicate ~80 lines for no win.
     */
    public function list_catalog()
    {
        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        return $this->call(self::ENDPOINT_CATALOG, $envelope, 'catalog');
    }

    /**
     * @inheritDoc
     */
    public function save_webhook_connection(
        string $integration_id,
        string $webhook_url,
        ?string $display_name = null,
        ?string $notification_locale = null,
        ?string $connection_id = null,
        ?string $signing_secret = null
    ) {
        if ($integration_id === '' || $webhook_url === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Integration id and webhook URL are required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, [
            'integration_id' => $integration_id,
            'webhook_url'    => $webhook_url,
        ]);
        if ($display_name !== null && $display_name !== '') {
            $payload['display_name'] = $display_name;
        }
        // Locale is a soft preference: we only forward it when the caller
        // actually picked something. The cloud normalizes unknown values to
        // `"system"`, so we don't duplicate that allow-list here — the WP side
        // stays forward-compatible if we add a new locale cloud-side without a
        // plugin update.
        if ($notification_locale !== null && $notification_locale !== '') {
            $payload['notification_locale'] = $notification_locale;
        }
        // `connection_id` is only present on Edit flows — Install always omits
        // it so the cloud mints a fresh UUID. When it is provided, the cloud
        // verifies the existing summary's integrationId matches (409 on
        // mismatch) so a stolen UUID can't hijack a foreign row.
        if ($connection_id !== null && $connection_id !== '') {
            $payload['connection_id'] = $connection_id;
        }
        // Signing secret is forwarded only when the caller supplied one. Two
        // reasons it's optional on this signature:
        //   1. Older REST callers (pre-webhook-ping) won't set it and we want
        //      Slack/Discord saves to keep working unchanged.
        //   2. The cloud is the source of truth for "is it required for this
        //      integration" — it returns a readable 400 if webhook-ping
        //      arrives without one. Re-checking here would duplicate the rule.
        if ($signing_secret !== null && $signing_secret !== '') {
            $payload['signing_secret'] = $signing_secret;
        }

        return $this->call(self::ENDPOINT_SAVE_WEBHOOK, $payload, 'save');
    }

    /**
     * @inheritDoc
     */
    public function update_connection_settings(
        string $connection_id,
        ?string $notification_locale = null,
        ?array $bound_campaign_ids = null,
        ?int $post_cadence_n = null,
        ?bool $attach_featured_image = null,
        ?string $selected_organization_urn = null,
        ?string $video_voice = null,
        ?string $video_style = null
    ) {
        if ($connection_id === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Connection id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, [
            'connection_id' => $connection_id,
        ]);
        if ($notification_locale !== null && $notification_locale !== '') {
            $payload['notification_locale'] = $notification_locale;
        }
        // Always forward the bindings array (even when empty) so saving an
        // empty selection on the SPA explicitly clears a previous binding.
        // `null` is the only sentinel that means "leave untouched" — the
        // cloud's normalizer collapses `[]` to "unbound" verbatim.
        if ($bound_campaign_ids !== null) {
            $payload['bound_campaign_ids'] = $bound_campaign_ids;
        }
        if ($post_cadence_n !== null) {
            $payload['post_cadence_n'] = $post_cadence_n;
        }
        // Forward the featured-image toggle ONLY when the caller passed
        // an explicit boolean. `null` means "untouched" (preserve the
        // current value on the cloud); both `true` and `false` ride the
        // wire. cms.formulafoundry.io 2026-05-22 observed: toggling the
        // switch off, clicking Save, then re-opening the modal showed it
        // checked again. Root cause: this method had no parameter for
        // the field at all, so the REST handler had no way to forward
        // it; the cloud Firestore doc kept the original `true` value.
        if ($attach_featured_image !== null) {
            $payload['attach_featured_image'] = $attach_featured_image;
        }
        // LinkedIn posting-target switch (personal profile vs. a company Page).
        // `null` means "leave the target untouched"; an empty string is the
        // meaningful "switch to personal" sentinel the cloud understands, so we
        // forward it verbatim and only skip the field when it's truly null.
        if ($selected_organization_urn !== null) {
            $payload['selected_organization_urn'] = $selected_organization_urn;
        }
        // Video channel voice/style. Forwarded only when the caller actually
        // picked something — non-video connections (and pre-video SPAs) never
        // send the fields, keeping their wire shape byte-identical. The cloud
        // owns the allow-list of valid ids, so we don't duplicate it here and
        // a new voice cloud-side needs no plugin release.
        if ($video_voice !== null && $video_voice !== '') {
            $payload['video_voice'] = $video_voice;
        }
        if ($video_style !== null && $video_style !== '') {
            $payload['video_style'] = $video_style;
        }

        return $this->call(self::ENDPOINT_UPDATE_SETTINGS, $payload, 'update_settings');
    }

    /**
     * @inheritDoc
     */
    public function save_credential_connection(
        string $integration_id,
        array $credentials,
        ?string $display_name = null,
        ?string $notification_locale = null,
        ?string $connection_id = null
    ) {
        if ($integration_id === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Integration id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, [
            'integration_id' => $integration_id,
            'credentials'    => $credentials,
        ]);
        if ($display_name !== null && $display_name !== '') {
            $payload['display_name'] = $display_name;
        }
        if ($notification_locale !== null && $notification_locale !== '') {
            $payload['notification_locale'] = $notification_locale;
        }
        if ($connection_id !== null && $connection_id !== '') {
            $payload['connection_id'] = $connection_id;
        }

        return $this->call(self::ENDPOINT_SAVE_CREDENTIAL, $payload, 'save_credential');
    }

    /**
     * @inheritDoc
     */
    public function delete_connection(string $connection_key)
    {
        if ($connection_key === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Connection id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        // Send `connection_id` as the primary field with `integration_id` as
        // a legacy fallback so the cloud endpoint (which accepts either) can
        // resolve pre-migration docs keyed by integrationId as well as
        // post-migration UUID rows. The cloud prefers `connection_id` when
        // both are present, which is exactly what we want for new rows.
        $payload = array_merge($envelope, [
            'connection_id'  => $connection_key,
            'integration_id' => $connection_key,
        ]);

        return $this->call(self::ENDPOINT_DELETE, $payload, 'delete');
    }

    /**
     * @inheritDoc
     */
    public function init_oauth(string $integration_id, string $redirect_uri, string $return_url = '', string $post_as = '')
    {
        if ($integration_id === '' || $redirect_uri === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Integration id and redirect URI are required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, [
            'integration_id' => $integration_id,
            'redirect_uri'   => $redirect_uri,
        ]);
        if ($return_url !== '') {
            $payload['return_url'] = $return_url;
        }
        // Posting target — LinkedIn only. "organization" tells the cloud to
        // request the company-page scopes so the user can post on behalf of a
        // Page they administer. Anything else (incl. "personal") is the default
        // and we omit the field so older clouds keep working unchanged.
        if ($post_as === 'organization') {
            $payload['post_as'] = 'organization';
        }

        return $this->call(self::ENDPOINT_OAUTH_INIT, $payload, 'oauth_init');
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Internals
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Build the auth envelope shared by all three cloud endpoints, or return
     * a `WP_Error` if the site isn't yet activated.
     *
     * @return array{license_key:string, activation_secret:string, site_url:string}|\WP_Error
     */
    private function build_auth_envelope()
    {
        $license = Key_Manager::get_license_payload();

        $license_key = $license['key'] ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ($license_key === '' || $secret === '' || $site_url === '') {
            return new \WP_Error(
                'channels_no_activation',
                __('License or activation is not set up.', 'structura'),
                ['status' => 403]
            );
        }

        return [
            'license_key'       => $license_key,
            'activation_secret' => $secret,
            'site_url'          => $site_url,
        ];
    }

    /**
     * Shared transport for the three endpoints. Normalizes:
     *   - WP_Error transport failures (network down, DNS, etc.) → WP_Error
     *   - Non-2xx responses (cloud rejected) → WP_Error carrying the cloud's
     *     own message and status code so the UI can render exact feedback
     *   - Successful body (already an array) → returned verbatim
     *
     * Logs every failure path under `channels.connections` so operators can
     * trace user-reported issues without poking Firestore directly.
     *
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>|\WP_Error
     */
    private function call(string $endpoint, array $payload, string $op)
    {
        try {
            $result = Cloud_Client::post($endpoint, $payload, self::HTTP_ARGS);
        } catch (\Throwable $e) {
            Log_Service::add(
                'error',
                'Channels_Connections_Service: cloud call threw',
                0,
                'channels.connections',
                ['op' => $op, 'endpoint' => $endpoint, 'error' => $e->getMessage()]
            );
            return new \WP_Error('channels_cloud_exception', $e->getMessage(), ['status' => 500]);
        }

        if (is_wp_error($result)) {
            Log_Service::add(
                'error',
                'Channels_Connections_Service: transport failure',
                0,
                'channels.connections',
                ['op' => $op, 'endpoint' => $endpoint, 'error' => $result->get_error_message()]
            );
            return $result;
        }

        $code = (int)($result['code'] ?? 0);
        $body = is_array($result['body'] ?? null) ? $result['body'] : [];

        // Cloud returns `{ success: false, error: "..." }` on validation /
        // auth failures with the corresponding HTTP status. Surface that
        // directly so the wp-admin UI can show the precise reason
        // ("Integration is not webhook-based.", "Security check failed.", …).
        if ($code < 200 || $code >= 300 || ($body['success'] ?? false) !== true) {
            $message = is_string($body['error'] ?? null) && $body['error'] !== ''
                ? $body['error']
                : __('Cloud request failed.', 'structura');
            $status = $code > 0 ? $code : 500;

            Log_Service::add(
                'error',
                'Channels_Connections_Service: cloud rejected',
                0,
                'channels.connections',
                ['op' => $op, 'endpoint' => $endpoint, 'code' => $code, 'cloud_error' => $message]
            );

            return new \WP_Error('channels_cloud_error', $message, ['status' => $status]);
        }

        return $body;
    }
}
