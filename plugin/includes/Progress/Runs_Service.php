<?php

namespace Structura\Progress;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * WP→Cloud proxy for the `getCampaignRun` endpoint.
 *
 * Same auth envelope as the channels services (license_key +
 * activation_secret + site_url) so the cloud's shared authenticate()
 * accepts both without duplicate plumbing. Structure mirrors
 * `Channels_Events_Service` — extracting a base class for the auth +
 * transport would couple two services through inheritance for ~30 lines
 * of boilerplate, and the drift risk is low.
 *
 * On a cloud-reported 404 we preserve the underlying `error` string
 * (today only `run_not_found`) as the `WP_Error` code so the REST
 * handler can branch: `run_not_found` means "stop polling, the doc is
 * gone (TTL'd or never existed)".
 *
 * Spec: specs/progress-stream.md §7.
 */
class Runs_Service implements Runs_Service_Interface
{
    private const ENDPOINT_GET              = '/getCampaignRun';
    private const ENDPOINT_LIST             = '/listRuns';
    private const ENDPOINT_LIST_FOR_CAMPAIGN = '/listRunsForCampaign';
    private const ENDPOINT_LIST_ACTIVE      = '/listActiveRuns';
    private const ENDPOINT_LIST_SINGLE_POST = '/listSinglePostRuns';
    private const ENDPOINT_ACKNOWLEDGE      = '/acknowledgeRun';
    private const ENDPOINT_UNACKNOWLEDGE    = '/unacknowledgeRun';
    private const ENDPOINT_CANCEL              = '/cancelRun';

    /**
     * Tight timeout: the progress drawer polls every couple of seconds, so
     * a flaky cloud run shouldn't stack up slow HTTP requests on the tab.
     * Match the channels services' 15s budget.
     */
    private const HTTP_ARGS = ['timeout' => 15];

    /**
     * @inheritDoc
     */
    public function get_run(string $run_id)
    {
        $run_id = trim($run_id);
        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, ['run_id' => $run_id]);

        $result = $this->call(self::ENDPOINT_GET, $payload);

        // If the cloud parked this run for backup pull (its webhook push was
        // intercepted/unreachable), kick an immediate poll so a foreground run
        // the user is watching lands within seconds rather than waiting for the
        // recurring poller's next tick. Cheap + AS-deduped; no-op otherwise.
        if (is_array($result)
            && isset($result['run']['status'])
            && $result['run']['status'] === 'awaiting_pull') {
            \Structura\Scheduler\Delivery_Poller::queue_immediate_poll();
        }

        return $result;
    }

    /**
     * @inheritDoc
     */
    public function list_attention_runs(int $limit = 50)
    {
        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        // Clamp client-side too so a bug upstream can't spam the cloud
        // with a giant limit. Cloud enforces 1..50 as well.
        $limit = max(1, min($limit, 50));

        $payload = array_merge($envelope, [
            'status'       => 'failed,succeeded_with_warnings',
            'acknowledged' => 'false',
            'limit'        => $limit,
        ]);

        return $this->call(self::ENDPOINT_LIST, $payload);
    }

    /**
     * @inheritDoc
     */
    public function acknowledge_run(string $run_id, int $user_id)
    {
        $run_id = trim($run_id);
        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400]
            );
        }
        if ($user_id <= 0) {
            return new \WP_Error(
                'runs_missing_param',
                __('user_id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, [
            'run_id'  => $run_id,
            // WP user ids are numeric but the cloud stores a string to
            // stay forward-compatible with non-numeric ids (multisite,
            // external auth). Stringify at the edge.
            'user_id' => (string)$user_id,
        ]);

        return $this->call(self::ENDPOINT_ACKNOWLEDGE, $payload);
    }

    /**
     * @inheritDoc
     */
    public function list_runs_for_campaign($campaign_id, int $limit = 20)
    {
        // Phase 1.0c §4 — accept int (legacy) or string (cloud nanoid).
        // Reject empty / zero / blank values; everything else flows
        // through to cloud verbatim so the matching activation collection
        // is queried with the right id.
        if ($campaign_id === null || $campaign_id === '' || $campaign_id === 0 || $campaign_id === '0') {
            return new \WP_Error(
                'runs_missing_param',
                __('campaign_id is required.', 'structura'),
                ['status' => 400]
            );
        }
        if (is_int($campaign_id) && $campaign_id < 0) {
            return new \WP_Error(
                'runs_missing_param',
                __('campaign_id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        // Clamp client-side so a caller with a default "all rows please"
        // ask can't accidentally request the whole activation's history.
        // Cloud enforces 1..50 as well — the plugin-side clamp just keeps
        // the wire payload tidy.
        $limit = max(1, min($limit, 50));

        $payload = array_merge($envelope, [
            'campaign_id' => $campaign_id,
            'limit'       => $limit,
        ]);

        return $this->call(self::ENDPOINT_LIST_FOR_CAMPAIGN, $payload);
    }

    /**
     * @inheritDoc
     */
    public function list_active_runs(int $limit = 10)
    {
        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        // Clamp client-side to the cloud's 10-row ceiling so a caller
        // hand-passing a stale default (e.g. 50 from the needs-attention
        // convention) doesn't waste a round-trip on a payload the cloud
        // would immediately clamp anyway.
        $limit = max(1, min($limit, 10));

        $payload = array_merge($envelope, ['limit' => $limit]);

        return $this->call(self::ENDPOINT_LIST_ACTIVE, $payload);
    }

    /**
     * @inheritDoc
     */
    public function list_single_post_runs(int $limit = 10)
    {
        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        // Cloud clamps to 1..50; mirror it here so a caller hand-passing
        // a malformed default doesn't waste a round-trip.
        $limit = max(1, min($limit, 50));

        $payload = array_merge($envelope, ['limit' => $limit]);

        return $this->call(self::ENDPOINT_LIST_SINGLE_POST, $payload);
    }

    /**
     * @inheritDoc
     */
    public function unacknowledge_run(string $run_id)
    {
        $run_id = trim($run_id);
        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, ['run_id' => $run_id]);

        return $this->call(self::ENDPOINT_UNACKNOWLEDGE, $payload);
    }

    /**
     * Cancel a campaign run.
     *
     * @param string      $run_id        The run to cancel.
     * @param string      $cancelled_by  "user" or "system".
     * @param string|null $cancel_reason Optional reason for cancellation.
     *
     * @return array<string, mixed>|\WP_Error
     */
    public function cancel_run(string $run_id, string $cancelled_by, ?string $cancel_reason = null)
    {
        $run_id = trim($run_id);
        if ($run_id === '') {
            return new \WP_Error(
                'runs_missing_param',
                __('run_id is required.', 'structura'),
                ['status' => 400]
            );
        }

        if (!in_array($cancelled_by, ['user', 'system'], true)) {
            return new \WP_Error(
                'runs_invalid_param',
                __('cancelled_by must be "user" or "system".', 'structura'),
                ['status' => 400]
            );
        }

        $envelope = $this->build_auth_envelope();
        if (is_wp_error($envelope)) {
            return $envelope;
        }

        $payload = array_merge($envelope, [
            'run_id'       => $run_id,
            'cancelled_by' => $cancelled_by,
        ]);

        if ($cancel_reason !== null && $cancel_reason !== '') {
            $payload['cancel_reason'] = $cancel_reason;
        }

        return $this->call(self::ENDPOINT_CANCEL, $payload);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Internals
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Phase 1.8 PR8 — anonymous shadow workspaces have no license key
     * (only an `api_token` bearer + `activation_secret`). Cloud-side
     * auth is bearer-only; the in-body `license_key` and
     * `activation_secret` are legacy plumbing the cloud no longer
     * reads on these endpoints. Gating on `license_key === ''` here
     * locked anonymous installs out of every progress poll, which
     * surfaced as the SPA's "Run not found" placeholder flickering on
     * a successfully-completed run (Yurii incident 2026-05-10). The
     * presence of any persisted activation payload is now the only
     * precheck — bearer presence is enforced downstream by
     * `Cloud_Client::post`, and an unauthenticated request fails
     * cleanly with a 401 from the cloud rather than blocking here.
     *
     * @return array{license_key:string, activation_secret:string, site_url:string}|\WP_Error
     */
    private function build_auth_envelope()
    {
        $license = Key_Manager::get_license_payload();
        if ( ! is_array($license) || empty($license)) {
            return new \WP_Error(
                'runs_no_activation',
                __('License or activation is not set up.', 'structura'),
                ['status' => 403]
            );
        }

        $site_url = home_url();
        if ($site_url === '') {
            return new \WP_Error(
                'runs_no_activation',
                __('License or activation is not set up.', 'structura'),
                ['status' => 403]
            );
        }

        return [
            // Empty string for anonymous installs; the cloud bearer
            // middleware ignores this field and reads identity from
            // `Authorization: Bearer <api_token>`.
            'license_key'       => $license['key'] ?? '',
            'activation_secret' => $license['secret'] ?? '',
            'site_url'          => $site_url,
        ];
    }

    /**
     * Shared transport + error normalization. Mirrors the channels services
     * so operator logs across all cloud proxies follow one shape.
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
                'Runs_Service: cloud call threw',
                0,
                'progress.runs',
                ['endpoint' => $endpoint, 'error' => $e->getMessage()]
            );
            return new \WP_Error('runs_cloud_exception', $e->getMessage(), ['status' => 500]);
        }

        if (is_wp_error($result)) {
            // Transport layer failure (DNS, timeout, TLS). Don't spam the
            // log — progress polls happen every couple of seconds so a
            // flapping network would overwhelm the log. Info-level is the
            // right severity: "we tried, we couldn't reach".
            Log_Service::add(
                'info',
                'Runs_Service: transport failure',
                0,
                'progress.runs',
                ['endpoint' => $endpoint, 'error' => $result->get_error_message()]
            );
            return $result;
        }

        $code = (int)($result['code'] ?? 0);
        $body = is_array($result['body'] ?? null) ? $result['body'] : [];

        if ($code < 200 || $code >= 300 || ($body['success'] ?? false) !== true) {
            $cloud_error = is_string($body['error'] ?? null) && $body['error'] !== ''
                ? $body['error']
                : __('Cloud request failed.', 'structura');
            $status = $code > 0 ? $code : 500;

            // 404 branches are expected steady-state outcomes, not
            // failures worth alerting on: a TTL'd doc or a run from
            // another activation. Keep the response machine-readable
            // (preserve `cloud_error` as the WP_Error code) but don't
            // flood System Logs.
            if ($code === 404) {
                return new \WP_Error($cloud_error, $cloud_error, ['status' => 404]);
            }

            Log_Service::add(
                'error',
                'Runs_Service: cloud rejected',
                0,
                'progress.runs',
                ['endpoint' => $endpoint, 'code' => $code, 'cloud_error' => $cloud_error]
            );

            return new \WP_Error('runs_cloud_error', $cloud_error, ['status' => $status]);
        }

        return $body;
    }
}
