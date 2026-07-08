<?php

namespace Structura\Channels;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * WP→Cloud proxy for the `channelsListEvents` endpoint.
 *
 * One-call pass-through, same auth envelope as `Channels_Connections_Service`
 * (license_key + activation_secret + site_url), so the cloud's shared
 * `authenticate()` helper accepts both without duplicate plumbing.
 *
 * Unlike the connections service, this one has no local validation layer —
 * `limit` is a page-size hint, and the cloud clamps it against its own hard
 * cap, so anything reasonable is safe to forward verbatim.
 *
 * Spec: specs/integrations-store-spec.md §10
 */
class Channels_Events_Service implements Channels_Events_Service_Interface
{
    private const ENDPOINT_LIST        = '/channelsListEvents';
    private const ENDPOINT_VIDEO_RETRY = '/channelsVideoRetry';

    /**
     * Tight timeout mirrors the connections proxy: the Activity page is
     * interactive, and a flaky cloud shouldn't lock the wp-admin tab.
     */
    private const HTTP_ARGS = ['timeout' => 15];

    /**
     * @inheritDoc
     */
    public function list_events(int $limit = 25)
    {
        // Normalize silly inputs locally so we don't round-trip to the cloud
        // just to be told the limit was invalid. The cloud re-clamps anyway.
        if ($limit <= 0) {
            $limit = 25;
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, ['limit' => $limit]);

        return $this->call(self::ENDPOINT_LIST, $payload);
    }

    /**
     * @inheritDoc
     */
    public function retry_video(string $job_id)
    {
        // Validate locally so an empty id never costs a cloud round-trip —
        // mirrors the connections service's input guards.
        if ($job_id === '') {
            return new \WP_Error(
                'channels_invalid_input',
                __('Video job id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, ['job_id' => $job_id]);

        return $this->call(self::ENDPOINT_VIDEO_RETRY, $payload);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Internals — duplicated (intentionally) from Channels_Connections_Service.
    //  Extracting a shared base class would couple the two services through
    //  inheritance for ~30 lines of boilerplate; keeping them independent is
    //  the easier maintenance path for now.
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Build the auth envelope shared by every Structura cloud endpoint.
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
     * Shared transport. Normalizes transport failures + cloud-reported errors
     * into `WP_Error` with the status code and message preserved, and logs
     * every failure under `channels.events`.
     *
     * @param array<string, mixed> $payload
     *
     * @return array<string, mixed>|\WP_Error
     */
    private function call(string $endpoint, array $payload)
    {
        try {
            $result = Cloud_Client::post($endpoint, $payload, self::HTTP_ARGS);
        } catch (\Throwable $e) {
            Log_Service::add(
                'error',
                'Channels_Events_Service: cloud call threw',
                0,
                'channels.events',
                ['endpoint' => $endpoint, 'error' => $e->getMessage()]
            );
            return new \WP_Error('channels_cloud_exception', $e->getMessage(), ['status' => 500]);
        }

        if (is_wp_error($result)) {
            Log_Service::add(
                'error',
                'Channels_Events_Service: transport failure',
                0,
                'channels.events',
                ['endpoint' => $endpoint, 'error' => $result->get_error_message()]
            );
            return $result;
        }

        $code = (int)($result['code'] ?? 0);
        $body = is_array($result['body'] ?? null) ? $result['body'] : [];

        if ($code < 200 || $code >= 300 || ($body['success'] ?? false) !== true) {
            $message = is_string($body['error'] ?? null) && $body['error'] !== ''
                ? $body['error']
                : __('Cloud request failed.', 'structura');
            $status = $code > 0 ? $code : 500;

            Log_Service::add(
                'error',
                'Channels_Events_Service: cloud rejected',
                0,
                'channels.events',
                ['endpoint' => $endpoint, 'code' => $code, 'cloud_error' => $message]
            );

            return new \WP_Error('channels_cloud_error', $message, ['status' => $status]);
        }

        return $body;
    }
}
