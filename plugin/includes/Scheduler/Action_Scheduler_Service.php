<?php

namespace Structura\Scheduler;

/**
 * Thin wrapper around Action Scheduler for Structura campaign heartbeats.
 *
 * `$campaign_id` flows through here as either an `int` (legacy WP post id,
 * used by sites still on the WP-authoritative path) or a `string` (cloud
 * nanoid, used once Phase 1.0c plugin-side adoption ships). The wrapper
 * doesn't care which — it just stuffs the value into the AS args dict and
 * lets AS handle equality matching when locating actions to unschedule.
 *
 * Why `int|string` rather than coercing one direction here:
 *
 *   - Coercing nanoid strings to int would silently zero them
 *     ((int) 'abc123' === 0) and one campaign's pulse would shadow every
 *     other campaign's pulse — a class of bug we already paid for once
 *     during the Persona_Shape_Transformer migration.
 *   - Coercing legacy ints to string would break in-flight AS records
 *     enqueued before this PR shipped (their args store `int` literals
 *     and AS uses strict comparison when matching). Sites mid-migration
 *     would lose the ability to unschedule pre-upgrade pulses cleanly.
 *
 * Spec: specs/v2/cloud-pregeneration-and-model-catalog.md §1.0c.
 */
class Action_Scheduler_Service
{
    /**
     * Synchronizes the campaign heartbeat.
     *
     * By passing the campaign_id in the args array, we ensure that
     * unscheduling ONLY affects this specific campaign.
     *
     * @param int|string $campaign_id Legacy WP post id (int) or cloud nanoid (string).
     * @param string     $cron        Standard 5-field cron expression.
     */
    public static function sync_pulse($campaign_id, string $cron): void
    {
        if ( ! function_exists('as_unschedule_all_actions')) {
            return;
        }

        // Target only THIS campaign's actions
        $args = ['campaign_id' => $campaign_id];

        // 1. Clear existing pulses and any pending jittered actions for THIS campaign
        as_unschedule_all_actions('structura_run_campaign_step', $args, STRUCTURA_AS_GROUP);
        as_unschedule_all_actions('structura_run_campaign_step_jittered', $args, STRUCTURA_AS_GROUP);

        // 2. Schedule new pulse
        as_schedule_cron_action(
            time(),
            $cron,
            'structura_run_campaign_step',
            $args,
            STRUCTURA_AS_GROUP,
        );
    }

    /**
     * Completely stops all heartbeat pulses for a campaign.
     * Use this when pausing, deleting, or when a campaign finishes its lifecycle.
     *
     * Also clears any pending jittered one-shot actions so they don't fire
     * after the campaign has been stopped.
     *
     * @param int|string $campaign_id Legacy WP post id (int) or cloud nanoid (string).
     */
    public static function stop_pulse($campaign_id): void
    {
        // Safety check for Action Scheduler
        if ( ! function_exists('as_unschedule_all_actions')) {
            return;
        }

        $args = ['campaign_id' => $campaign_id];

        // Clear the recurring cron pulse
        as_unschedule_all_actions(
            'structura_run_campaign_step',
            $args,
            STRUCTURA_AS_GROUP,
        );

        // Clear any pending jittered one-shot actions
        as_unschedule_all_actions(
            'structura_run_campaign_step_jittered',
            $args,
            STRUCTURA_AS_GROUP,
        );
    }

    /**
     * Checks if a specific campaign has a heartbeat currently scheduled.
     *
     * @param int|string $campaign_id Legacy WP post id (int) or cloud nanoid (string).
     */
    public static function is_pulse_active($campaign_id): bool
    {
        $actions = as_get_scheduled_actions([
            'hook'     => 'structura_run_campaign_step',
            'args'     => ['campaign_id' => $campaign_id],
            'status'   => \ActionScheduler_Store::STATUS_PENDING,
            'per_page' => 1,
        ]);

        return ! empty($actions);
    }

    /**
     * Stops every queued + recurring campaign action regardless of
     * campaign_id. Called from `License_Manager::deactivate()` so the
     * site doesn't keep firing campaign work after disconnect — which
     * is especially load-bearing for the disconnect-then-reconnect-
     * with-a-different-license flow:
     *
     *   1. License A is disconnected; bearer revoked cloud-side.
     *   2. The user activates License B (different key, different
     *      cloud workspace).
     *   3. Pre-cleanup, Action Scheduler entries enqueued under
     *      License A keep firing on their original cadence. Each call
     *      hits the cloud with License B's fresh bearer, the cloud
     *      looks up the campaign in License B's workspace, finds
     *      nothing (those campaigns live in License A's workspace),
     *      and the run silently 404s. From the operator's point of
     *      view nothing visibly breaks, but the Cloud Logs view fills
     *      up with "campaign not found" noise and ops can't tell stale
     *      work apart from real failures.
     *
     * Passing an empty `args` array means "match any args" per Action
     * Scheduler's matcher (every campaign id gets cleared in one shot).
     * Same `structura_run_campaign_step` + `_jittered` hook pair the
     * per-campaign `stop_pulse()` clears.
     *
     * Plugin-wide hooks that are NOT tied to a license stay registered:
     *   - `structura_cloud_cadence_sync` (re-arms itself on init and is
     *     idempotent when the cloud call fails for lack of bearer).
     *   - `structura_compat_recheck`     (page-builder detection).
     *   - `structura_prune_logs`         (admin maintenance).
     */
    public static function stop_all_campaign_pulses(): void
    {
        if ( ! function_exists('as_unschedule_all_actions')) {
            return;
        }

        // Empty args = wildcard match per AS docs. Both hooks are
        // cleared so jittered one-shots can't fire after the recurring
        // pulse is gone.
        as_unschedule_all_actions('structura_run_campaign_step', [], STRUCTURA_AS_GROUP);
        as_unschedule_all_actions('structura_run_campaign_step_jittered', [], STRUCTURA_AS_GROUP);
    }
}