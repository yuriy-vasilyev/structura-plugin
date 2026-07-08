<?php

namespace Structura\Progress;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Local-only run failure tracker for cloud dispatch errors.
 *
 * Why this exists
 * ---------------
 * When `Task_Runner::execute_campaign_step` POSTs to
 * `executeCloudCampaignStep` and the request never reaches the cloud
 * (cURL connect timeout, DNS failure, ngrok tunnel down, the cloud
 * function being mid-redeploy), the cloud never creates a
 * CampaignRunDoc for the run. The plugin's polling loop then asks
 * `getCampaignRun` for that runId on every tick and gets back 404
 * forever. The SPA — which assumes 404 means "not yet primed, keep
 * polling" — sticks at the "Queued" milestone indefinitely.
 *
 * This class records a local sentinel keyed by runId when dispatch
 * fails. The `runs_get` handler reads the sentinel before/alongside
 * the cloud lookup; if the sentinel exists AND the cloud returns 404,
 * the handler returns a synthetic terminal-failed `RunStatusSerialized`
 * payload built from the sentinel. The SPA receives `status: "failed"`
 * and stops polling on its first read.
 *
 * Storage choice
 * --------------
 * Transients, not post meta. Reasons:
 *   - The runId is a UUID, not a post id — there's no obvious post to
 *     attach meta to (the cloud-authoritative campaign is a Firestore
 *     doc, not a WP post).
 *   - Transients have built-in expiry. We don't want failed-dispatch
 *     records living forever; 24 hours is a generous window for a user
 *     to look at a stuck run before it auto-cleans.
 *   - Object cache backends (Redis, Memcached) accelerate transient
 *     lookups when present and gracefully degrade to options table
 *     when absent — same trade-off WP_Object_Cache makes elsewhere.
 *
 * Spec: this maps to the "dispatch-failed sentinel" in the
 * progress-stream invariant — runs that never made it to the cloud
 * still need a terminal state visible to the SPA.
 */
class Dispatch_Failure_Tracker
{
    /**
     * Transient TTL — 24 hours. Long enough for a user to come back
     * the next morning and see why their run failed; short enough that
     * stale failures don't accumulate in `wp_options` indefinitely.
     */
    private const TTL_SECONDS = DAY_IN_SECONDS;

    /**
     * Transient key prefix. Keep the runId encoded into the key so
     * lookups are O(1) without scanning. Prefix matches our other
     * structura_* options for grep-ability.
     */
    private const KEY_PREFIX = 'structura_dispatch_fail_';

    /**
     * Record a dispatch failure for a runId.
     *
     * Called by `Task_Runner::execute_campaign_step` when the
     * `executeCloudCampaignStep` POST returns a WP_Error or non-2xx
     * code. Best-effort: if the transient set fails (object cache
     * down, options table corrupt), we log but don't propagate —
     * a failed sentinel write is annoying but not worse than the
     * status quo of silent polling.
     *
     * @param string $run_id      The cloud-side runId the plugin was attempting to dispatch.
     * @param int    $campaign_id Campaign id for cross-correlation in support.
     * @param string $error       User-safe error message; surfaces in the SPA's failure card.
     * @param string $error_code  Stable machine code; the SPA can branch on it (e.g. show "retry" CTA).
     */
    public static function record(
        string $run_id,
        int $campaign_id,
        string $error,
        string $error_code = 'dispatch_failed'
    ): void {
        if ($run_id === '') {
            return;
        }

        $payload = [
            'runId'       => $run_id,
            'campaignId'  => $campaign_id,
            'error'       => $error,
            'errorCode'   => $error_code,
            // Use UTC ISO8601 to match the cloud's RunStatusSerialized
            // timestamp shape. The synthetic terminal payload reuses
            // this field for both `startedAt` and `endedAt` because
            // we don't know when the cloud would have started — the
            // dispatch never got there.
            'recordedAt'  => gmdate('c'),
        ];

        $ok = set_transient(self::KEY_PREFIX . $run_id, $payload, self::TTL_SECONDS);
        if ( ! $ok && defined('WP_DEBUG') && WP_DEBUG) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated; transient-set failures are environmental (object cache misconfig, disk full) and worth a log line.
            error_log('[structura/dispatch-fail-tracker] failed to set transient for run_id=' . $run_id);
        }
    }

    /**
     * Read a previously-recorded dispatch failure.
     *
     * Returns the stored payload as an associative array, or null if
     * no failure was recorded for this runId (or the transient
     * expired).
     */
    public static function get(string $run_id): ?array
    {
        if ($run_id === '') {
            return null;
        }

        $payload = get_transient(self::KEY_PREFIX . $run_id);
        if ( ! is_array($payload)) {
            return null;
        }

        return $payload;
    }

    /**
     * Clear a recorded failure. Currently unused — left here for the
     * eventual "retry dispatch" surface that would clear the sentinel
     * before re-attempting.
     */
    public static function clear(string $run_id): void
    {
        if ($run_id === '') {
            return;
        }
        delete_transient(self::KEY_PREFIX . $run_id);
    }

    /**
     * Build a synthetic terminal-failed `RunStatusSerialized` payload
     * from a stored failure record. Used by `Rest_Api::runs_get` when
     * the cloud returns 404 for a runId that has a sentinel recorded —
     * we synthesize the cloud's response shape so the SPA's polling
     * loop sees a terminal state on its very next read and stops.
     *
     * The shape mirrors `functions/src/types/shared.ts::RunStatusSerialized`
     * — fields the SPA actually reads:
     *   - `status: "failed"` — the terminal-failure flag the SPA's
     *     `isTerminalRunStatus` predicate checks.
     *   - `currentStep: "error"` — drives the failure-icon avatar in
     *     the timeline + the failure receipt headline.
     *   - `error: { code, userMessage, logRunId }` — the failure card
     *     fields. `logRunId` reuses the runId so the "view logs" link
     *     still resolves to something coherent if the user clicks it
     *     (System Logs may have an entry from the AS dispatcher's
     *     pre-failure logging — the diagnostic chain in
     *     `Task_Runner::execute_campaign_step_jittered` writes one).
     */
    public static function synthesize_failed_run(array $record, string $campaign_name = ''): array
    {
        $run_id      = (string) ($record['runId'] ?? '');
        // Mixed-type: legacy WP-authoritative campaigns have int ids, cloud-
        // authoritative use string nanoids. Casting to int silently zeroed
        // nanoid runs in the failure receipt, breaking the SPA's
        // "back to campaign" link on every cloud-campaign dispatch failure.
        $campaign_id = $record['campaignId'] ?? 0;
        $error       = (string) ($record['error'] ?? 'Dispatch to cloud failed.');
        $error_code  = (string) ($record['errorCode'] ?? 'dispatch_failed');
        $recorded_at = (string) ($record['recordedAt'] ?? gmdate('c'));

        return [
            'success' => true,
            'run'     => [
                'schemaVersion'    => 1,
                'runId'            => $run_id,
                'campaignId'       => $campaign_id,
                'campaignName'     => $campaign_name,
                'status'           => 'failed',
                'currentStep'      => 'error',
                'progressPercent'  => 0,
                'headline'         => 'Generation could not start',
                'subtext'          => $error,
                'startedAt'        => $recorded_at,
                'updatedAt'        => $recorded_at,
                'endedAt'          => $recorded_at,
                'durationMs'       => 0,
                'stepDurationsMs'  => (object) [],
                'error'            => [
                    'code'        => $error_code,
                    'userMessage' => $error,
                    'logRunId'    => $run_id,
                ],
            ],
        ];
    }
}
