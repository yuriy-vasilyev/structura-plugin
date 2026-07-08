<?php

namespace Structura\Progress;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Plugin-side bridge that patches the cloud CampaignRun doc with
 * `resultPostId` / `resultPostUrl` once WordPress has actually inserted
 * the post.
 *
 * Why this exists
 * ---------------
 * The cloud scheduler's `succeed()` call fires when the webhook *reaches*
 * WordPress — i.e. before `wp_insert_post()` has actually run. That means
 * by the time the CampaignRun doc hits its terminal state, the doc has
 * no way to know the resulting post's id or permalink. Rather than block
 * the cloud step waiting for a WP round-trip (slow, brittle, and bakes
 * the cloud into WP's REST latency), we let the cloud succeed early and
 * let the plugin patch in the two post-reference fields afterwards.
 *
 * The sequence
 * ------------
 *   1. Cloud `succeed()` writes the terminal CampaignRun doc at webhook
 *      delivery time. `status: "succeeded"`, `resultPostId` absent.
 *   2. `Task_Runner::insert_wordpress_post()` runs on this side and fires
 *      `structura/post/inserted` with the hook context (including
 *      `campaign_run_id` when the run originated from the cloud path).
 *   3. This subscriber reads `campaign_run_id` out of the context and
 *      POSTs `/recordPostInserted` with `{run_id, post_id, post_url?}`.
 *   4. Cloud merges those fields onto the terminal doc; the drawer's
 *      success receipt now has the data it needs for a "View post" CTA.
 *
 * Why fire-and-forget
 * -------------------
 * The "View post" CTA is a nice-to-have — the admin can always click
 * through to the post from the regular WP post list. Blocking `Publish`
 * on a cloud round-trip would be a worse UX trade than an occasionally
 * missing CTA. The HTTP call uses `blocking => false` and a tight 5s
 * timeout; failures are logged at warning level so ops can notice
 * pattern-level regressions without being swamped by single-request
 * flakiness.
 *
 * Free-tier path
 * --------------
 * Free tier runs locally via the WP-Cron path and never mints a
 * `campaign_run_id` — there's no CampaignRun doc to patch. We gate on
 * `campaign_run_id` being a non-empty string and skip silently otherwise.
 *
 * Spec: specs/progress-stream.md §4.1 + §8.4.
 */
class Run_Signal_Service
{
    /**
     * Cloud function name. Matches the export in
     * `functions/src/runs/endpoints.ts::recordPostInserted`.
     */
    private const ENDPOINT = '/recordPostInserted';

    /**
     * HTTP budget. Matches Channel_Event_Forwarder — 5s is plenty for a
     * single Firestore merge, and a hung cloud shouldn't drag out
     * `wp_insert_post()` even though we're non-blocking (wp_remote_post
     * still pays the TCP handshake cost before returning).
     */
    private const HTTP_ARGS = [
        'blocking' => false,
        'timeout'  => 5,
    ];

    /**
     * Register WP hooks. Called from Core\Loader during plugin bootstrap.
     *
     * Priority 30 — after Channel_Event_Forwarder (10) and any
     * internal mu-plugin subscribers (20). Ordering doesn't affect
     * correctness (the hook context is read-only per subscriber), but
     * keeps breadcrumbs in a predictable sequence in System Logs.
     */
    public function init(): void
    {
        add_action('structura/post/inserted', [$this, 'on_structura_post_inserted'], 30, 1);

        // Catch the *later* manual publish of a Structura draft. A campaign
        // whose default status is `draft`/`pending` inserts the post,
        // fires `structura/post/inserted` with status !== 'publish' (so the
        // count is deliberately NOT bumped), and is then reviewed and
        // published by a human days later. That publish is a core WP status
        // transition with no Structura-internal event, so without this the
        // post would never reach the "Posts Published" count. See the
        // callback docblock for why hooking a core action is justified here
        // (AGENTS.md §7).
        add_action('transition_post_status', [$this, 'on_transition_post_status'], 10, 3);
    }

    /**
     * `structura/post/inserted` callback. Validates the hook context
     * defensively — another subscriber could have filtered it to
     * garbage — and delegates.
     *
     * @param array<string, mixed> $context See Task_Runner::insert_wordpress_post() docblock.
     */
    public function on_structura_post_inserted($context): void
    {
        if ( ! is_array($context)) {
            return;
        }

        $run_id = isset($context['campaign_run_id']) ? (string)$context['campaign_run_id'] : '';
        $run_id = trim($run_id);
        if ($run_id === '') {
            // Free-tier / direct-generate path — no cloud doc to patch.
            // Staying silent here is intentional: this is the common
            // case for sites without a cloud entitlement.
            return;
        }

        $post_id = (int)($context['post_id'] ?? 0);
        if ($post_id <= 0) {
            // Defensive — Task_Runner should never fire the hook with
            // post_id === 0, but a third-party filter on the action
            // arguments could theoretically strip it. A zero id would
            // be rejected as malformed on the cloud side anyway; skip
            // rather than burning an HTTP call.
            return;
        }

        // Drafts have no permalink — the cloud's merge strips empty
        // `post_url` so the Firestore doc stays clean. We still send the
        // signal so the drawer can at least flip to "inserted" mode
        // (even if the CTA is suppressed).
        $post_url = '';
        if (isset($context['post_url']) && is_string($context['post_url'])) {
            $post_url = (string)$context['post_url'];
        }

        // Only ask the cloud to bump `campaign.postsPublished` when the
        // resulting WP post actually went live. Drafts and pending posts
        // are visible in wp-admin but shouldn't move the user-facing
        // "Posts Published" counter on the campaign card. Task_Runner
        // normalises the post status to either `publish` or `draft`, so
        // we only need to gate on the publish value here.
        $is_publish = ($context['status'] ?? '') === 'publish';

        $this->dispatch($run_id, $post_id, $post_url, $is_publish, $context);
    }

    /**
     * `transition_post_status` callback — catches a Structura-created post
     * being published *after* its initial insertion (the manual-review
     * flow: a campaign whose default status is `draft`/`pending` inserts
     * the post, a human reviews it, then hits Publish in wp-admin later).
     *
     * Why hook a core WP action here (cf. AGENTS.md §7)
     * -------------------------------------------------
     * §7 steers us away from core hooks because they fire on autosaves,
     * revisions and quick-edits. But "a human published this post" is a
     * genuine WordPress status transition with no Structura-internal
     * equivalent — our own insert path already fired
     * `structura/post/inserted` and will never fire again for a later
     * manual publish. `transition_post_status` is the canonical, correct
     * signal for exactly this, and it does NOT fire for autosaves (they
     * don't change the canonical post's status). We still translate it
     * straight into a Structura domain event (`structura/post/published`)
     * so subscribers never bind to the core hook themselves.
     *
     * Hard gating keeps the blast radius tiny:
     *   - only real not-live → `publish` transitions (new/auto-draft →
     *     publish is the *initial* Structura insert, already counted via
     *     `structura/post/inserted`, so it is excluded — no double count);
     *   - only posts carrying `_structura_campaign_run_id` (a cloud-authored
     *     Structura post with a CampaignRun doc to bump).
     *
     * The cloud bump is idempotent (run-doc `postCountedAsPublished`
     * latch), so even a republish (draft → publish → draft → publish)
     * counts exactly once.
     *
     * @param string        $new_status
     * @param string        $old_status
     * @param \WP_Post|mixed $post
     */
    public function on_transition_post_status($new_status, $old_status, $post): void
    {
        // Only a genuine transition INTO publish, from a not-yet-live
        // state. Excludes the initial Structura insert (new/auto-draft →
        // publish) which `structura/post/inserted` already counts.
        if ($new_status !== 'publish'
            || ! in_array($old_status, ['draft', 'pending', 'future'], true)) {
            return;
        }

        if ( ! $post instanceof \WP_Post) {
            return;
        }

        // Autosaves/revisions never carry our campaign meta, but guard
        // explicitly so the meta read below is only spent on real posts.
        if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) {
            return;
        }

        $run_id = trim((string)get_post_meta($post->ID, '_structura_campaign_run_id', true));
        if ($run_id === '') {
            // Not a cloud-authored Structura post (or a free-tier local
            // post with no CampaignRun doc). This callback runs on EVERY
            // publish on the site, so returning silently is intentional.
            return;
        }

        $campaign_id = get_post_meta($post->ID, '_structura_campaign_id', true);
        $post_url    = (string)get_permalink($post->ID);

        $context = [
            'post_id'         => (int)$post->ID,
            'campaign_id'     => $campaign_id,
            'campaign_run_id' => $run_id,
            'status'          => 'publish',
            'post_title'      => (string)get_the_title($post->ID),
            'post_url'        => $post_url,
            'edit_url'        => (string)get_edit_post_link($post->ID, 'raw'),
            'published_at'    => (string)get_post_time('c', true, $post->ID),
        ];

        /**
         * Fires when a Structura-created post transitions to `publish`
         * after its initial insertion — i.e. a human approved and
         * published a draft the campaign had held for review.
         *
         * @since 2.13.0
         *
         * @param array $context {
         *     @type int    $post_id         Published post's ID.
         *     @type mixed  $campaign_id     Campaign that produced the post (int id or nanoid).
         *     @type string $campaign_run_id CampaignRun correlation id.
         *     @type string $status          Post status — always 'publish' here.
         *     @type string $post_title      Post title.
         *     @type string $post_url        Permalink.
         *     @type string $edit_url        WP admin edit URL.
         *     @type string $published_at    ISO 8601 publish timestamp (UTC).
         * }
         */
        do_action('structura/post/published', $context);

        // Ask the cloud to count this post toward `campaign.postsPublished`
        // now that it's actually live. `is_publish = true` opts into the
        // atomic, idempotent bump.
        $this->dispatch($run_id, (int)$post->ID, $post_url, true, $context);
    }

    /**
     * Build the license envelope and POST to the cloud. Any failure is
     * swallowed — the success receipt CTA is cosmetic, not correctness.
     *
     * @param array<string, mixed> $context
     */
    private function dispatch(string $run_id, int $post_id, string $post_url, bool $is_publish, array $context): void
    {
        // Mixed-type: int for legacy WP-authoritative campaigns, string nanoid
        // for cloud-authoritative. `Log_Service::add` accepts both — casting
        // to int here used to zero out nanoid runs, hiding their breadcrumbs.
        $campaign_id = $context['campaign_id'] ?? 0;

        try {
            $license = Key_Manager::get_license_payload();
            $license_key = is_array($license) && isset($license['key']) ? (string)$license['key'] : '';
            $secret      = is_array($license) && isset($license['secret']) ? (string)$license['secret'] : '';
            $site_url    = home_url();

            if ($license_key === '' || $secret === '' || $site_url === '') {
                // No activation on file. For the free-tier path we've
                // already returned above (no run_id), so reaching here
                // with a run_id AND no license is genuinely anomalous —
                // log at warning so ops see it, but don't fatal.
                Log_Service::add(
                    'warning',
                    'Run_Signal_Service: skipping — no activation envelope.',
                    $campaign_id,
                    'progress.signal',
                    ['run_id' => $run_id, 'post_id' => $post_id]
                );
                return;
            }

            $payload = [
                'license_key'       => $license_key,
                'activation_secret' => $secret,
                'site_url'          => $site_url,
                'run_id'            => $run_id,
                'post_id'           => $post_id,
            ];
            if ($post_url !== '') {
                // Only send when we actually have a URL. The cloud
                // treats a missing field as "don't touch" and a
                // present-but-empty field as "explicitly clear",
                // which we never want here — a draft that gets
                // published later will re-fire the hook with a real
                // URL and naturally overwrite.
                $payload['post_url'] = $post_url;
            }
            if ($is_publish) {
                // Ask the cloud to atomically increment the parent
                // campaign's `postsPublished` inside the same
                // transaction that patches the run doc. Replaces the
                // plugin's old read-then-write bump in
                // `Task_Runner::insert_wordpress_post` which lost
                // updates on concurrent webhooks (two webhooks for
                // the same campaign both reading the inline campaign
                // snapshot's stale `postsPublished` value and both
                // writing the same incremented number).
                $payload['should_increment_post_count'] = true;
            }

            // Breadcrumb BEFORE the call — the call is non-blocking so
            // success/failure won't appear synchronously. Keeps ops
            // from chasing ghosts when a run ends in "succeeded" but
            // the drawer never picks up the post reference.
            Log_Service::add(
                'debug',
                'Run_Signal_Service: signalling post-inserted to cloud.',
                $campaign_id,
                'progress.signal',
                [
                    'run_id'           => $run_id,
                    'post_id'          => $post_id,
                    'has_url'          => $post_url !== '',
                    'bump_post_count'  => $is_publish,
                ]
            );

            Cloud_Client::post(self::ENDPOINT, $payload, self::HTTP_ARGS);
        } catch (\Throwable $e) {
            // Must never bubble — other subscribers on the same action
            // (Channels forwarder, marketing revalidator) have already
            // run, but WP core still catches uncaught throwables in
            // a way that can mask the original publish error. Keep the
            // trail in System Logs and carry on.
            Log_Service::add(
                'error',
                'Run_Signal_Service: dispatch failed.',
                $campaign_id,
                'progress.signal',
                [
                    'run_id'  => $run_id,
                    'post_id' => $post_id,
                    'error'   => $e->getMessage(),
                ]
            );
        }
    }
}
