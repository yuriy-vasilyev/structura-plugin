<?php

namespace Structura\Channels;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Contract for forwarding WordPress post lifecycle events to Structura Cloud
 * so the Channels dispatcher can fan them out to connected integrations
 * (LinkedIn, IndexNow, Slack/Discord, etc.).
 *
 * The plugin side stays intentionally thin: it observes WP events, filters
 * for Structura-generated posts, and POSTs a minimal payload to the cloud.
 * All channel-specific logic (token refresh, AI adaptation, retries)
 * lives in `functions/src/channels/`.
 *
 * Spec: specs/integrations-store-spec.md §3, §7, §10
 */
interface Channel_Event_Forwarder_Interface
{
    /**
     * Forward a "post published" event to the cloud dispatcher.
     *
     * Implementations MUST:
     *  - Be safe to call from WP hooks (no exceptions allowed to bubble).
     *  - No-op for posts that aren't Structura-generated
     *    (i.e. no `_structura_campaign_id` post meta).
     *  - No-op when the site is unlicensed or has no Channels add-on.
     *  - Use a non-blocking HTTP request so the editor save isn't slowed.
     *
     * @param int $post_id WordPress post ID that just transitioned to "publish".
     */
    public function forward_post_published(int $post_id): void;
}
