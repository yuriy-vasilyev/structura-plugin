<?php

namespace Structura\Scheduler;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Polling-delivery fallback — pulls posts the cloud couldn't push.
 *
 * ### Why this class exists
 *
 * Structura delivers generated posts cloud → plugin by POSTing the blueprint
 * to this site's webhook (`/structura/v1/webhook/receive-blueprint`). On shared
 * hosts (SiteGround et al.) a firewall / security plugin / cache intercepts
 * that inbound POST — it answers with HTML while the plugin never runs — or the
 * site is unreachable for inbound calls. The first paying customer (Jason) hit
 * exactly this: the webhook was intercepted and the run failed with nothing to
 * show.
 *
 * Telling the user to allow-list the endpoint is unreliable (most bounce rather
 * than call their host). So the cloud now detects a blocked delivery, persists
 * the deliverable, and parks the run in `awaiting_pull`. This poller inverts the
 * direction: the plugin already talks OUTBOUND to the cloud to START every run,
 * and outbound is rarely what hosts block — so we PULL the parked post instead
 * of waiting for a push that will never arrive.
 *
 * ### The sequence
 *
 *   1. `listPendingDeliveries` → run ids parked for this site (empty = nothing
 *      to do, the common case — webhook delivery handles things normally).
 *   2. `getDeliverable` → the (HMAC-signed) blueprint, verified with the SAME
 *      `verify_webhook_signature` the webhook receiver uses.
 *   3. `Task_Runner::apply_blueprint` → the IDENTICAL insert path the webhook
 *      receiver runs, including the `campaign_run_id` idempotency guard.
 *   4. `ackDeliverable` → the cloud promotes the run to `succeeded` and drops
 *      the deliverable so it isn't offered again.
 *
 * ### Safety
 *
 * `apply_blueprint` is idempotent on `campaign_run_id`, so pulling a post the
 * webhook actually managed to insert (response eaten by the host) is a no-op,
 * not a duplicate. A pull that fails before ack leaves the deliverable pending
 * and is retried on the next tick.
 *
 * Spec: specs/integrations-store-spec.md (webhook-delivery fallback).
 */
final class Delivery_Poller
{
    /** @var string Action Scheduler hook for the recurring poll. */
    public const HOOK = 'structura_delivery_poll';

    /**
     * @var int How often the poll fires. 3 min keeps backup-delivered posts
     *          reasonably fresh without hammering the cloud — the poll is a
     *          no-op (one cheap `listPendingDeliveries` call) on the vast
     *          majority of sites whose webhook works.
     */
    public const RECURRING_INTERVAL = 180;

    /** @var string Log channel for this subsystem. */
    private const LOG_CHANNEL = 'scheduler.delivery_poll';

    /**
     * Hook the recurring handler + self-heal the schedule. Called eagerly from
     * `Loader::run()` so the poll re-installs after every pageload (matching
     * `Cloud_Cadence_Sync`) — an AS-cleanup plugin nuking the record gets
     * healed on the next request.
     */
    public static function init(): void
    {
        add_action(self::HOOK, [self::class, 'poll']);
        add_action('init', [self::class, 'ensure_scheduled'], 20);
    }

    /** Idempotently schedule the recurring poll. */
    public static function ensure_scheduled(): void
    {
        if ( ! function_exists('as_has_scheduled_action') || ! function_exists('as_schedule_recurring_action')) {
            return;
        }
        if (as_has_scheduled_action(self::HOOK, [], STRUCTURA_AS_GROUP)) {
            return;
        }
        as_schedule_recurring_action(
            time() + MINUTE_IN_SECONDS,
            self::RECURRING_INTERVAL,
            self::HOOK,
            [],
            STRUCTURA_AS_GROUP,
        );
    }

    /**
     * Queue a one-shot poll at the next AS tick. Used when the SPA observes a
     * run sitting in `awaiting_pull` so a foreground run lands within seconds
     * rather than waiting up to {@see RECURRING_INTERVAL} for the next tick.
     * Idempotent enough for the use — AS dedupes async actions by hook+args.
     */
    public static function queue_immediate_poll(): void
    {
        if ( ! function_exists('as_enqueue_async_action')) {
            return;
        }
        as_enqueue_async_action(self::HOOK, [], STRUCTURA_AS_GROUP);
    }

    /**
     * Pull and apply every deliverable parked for this site. Best-effort per
     * deliverable — one failure never blocks the others, and a failed pull is
     * left pending for the next tick.
     */
    public static function poll(): void
    {
        $license     = Key_Manager::get_license_payload();
        $license_key = is_array($license) ? ($license['key'] ?? '') : '';
        if ($license_key === '') {
            // Not activated — nothing to pull. (Free/None installs that never
            // delegate to cloud also land here.)
            return;
        }

        $result = Cloud_Client::post('/listPendingDeliveries', []);
        if (is_wp_error($result)) {
            // Cloud unreachable — try again next tick. Logged at debug to
            // avoid noise on every transient blip; a persistent outage shows
            // up elsewhere (cadence sync, dispatch).
            return;
        }

        $code = $result['code'] ?? 0;
        if ($code !== 200) {
            // 426 update-required is handled centrally by Cloud_Client; any
            // other non-200 means an older cloud without this endpoint, in
            // which case there's simply nothing to pull. No-op.
            return;
        }

        $deliveries = $result['body']['deliveries'] ?? [];
        if ( ! is_array($deliveries) || empty($deliveries)) {
            return;
        }

        $runner = new Task_Runner();
        foreach ($deliveries as $delivery) {
            if ( ! is_array($delivery)) {
                continue;
            }
            $run_id = isset($delivery['run_id']) && is_string($delivery['run_id'])
                ? sanitize_text_field($delivery['run_id'])
                : '';
            if ($run_id === '') {
                continue;
            }
            self::pull_one($runner, $run_id);
        }
    }

    /**
     * Fetch one deliverable, verify its signature, apply it, and acknowledge.
     *
     * @param Task_Runner $runner Reused across the batch.
     * @param string      $run_id Run id from `listPendingDeliveries`.
     */
    private static function pull_one(Task_Runner $runner, string $run_id): void
    {
        $resp = Cloud_Client::post('/getDeliverable', ['run_id' => $run_id]);
        if (is_wp_error($resp)) {
            Log_Service::add(
                'warning',
                sprintf('[delivery-poll] Cloud unreachable fetching deliverable %s: %s', $run_id, $resp->get_error_message()),
                0,
                self::LOG_CHANNEL
            );
            return;
        }

        $code = $resp['code'] ?? 0;
        if ($code === 404) {
            // Already acked/expired/never parked — stop chasing it.
            return;
        }
        if ($code !== 200) {
            return;
        }

        $body        = is_array($resp['body'] ?? null) ? $resp['body'] : [];
        $payload_str = isset($body['payload']) && is_string($body['payload']) ? $body['payload'] : '';
        $signature   = isset($body['signature']) && is_string($body['signature']) ? $body['signature'] : '';
        if ($payload_str === '' || $signature === '') {
            return;
        }

        // Verify against the EXACT payload string the cloud signed — same HMAC
        // path the webhook receiver uses. A forged/tampered deliverable is
        // refused rather than inserted.
        if ( ! $runner->verify_webhook_signature($payload_str, $signature)) {
            Log_Service::add(
                'error',
                sprintf('[delivery-poll] Signature mismatch for deliverable %s — refusing to apply.', $run_id),
                0,
                self::LOG_CHANNEL
            );
            return;
        }

        $payload = json_decode($payload_str, true);
        if ( ! is_array($payload)) {
            Log_Service::add(
                'error',
                sprintf('[delivery-poll] Malformed deliverable payload for %s.', $run_id),
                0,
                self::LOG_CHANNEL
            );
            return;
        }

        try {
            $result = $runner->apply_blueprint($payload);
        } catch (\Throwable $e) {
            // Leave the deliverable pending; the next tick retries. Idempotency
            // on campaign_run_id makes a partial-then-retry safe.
            Log_Service::add(
                'error',
                sprintf('[delivery-poll] Failed to apply deliverable %s: %s', $run_id, $e->getMessage()),
                0,
                self::LOG_CHANNEL
            );
            return;
        }

        // Acknowledge so the cloud promotes the run to succeeded and deletes
        // the deliverable. (Post id + bump are owned by the post-inserted hook
        // → recordPostInserted, which `apply_blueprint` already fired.)
        $ack = ['run_id' => $run_id, 'post_id' => $result['post_id']];
        if ( ! empty($result['image_failures'])) {
            $ack['image_failures'] = $result['image_failures'];
        }
        Cloud_Client::post('/ackDeliverable', $ack);

        Log_Service::add(
            'success',
            sprintf('[delivery-poll] Delivered post %d via backup pull (run %s).', $result['post_id'], $run_id),
            0,
            self::LOG_CHANNEL
        );
    }
}
