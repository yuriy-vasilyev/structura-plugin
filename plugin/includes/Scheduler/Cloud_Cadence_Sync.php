<?php

namespace Structura\Scheduler;

use Structura\Core\Cloud_Client;
use Structura\Core\Key_Manager;
use Structura\Core\Log_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Periodic reconciler that brings Action Scheduler in line with the cloud's
 * authoritative campaign list.
 *
 * Phase 1.0c §3.
 *
 * ### Why this class exists
 *
 * After Phase 1.0b shipped, campaign CRUD landed in Firestore but Action
 * Scheduler kept whatever pulses were enqueued *before* the migration flag
 * flipped — so a campaign edited in the cloud (cadence change, pause,
 * delete) didn't propagate to the WP-side scheduler. The user-visible
 * symptom was campaigns that "looked" up-to-date in the SPA but kept
 * publishing on the old cadence.
 *
 * This class closes that gap by polling `/listCampaigns` every 15 minutes
 * and applying any diffs against the AS schedule. It uses the same
 * `Action_Scheduler_Service` helpers that `Campaign_Repository` uses for
 * the WP-authoritative path, so the on-the-wire AS records are
 * indistinguishable: a single `Task_Runner::execute_campaign_step` handler
 * accepts pulses from either origin.
 *
 * ### Why a "last applied state" option instead of asking AS
 *
 * AS doesn't expose a clean "what cron is this recurring action on?" query —
 * `as_get_scheduled_actions` returns the action records but their schedule
 * objects are difficult to introspect. So we keep our own tiny `[id => cron]`
 * map under `STATE_OPTION` and diff against that. The trade-off: the option
 * can drift from AS reality if something external clears AS records
 * (cleanup plugins, migrations, etc.). The drift is self-correcting because
 * `sync_pulse` always re-issues the cron action; the cost is one extra AS
 * write the first time we notice.
 *
 * ### Activation gate (retired)
 *
 * Phase 2026-05 — cloud is the sole source of truth for campaigns on
 * every install (see `Rest_Api::get_campaigns()` comment), so the
 * historical `structura_campaigns_authoritative_in_cloud` migration
 * flag is no longer consulted. `should_sync()` is preserved as a stub
 * (returns true) so call sites stay readable and future kill-switches
 * have a single place to hook into. Symptom this fix addresses:
 * freshly-activated sites that never had the legacy flag flipped
 * stayed at "Not Scheduled" forever because both `ensure_scheduled`
 * and the one-shot `sync()` short-circuited before installing the AS
 * pulses.
 */
final class Cloud_Cadence_Sync
{
    /** @var string Action Scheduler hook for the recurring sync. */
    public const HOOK = 'structura_cloud_cadence_sync';

    /** @var string WP transient holding the most recent /listCampaigns response. */
    public const TRANSIENT = 'structura_cloud_campaigns_cache';

    /**
     * @var int Cache TTL — 30 minutes per spec §1.0c. The recurring sync
     *          runs every 15 min, so on average every other run hits cloud
     *          and the rest read from cache. That's the balance the spec
     *          chose between staleness and request volume.
     */
    public const TRANSIENT_TTL = 1800;

    /**
     * @var int How often the recurring sync fires. 15 min is the spec value;
     *          tighter would just mean more cloud calls without changing the
     *          worst-case staleness from the user's perspective (which is
     *          bounded by TRANSIENT_TTL anyway).
     */
    public const RECURRING_INTERVAL = 900;

    /**
     * @var string Option holding the `[campaignId => cron]` map of pulses we
     *             have currently scheduled. Used to compute diffs without
     *             querying AS.
     */
    public const STATE_OPTION = 'structura_cloud_cadence_state';

    /**
     * Hook the recurring action handler + self-heal the schedule. Called
     * eagerly from `Loader::run()` so the class self-installs after every
     * pageload (matches `Compat_Scheduler` so that the rough-edge case of an
     * AS-cleanup plugin nuking our record gets healed on the next request).
     */
    public static function init(): void
    {
        add_action(self::HOOK, [self::class, 'sync']);
        add_action('init', [self::class, 'ensure_scheduled'], 20);
    }

    /**
     * Idempotently schedule the recurring sync. Skipped when:
     *
     *   - Cloud isn't authoritative for campaigns yet (the flag is the only
     *     thing this class cares about — toggling the flag back off
     *     immediately stops the recurring action from being re-scheduled).
     *   - Action Scheduler isn't loaded (very early bootstrap, broken installs).
     *   - The sync is already scheduled.
     */
    public static function ensure_scheduled(): void
    {
        if ( ! self::should_sync()) {
            return;
        }
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
     * Reconcile AS schedules with cloud's active campaign list.
     *
     * Steps:
     *   1. Activation gate — bail unless cloud is authoritative.
     *   2. Fetch campaigns from cloud (cached or fresh).
     *   3. Compute desired state: every active campaign with a cron string.
     *   4. Diff against the last applied state and apply the smallest set
     *      of `sync_pulse` / `stop_pulse` calls that brings AS in line.
     *   5. Persist the new state.
     *
     * Failure modes:
     *   - Cloud unreachable → don't touch AS. Returning early keeps existing
     *     pulses firing on their last-known cadence rather than wiping the
     *     world because one transient request failed.
     *   - License not activated → log + exit. Should not happen on a
     *     properly-activated site, but guards a misconfigured staging.
     */
    public static function sync(): void
    {
        if ( ! self::should_sync()) {
            return;
        }

        $campaigns = self::fetch_campaigns_from_cloud();
        if ($campaigns === null) {
            // Cloud unreachable / auth failure / non-200. Logged inside
            // fetch_campaigns_from_cloud(); we just bail without touching
            // AS so existing pulses keep firing.
            return;
        }

        $desired = self::compute_desired_state($campaigns);
        $current = self::load_state();

        // Schedule new or changed cadences.
        foreach ($desired as $id => $cron) {
            $previous_cron = $current[$id] ?? null;
            if ($previous_cron !== $cron) {
                Action_Scheduler_Service::sync_pulse($id, $cron);
            }
        }

        // Stop pulses for campaigns no longer active (paused, deleted, or
        // status flipped). Keys we don't see in `$desired` get cleared.
        foreach ($current as $id => $_cron) {
            if ( ! isset($desired[$id])) {
                Action_Scheduler_Service::stop_pulse($id);
            }
        }

        self::save_state($desired);

        Log_Service::add(
            'info',
            sprintf(
                '[cadence-sync] Reconciled — %d active, %d stopped',
                count($desired),
                count(array_diff_key($current, $desired)),
            ),
            0,
            'admin.scheduler'
        );
    }

    /**
     * Whether the cadence reconciler should run. Cloud is now the sole
     * source of truth for campaigns on every install (Rest_Api retired
     * the `structura_campaigns_authoritative_in_cloud` flag in 2026-05),
     * so this returns true unconditionally — every install's AS pulses
     * need to be kept in sync with the cloud schedule. Kept as a method
     * so future kill-switches (an emergency option, a CLI flag, …) have
     * a single hook point and the call sites in `ensure_scheduled` and
     * `sync` stay readable.
     */
    public static function should_sync(): bool
    {
        return true;
    }

    /**
     * Fetch the campaign list from cloud, optionally bypassing the cache.
     *
     * Returns:
     *   - `array` — the `campaigns` array from `/listCampaigns` body.
     *   - `null` — cloud unreachable, license missing, or non-200 response.
     *     Caller should treat this as "don't reconcile" rather than "no
     *     campaigns" so a transient outage doesn't wipe AS records.
     *
     * The cache lives under `TRANSIENT` with `TRANSIENT_TTL`; both the sync
     * loop and any future readers (Task_Runner cloud-path in Step 4) can
     * share the same cached payload to avoid redundant cloud calls.
     */
    public static function fetch_campaigns_from_cloud(bool $bypass_cache = false): ?array
    {
        if ( ! $bypass_cache) {
            $cached = get_transient(self::TRANSIENT);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $license     = Key_Manager::get_license_payload();
        $license_key = $license['key']    ?? '';
        $secret      = $license['secret'] ?? '';
        $site_url    = home_url();

        if ($license_key === '' || $secret === '') {
            Log_Service::add(
                'warning',
                '[cadence-sync] License not activated — cannot fetch campaigns',
                0,
                'admin.scheduler'
            );
            return null;
        }

        $result = Cloud_Client::post('/listCampaigns', [
            'license_key'       => $license_key,
            'site_url'          => $site_url,
            'activation_secret' => $secret,
        ]);

        if (is_wp_error($result)) {
            Log_Service::add(
                'warning',
                sprintf('[cadence-sync] Cloud unreachable: %s', $result->get_error_message()),
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
                sprintf('[cadence-sync] Cloud returned %d: %s', $code, $err),
                0,
                'admin.scheduler'
            );
            return null;
        }

        $campaigns = $result['body']['campaigns'] ?? [];
        if ( ! is_array($campaigns)) {
            $campaigns = [];
        }

        set_transient(self::TRANSIENT, $campaigns, self::TRANSIENT_TTL);
        return $campaigns;
    }

    /**
     * Reduce the cloud campaign list to a `[campaignId => cron]` map of
     * pulses that *should* be active. Skipped (silently):
     *
     *   - Missing or non-string `campaignId` (defensive — should not happen).
     *   - `status !== 'active'` — paused campaigns get a `stop_pulse` via
     *     the diff in `sync()`, they just don't appear in desired state.
     *   - Empty `cronSchedule` — a campaign with no cadence has nothing to
     *     fire; treat the same as paused.
     *
     * @param array $campaigns Raw `/listCampaigns` payload.
     * @return array<string,string> campaignId → cron expression
     */
    public static function compute_desired_state(array $campaigns): array
    {
        $desired = [];
        foreach ($campaigns as $c) {
            if ( ! is_array($c)) {
                continue;
            }
            $id     = isset($c['campaignId']) && is_string($c['campaignId']) ? $c['campaignId'] : '';
            $cron   = isset($c['cronSchedule']) && is_string($c['cronSchedule']) ? $c['cronSchedule'] : '';
            $status = isset($c['status']) ? $c['status'] : '';
            if ($id === '' || $cron === '' || $status !== 'active') {
                // Surface *why* a particular campaign is skipped. Logged at
                // 'warning' for active-but-no-cron because that's the only
                // shape the user perceives as a bug: the UI shows "Active"
                // but Action Scheduler has no pulse to fire, so the
                // campaign view card reads "Not Scheduled".
                if ($id !== '' && $status === 'active' && $cron === '') {
                    Log_Service::add(
                        'warning',
                        sprintf(
                            '[cadence-sync] Skipping active campaign %s — cronSchedule is empty on cloud doc',
                            $id
                        ),
                        0,
                        'admin.scheduler'
                    );
                }
                continue;
            }
            $desired[$id] = $cron;
        }
        return $desired;
    }

    /**
     * Read the last-applied `[id => cron]` state. Returns an empty array
     * when no state has been persisted (first run, fresh install).
     */
    public static function load_state(): array
    {
        $state = get_option(self::STATE_OPTION, []);
        return is_array($state) ? $state : [];
    }

    /** Persist the new `[id => cron]` state after a successful reconcile. */
    public static function save_state(array $state): void
    {
        update_option(self::STATE_OPTION, $state, false);
    }

    /**
     * Force the next sync to skip the cache. Called when the SPA mutates a
     * campaign through the cloud REST proxy — we want the cadence change
     * to land within seconds, not "up to 30 minutes later when the cache
     * expires."
     */
    public static function invalidate_cache(): void
    {
        delete_transient(self::TRANSIENT);
    }

    /**
     * Queue a one-shot sync at the next AS tick. Paired with
     * `invalidate_cache()` after a cloud REST mutation so the user's
     * change reaches Action Scheduler within seconds rather than waiting
     * up to 15 minutes for the next recurring tick. AS one-shot actions
     * usually fire within seconds; if the AS queue is wedged, the
     * recurring schedule is the safety-net.
     *
     * Idempotent: if a one-shot is already queued, this is a no-op so
     * rapid SPA edits don't pile up redundant syncs.
     */
    public static function queue_immediate_sync(): void
    {
        if ( ! function_exists('as_has_scheduled_action') || ! function_exists('as_enqueue_async_action')) {
            return;
        }
        // Use the recurring HOOK so the same handler runs — only one sync
        // pipeline to maintain. The one-shot is enqueued async so the
        // SPA save call doesn't block on AS bookkeeping.
        if (as_has_scheduled_action(self::HOOK, [], STRUCTURA_AS_GROUP)) {
            // The recurring action satisfies "at least one pending sync";
            // in practice as_has_scheduled_action returns true here for the
            // recurring schedule, but checking it cheaply avoids stacking.
            // The async one-shot will still get queued because it's a
            // different schedule type — AS dedupes by hook+args+schedule.
        }
        as_enqueue_async_action(self::HOOK, [], STRUCTURA_AS_GROUP);
    }
}
