<?php

namespace Structura\Scheduler;

use Structura\Api\Campaign_Shape_Transformer;
use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Plugin-side analog of `Campaign_Repository::get_campaign_data()` that
 * reads from the cloud campaign collection instead of WP post meta.
 *
 * Phase 1.0c §4.
 *
 * ### Why this exists
 *
 * Once `structura_campaigns_authoritative_in_cloud` flips, the WP-side
 * `structura_campaign` posts stop being a reliable source — campaigns
 * created or edited in the SPA don't write to WP at all. But every
 * synthesis caller (Task_Runner step handlers, Rest_Api job listing,
 * the post-meta box) reads from the same cluster-shape array
 * Campaign_Repository has always returned. Rather than rewrite every
 * consumer, this class hands them the same shape — sourced from the
 * cloud when the flag is flipped, falling through to the WP repository
 * when it isn't.
 *
 * ### Single-campaign reads use `/getCampaign`
 *
 * `Cloud_Cadence_Sync` already caches the full `/listCampaigns` response
 * in a transient, but for *execution* reads we deliberately go straight
 * to `/getCampaign`. Reasons:
 *
 *   1. The cache TTL (30 min) is fine for cadence reconciliation but
 *      stale for a step that's about to publish a post — a campaign
 *      paused 28 minutes ago should not still get fired.
 *   2. The number of execution reads is bounded by AS pulse frequency,
 *      so the request volume is manageable.
 *   3. `/getCampaign` is the cleanest authoritative read; if it's slow
 *      we can layer caching with a tighter TTL later without changing
 *      this class's API.
 *
 * ### Returns null on miss
 *
 * Callers must treat null as "campaign disappeared from cloud" — same
 * semantics as `get_post()` returning null in the legacy path. Task_Runner
 * uses that signal to skip the step rather than throwing, so a
 * recently-deleted campaign whose AS pulse hadn't been swept yet just
 * silently logs and returns rather than blowing up the run.
 */
final class Campaign_Cloud_Reader
{
    /**
     * Fetch a cloud campaign by id and return it in the cluster shape
     * Task_Runner consumers expect.
     *
     * @return array|null Cluster shape on success, null when:
     *                    - The license isn't activated (handshake missing).
     *                    - The cloud endpoint returned non-200.
     *                    - Cloud has no campaign for the id.
     *
     *                    All three log a warning + return null. Callers
     *                    branch on `null === ...` to skip rather than
     *                    propagate the error to Action Scheduler retry.
     */
    public static function get_campaign_data(string $campaign_id): ?array
    {
        if ($campaign_id === '') {
            return null;
        }

        $license     = Key_Manager::get_license_payload();
        $license_key = $license['key']    ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ($license_key === '' || $secret === '') {
            Log_Service::add(
                'warning',
                sprintf('[campaign-cloud-reader] License not activated — cannot fetch campaign %s', $campaign_id),
                0,
                'admin.scheduler'
            );
            return null;
        }

        $result = Cloud_Client::post('/getCampaign', [
            'license_key'       => $license_key,
            'site_url'          => $site_url,
            'activation_secret' => $secret,
            'campaign_id'       => $campaign_id,
        ]);

        if (is_wp_error($result)) {
            Log_Service::add(
                'warning',
                sprintf(
                    '[campaign-cloud-reader] Cloud unreachable for %s: %s',
                    $campaign_id,
                    $result->get_error_message()
                ),
                0,
                'admin.scheduler'
            );
            return null;
        }

        $code = $result['code'] ?? 0;
        if ($code !== 200) {
            $err = $result['body']['error'] ?? 'unknown';
            Log_Service::add(
                'warning',
                sprintf(
                    '[campaign-cloud-reader] Cloud returned %d for %s: %s',
                    $code,
                    $campaign_id,
                    $err
                ),
                0,
                'admin.scheduler'
            );
            return null;
        }

        $cloud_doc = $result['body']['campaign'] ?? null;
        if ( ! is_array($cloud_doc) || empty($cloud_doc)) {
            return null;
        }

        // Same transformer the SPA proxy uses on read paths. Keeps the
        // returned shape exactly aligned with what `Campaign_Repository::
        // get_campaign_data` historically produced — no shape drift.
        return Campaign_Shape_Transformer::cloud_to_wp($cloud_doc);
    }

    /**
     * Apply a partial update to a cloud campaign doc.
     *
     * Used by `Task_Runner` to persist run-time mutations that historically
     * landed in WP post meta (`_posts_published`, `_status`,
     * `_cluster_keywords`) — those columns are owned by cloud once the
     * `structura_campaigns_authoritative_in_cloud` flag is set, and the
     * post_meta writes become silent no-ops because the post id is now a
     * non-numeric nanoid.
     *
     * The patch payload uses cloud (camelCase) field names — callers must
     * pass them directly, not WP-cluster paths. Examples:
     *
     *   Campaign_Cloud_Reader::patch_campaign($id, ['postsPublished' => 12]);
     *   Campaign_Cloud_Reader::patch_campaign($id, ['status' => 'paused']);
     *
     * Best-effort: failures are logged but never thrown. The Action
     * Scheduler retry contract says step handlers should propagate
     * generation errors but tolerate metadata-update flakes — flapping the
     * cloud once shouldn't fail an otherwise-successful publish.
     *
     * @return bool True on 200, false on transport error / non-200.
     */
    public static function patch_campaign(string $campaign_id, array $patch): bool
    {
        if ($campaign_id === '' || empty($patch)) {
            return false;
        }

        $license     = Key_Manager::get_license_payload();
        $license_key = $license['key']    ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ($license_key === '' || $secret === '') {
            Log_Service::add(
                'warning',
                sprintf('[campaign-cloud-reader] License not activated — cannot patch campaign %s', $campaign_id),
                0,
                'admin.scheduler'
            );
            return false;
        }

        $result = Cloud_Client::post('/patchCampaign', [
            'license_key'       => $license_key,
            'site_url'          => $site_url,
            'activation_secret' => $secret,
            'campaign_id'       => $campaign_id,
            'campaign'          => $patch,
        ]);

        if (is_wp_error($result)) {
            Log_Service::add(
                'warning',
                sprintf(
                    '[campaign-cloud-reader] patch_campaign cloud unreachable for %s: %s',
                    $campaign_id,
                    $result->get_error_message()
                ),
                0,
                'admin.scheduler'
            );
            return false;
        }

        $code = $result['code'] ?? 0;
        if ($code !== 200) {
            $err = $result['body']['error'] ?? 'unknown';
            Log_Service::add(
                'warning',
                sprintf(
                    '[campaign-cloud-reader] patch_campaign returned %d for %s: %s',
                    $code,
                    $campaign_id,
                    $err
                ),
                0,
                'admin.scheduler'
            );
            return false;
        }

        return true;
    }
}
