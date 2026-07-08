<?php

namespace Structura\Channels;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\License_Manager;
use Structura\Core\Log_Service;
use Structura\Core\Public_Site_Profile;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Forwards Structura-generated post events to the cloud Channels dispatcher.
 *
 * This is the only PHP-side surface for the Integrations Store — everything
 * else (token storage, OAuth, channel adapters, AI adaptation) lives in
 * `functions/src/channels/`.
 *
 * Hook subscription
 * -----------------
 * Subscribes to `structura/post/inserted` (fired inside Task_Runner after a
 * successful `wp_insert_post`) — NOT to WP core's `save_post` /
 * `wp_after_insert_post`. Reasons:
 *
 *   - Core `save_post` fires on every autosave, revision, and block-editor
 *     heartbeat save. Using a Structura-owned hook means the forwarder only
 *     ever sees posts the plugin deliberately created.
 *   - We don't need the `_structura_campaign_id` meta as a gate — the hook
 *     itself is the gate, so any post that reaches us is guaranteed to be
 *     one of ours.
 *   - Structure of the hook context is a stable contract the cloud relies
 *     on; we own it end-to-end, so payload drift can't come from WP internals
 *     changing.
 *
 * Spec: specs/integrations-store-spec.md §3, §7, §10
 */
class Channel_Event_Forwarder implements Channel_Event_Forwarder_Interface
{
    /**
     * Cloud endpoint the dispatcher listens on.
     * See functions/src/channels/endpoints/post-published.ts.
     */
    private const ENDPOINT = '/channelsPostPublished';

    /**
     * Register WP hooks. Called from Core\Loader during plugin bootstrap.
     *
     * Listens on the Structura-internal post/inserted action so we don't need
     * to filter core `save_post` noise or re-check "is this one of ours?".
     */
    public function init(): void
    {
        add_action('structura/post/inserted', [$this, 'on_structura_post_inserted'], 10, 1);
    }

    /**
     * `structura/post/inserted` action callback. Validates the hook context
     * shape defensively (another subscriber could filter it to garbage) and
     * delegates to the interface method.
     *
     * @param array<string, mixed> $context See Task_Runner::insert_wordpress_post() docblock.
     */
    public function on_structura_post_inserted($context): void
    {
        if ( ! is_array($context)) {
            return;
        }
        $post_id = (int)($context['post_id'] ?? 0);
        if ($post_id <= 0) {
            return;
        }

        // Entry-point breadcrumb — pinned BEFORE any gating so the admin
        // Logs page can confirm the hook actually reached the forwarder.
        // The earlier "Forwarded post event…" line only fires AFTER the
        // license + payload gates, which left a blind spot when nothing
        // showed up cloud-side: we couldn't tell whether the hook never
        // ran, the license check rejected, or the cloud rejected.
        // (cms.xerx.io 2026-05-21: zero cloud-side invocations on a
        // stock-served post that the SPA confirmed inserted.)
        Log_Service::add(
            'info',
            'Channel_Event_Forwarder: hook fired.',
            $context['campaign_id'] ?? 0,
            'channels.forward',
            [
                'post_id'     => $post_id,
                'campaign_id' => $context['campaign_id'] ?? null,
                'status'      => $context['status'] ?? null,
                'run_id'      => $context['campaign_run_id'] ?? '',
            ]
        );

        $this->forward_post_event($context);
    }

    /**
     * @inheritDoc
     */
    public function forward_post_published(int $post_id): void
    {
        // Back-compat entry point retained for callers / tests that still
        // invoke the forwarder imperatively. Re-builds a minimal context
        // from post meta and delegates.
        //
        // `_structura_campaign_id` is mixed-type: int post id for legacy
        // WP-authoritative installs, string nanoid/UUID for cloud-
        // authoritative (post-Phase-1.0c). Casting to int silently
        // zeroes the nanoid case — which made the cloud see
        // `campaign_id: 0`, fail to match any connection's
        // `boundCampaignIds` filter, and log a `resolvedCount: 0`
        // event with no LinkedIn post.
        $campaign_id = get_post_meta($post_id, '_structura_campaign_id', true);
        if ($campaign_id === '' || $campaign_id === null || $campaign_id === 0 || $campaign_id === '0') {
            return;
        }
        $post_status = get_post_field('post_status', $post_id);
        $status      = ($post_status === 'publish') ? 'publish' : 'draft';
        // Public-facing URL (rewritten through Public_Site_Profile in
        // headless mode). Channel adapters share this URL on social /
        // ping it on IndexNow / put it in webhook bodies — must point
        // at the front-end origin readers visit, not the WP origin.
        $public_url = Public_Site_Profile::load()->permalink_for_post($post_id);
        // Pick up the run id that produced this post so the cloud can
        // close the loop on the run doc (writes back the dispatcher's
        // resolved-connection count once fan-out completes — see
        // `channels` milestone on the SPA timeline). May be empty for
        // posts inserted outside Structura's normal pipeline.
        $campaign_run_id = (string)get_post_meta($post_id, '_structura_campaign_run_id', true);
        $this->forward_post_event([
            'post_id'         => $post_id,
            'campaign_id'     => $campaign_id,
            'campaign_run_id' => $campaign_run_id,
            'status'          => $status,
            'post_title'      => (string)get_the_title($post_id),
            'post_url'        => $status === 'publish' ? ($public_url !== '' ? $public_url : null) : null,
            'edit_url'        => (string)get_edit_post_link($post_id, 'raw'),
            'published_at'    => $status === 'publish' ? (get_post_time('c', true, $post_id) ?: null) : null,
            'locale'          => (string)get_locale(),
        ]);
    }

    /**
     * Core dispatch path. Takes the hook context verbatim, gates on license
     * status, builds the wire payload, and posts it to the cloud.
     *
     * @param array<string, mixed> $context
     */
    private function forward_post_event(array $context): void
    {
        $post_id = (int)($context['post_id'] ?? 0);
        // Preserve campaign_id's native type (int for legacy WP-authoritative,
        // string nanoid/UUID for cloud-authoritative) — see the docblock on
        // `forward_post_published()` for why the int cast was the bug. The
        // cloud endpoint accepts `number | string`, and Log_Service::add
        // coerces non-numeric strings to 0 for the int storage column.
        $campaign_id = $context['campaign_id'] ?? 0;

        try {
            // The only remaining gate is licensing — the hook guarantees the
            // post is ours, but Channels entitlement is enforced server-side
            // and a site with no license at all shouldn't even attempt the
            // cloud hop.
            if ( ! License_Manager::is_licensed()) {
                // Was previously a silent return. Surface the early-exit
                // path so the admin Logs page shows why the hook fired
                // without a downstream cloud call — this was the
                // unobservable branch behind the 2026-05-21 triage.
                Log_Service::add(
                    'warning',
                    'Channel_Event_Forwarder: skipped — site is not licensed.',
                    $campaign_id,
                    'channels.forward',
                    ['post_id' => $post_id]
                );
                return;
            }

            $payload = $this->build_payload($context);
            if ($payload === null) {
                // No license secret on file yet, or the site URL hasn't been
                // configured. Same observability fix as the unlicensed
                // branch — surface the early-exit so we know *why* nothing
                // reached the cloud. `build_payload` returns null when
                // `key` / `secret` / `home_url()` is missing; the log
                // line carries which one so triage doesn't need to grep.
                $license          = Key_Manager::get_license_payload();
                $missing_key      = empty($license['key'] ?? '');
                $missing_secret   = empty($license['secret'] ?? '');
                $missing_site_url = home_url() === '';
                Log_Service::add(
                    'warning',
                    'Channel_Event_Forwarder: skipped — incomplete auth envelope.',
                    $campaign_id,
                    'channels.forward',
                    [
                        'post_id'          => $post_id,
                        'missing_key'      => $missing_key,
                        'missing_secret'   => $missing_secret,
                        'missing_site_url' => $missing_site_url,
                    ]
                );
                return;
            }

            // Pre-call breadcrumb so we can pair every call site against
            // the dispatcher's cloud-side log line — operators triaging
            // "channels didn't fan out" can confirm the plugin actually
            // attempted the request.
            Log_Service::add(
                'info',
                'Forwarded post event to Channels dispatcher.',
                $campaign_id,
                'channels.forward',
                [
                    'post_id'  => $post_id,
                    'status'   => $payload['status'] ?? null,
                    'post_url' => $payload['post_url'] ?? null,
                ]
            );

            // Blocking with a 25-second timeout. The cloud's social-adapt
            // step (AI call + LinkedIn / X dispatch + image upload) plus a
            // potential Cloud Functions cold start can comfortably push
            // total dispatch time past 5s — cms.xerx.io 2026-05-21 saw the
            // cloud complete in ~7s while the plugin reported "Channels
            // dispatcher call failed at transport." The cloud's request
            // budget on `receive_cloud_blueprint` is ~30s, so 25s here
            // gives the dispatcher headroom for the longest realistic
            // case (cold start + adapt + image upload + LinkedIn post)
            // while still leaving ~5s for the WP-side post-insert
            // overhead the caller already paid for.
            //
            // We deliberately stay BLOCKING (was `blocking => false`
            // pre-2026-05-20). Non-blocking POSTs on PHP-FPM hosts get
            // silently dropped when the worker tears down before the
            // background socket flushes — the original "no cloud
            // invocations" bug. The trade-off is the cloud→plugin
            // webhook (`receive_cloud_blueprint`) waits a few extra
            // seconds before returning 200, which is fine: that path
            // already budgets for the WP-side insert.
            $result = Cloud_Client::post(self::ENDPOINT, $payload, [
                'blocking' => true,
                'timeout'  => 25,
            ]);

            if (is_wp_error($result)) {
                Log_Service::add(
                    'warning',
                    'Channels dispatcher call failed at transport.',
                    $campaign_id,
                    'channels.forward',
                    [
                        'post_id' => $post_id,
                        'error'   => $result->get_error_message(),
                    ]
                );
            } else {
                $code = is_array($result) ? (int)($result['code'] ?? 0) : 0;
                $body_resolved = is_array($result) && is_array($result['body'] ?? null)
                    ? (isset($result['body']['resolvedCount']) ? (int)$result['body']['resolvedCount'] : null)
                    : null;
                Log_Service::add(
                    $code >= 200 && $code < 300 ? 'info' : 'warning',
                    'Channels dispatcher responded.',
                    $campaign_id,
                    'channels.forward',
                    [
                        'post_id'        => $post_id,
                        'http_code'      => $code,
                        'resolved_count' => $body_resolved,
                    ]
                );
            }
        } catch (\Throwable $e) {
            // Swallow — never let a forwarder failure break post save.
            Log_Service::add(
                'error',
                'Channel_Event_Forwarder: forward failed',
                $campaign_id,
                'channels.forward',
                ['post_id' => $post_id, 'error' => $e->getMessage()]
            );
        }
    }

    /**
     * Build the cloud payload from the hook context. We deliberately do NOT
     * send the full post content — the dispatcher fetches it on demand (or
     * via REST callback) so we keep the WP→cloud hop small and PII-light.
     *
     * Auth model matches the rest of the cloud surface
     * (see executeCloudCampaignStep, syncPluginVersion):
     *   licenseKey + domain → activationSecret round-trip on the cloud side.
     * No HMAC, no per-event signing — same trust envelope as every other
     * Structura cloud call.
     *
     * Returns null when we can't build a complete payload (no secret on file
     * yet, no site URL, etc.). Callers should treat null as "skip silently."
     *
     * @param array<string, mixed> $context Hook context from structura/post/inserted.
     *
     * @return array<string, mixed>|null
     */
    private function build_payload(array $context): ?array
    {
        $license = Key_Manager::get_license_payload();

        $license_key = $license['key'] ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ($license_key === '' || $secret === '' || $site_url === '') {
            return null;
        }

        // Normalize status one last time here so the cloud contract is tight
        // regardless of what another subscriber filtered the context to.
        $status_raw = isset($context['status']) ? (string)$context['status'] : '';
        $status     = $status_raw === 'publish' ? 'publish' : 'draft';

        // Enrich the payload with the post's adapt-relevant context so the
        // cloud's social-copy adapt step (LinkedIn / X) doesn't have to
        // round-trip back to WP. All four fields are best-effort: when a
        // post wasn't produced by Structura's normal pipeline (e.g. legacy
        // meta-box flows) the metas are empty and the cloud falls through
        // to the title-only fallback exactly as before. The plugin already
        // has every field locally — sending them inline avoids an extra
        // Firestore read per dispatch.
        $post_id = (int)($context['post_id'] ?? 0);
        $excerpt = $post_id > 0 ? trim((string)get_post_field('post_excerpt', $post_id)) : '';
        $featured_image_url = '';
        if ($post_id > 0) {
            $thumb_id = (int)get_post_thumbnail_id($post_id);
            if ($thumb_id > 0) {
                $featured_image_url = (string)wp_get_attachment_image_url($thumb_id, 'full');
            }
        }
        // `_structura_target_keyword` is stamped by Task_Runner →
        // apply_post_metadata and refreshed by the meta-box "Update keyword"
        // flow. Falls back to empty when the campaign didn't use the keyword
        // bank — the adapt prompt treats the field as a soft hint, not a
        // requirement.
        $primary_keyword = $post_id > 0
            ? (string)get_post_meta($post_id, '_structura_target_keyword', true)
            : '';
        // Persona name is denormalized on the post via the campaign
        // identity. Older posts may not have it; the prompt copes by
        // omitting the persona instruction when the field is empty.
        $persona_name = $post_id > 0
            ? (string)get_post_meta($post_id, '_structura_persona_name', true)
            : '';

        return [
            'event'             => 'post_published',
            'license_key'       => $license_key,
            'activation_secret' => $secret,
            'site_url'          => $site_url,
            'post_id'           => $post_id,
            // Send mixed-type campaign_id verbatim. Cloud `post-published.ts`
            // accepts `number | string` and uses it both for `boundCampaignIds`
            // filtering and as the dispatcher event key — coercing to int
            // here would zero out cloud-side UUIDs before the resolver ever
            // sees them.
            'campaign_id'       => $context['campaign_id'] ?? 0,
            // Run id is optional — empty string when the post wasn't
            // produced by a Structura run (legacy meta-box paths, third-
            // party hooks). The cloud only reads it to patch the run
            // doc with `channelsResolvedCount`; missing means "no run
            // to patch", which is fine for fan-out.
            'run_id'            => (string)($context['campaign_run_id'] ?? ''),
            'status'            => $status,
            'post_url'          => $context['post_url'] ?? null,
            'post_title'        => (string)($context['post_title'] ?? ''),
            'edit_url'          => (string)($context['edit_url'] ?? ''),
            'published_at'      => $context['published_at'] ?? null,
            'locale'            => (string)($context['locale'] ?? ''),
            // Social-adapt context. Optional on the cloud side — older
            // forwarder builds that don't send these fields fall through
            // to the title-only "${title}\n\n${url}" composition, same as
            // pre-adapt behaviour.
            'excerpt'             => $excerpt,
            'featured_image_url'  => $featured_image_url,
            'primary_keyword'     => $primary_keyword,
            'persona_name'        => $persona_name,
        ];
    }
}
