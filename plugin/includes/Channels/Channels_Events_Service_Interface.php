<?php

namespace Structura\Channels;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Contract for the WordPress-side proxy that reads the activation's
 * `channelEvents` activity log from the cloud.
 *
 * The activity log is read-only from the plugin's perspective — the cloud
 * dispatcher writes to it every time `channelsPostPublished` runs, and this
 * service fetches the most recent entries for rendering on the Channels
 * Activity page in wp-admin.
 *
 * Implementations MUST:
 *  - Build the same license_key + activation_secret + site_url auth envelope
 *    the connections service uses, so the cloud's shared `authenticate()`
 *    helper accepts it.
 *  - Return a normalized `['events' => [...]]` array on success and a
 *    `WP_Error` on any transport / auth / cloud-reported failure.
 *  - Never let exceptions bubble — REST handlers expect a `WP_Error`, not a
 *    fatal.
 *
 * Spec: specs/integrations-store-spec.md §10
 */
interface Channels_Events_Service_Interface
{
    /**
     * Fetch the activation's most recent channel events from the cloud,
     * newest first. `limit` is a hint — the cloud clamps it against its own
     * hard cap so a pathological value never pulls back the whole log.
     *
     * @param int $limit Desired page size; defaults to 25. Must be positive.
     *
     * @return array{events: array<int, array<string, mixed>>}|\WP_Error
     */
    public function list_events(int $limit = 25);

    /**
     * Retry (or regenerate) a video render job via the cloud
     * `channelsVideoRetry` endpoint. One call serves both Activity-page
     * actions: "Retry render" on a failed job and "Regenerate" on an
     * expired one — the cloud decides quota consumption per case.
     *
     * @since 2.11.0
     *
     * @param string $job_id The video job to (re)queue. Must be non-empty.
     *
     * @return array{success: true, jobId: string}|\WP_Error
     */
    public function retry_video(string $job_id);
}
