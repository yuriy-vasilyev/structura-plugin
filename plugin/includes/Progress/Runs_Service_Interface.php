<?php

namespace Structura\Progress;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Contract for the plugin-side proxy that reads a CampaignRun doc from the
 * cloud. One call, one doc — the progress drawer polls this every couple of
 * seconds while a generation run is in flight.
 *
 * Implementations MUST:
 *  - Build the standard license_key + activation_secret + site_url auth
 *    envelope (same shape as the channels services), so the cloud's shared
 *    authenticate() helper accepts it.
 *  - Return a normalized `['run' => [...]]` array on success and a
 *    `WP_Error` on any transport / auth / cloud-reported failure.
 *  - Never let exceptions bubble — REST handlers expect a `WP_Error`, not a
 *    fatal.
 *  - Map the cloud's 404 bodies (today only `run_not_found`) back to
 *    WP_Errors with the original code preserved so the UI layer can
 *    branch on them.
 *
 * Spec: specs/progress-stream.md §7.
 */
interface Runs_Service_Interface
{
    /**
     * Fetch a single CampaignRun doc by `runId`.
     *
     * @param string $run_id Opaque UUID minted by the cloud scheduler.
     *
     * @return array{run: array<string, mixed>}|\WP_Error
     */
    public function get_run(string $run_id);

    /**
     * List runs that need attention — failed + succeeded_with_warnings
     * runs that haven't been acknowledged yet, newest first.
     *
     * Powers the Needs Attention widget on the Overview dashboard
     * (spec `specs/run-detail-view.md` §6). The cloud caps server-side
     * at 50; the widget caps visually at 10.
     *
     * @param int $limit Soft request hint; cloud clamps to 1..50.
     *
     * @return array{runs: array<int, array<string, mixed>>}|\WP_Error
     */
    public function list_attention_runs(int $limit = 50);

    /**
     * Mark a run as acknowledged ("dismissed") in the widget.
     *
     * Idempotent — repeated calls simply refresh the timestamp. The
     * dismissing admin's WP user id is captured for support context.
     *
     * @param string $run_id Run to acknowledge.
     * @param int    $user_id WordPress user id of the clicker.
     *
     * @return array{success: true}|\WP_Error
     */
    public function acknowledge_run(string $run_id, int $user_id);

    /**
     * Reverse of `acknowledge_run`. Wired to the ~10s Undo toast.
     *
     * @return array{success: true}|\WP_Error
     */
    public function unacknowledge_run(string $run_id);

    /**
     * List every run recorded for a single campaign, newest first,
     * across ALL statuses (including still-running). Powers the
     * campaign-detail "Runs" tab — the historical receipt view.
     *
     * Distinct from `list_attention_runs` (which is scoped to the
     * Needs-Attention widget's narrower "unacknowledged problems"
     * contract). Implementations MUST send the campaign_id over the
     * same auth envelope the other methods use.
     *
     * @param int|string $campaign_id Campaign id — int legacy WP post id
     *                                 (WP-authoritative path) or string
     *                                 nanoid (cloud-authoritative, since
     *                                 Phase 1.0c). Implementations forward
     *                                 the value verbatim; the cloud's
     *                                 `listRunsForCampaign` accepts both.
     * @param int        $limit       Soft hint; cloud clamps to 1..50.
     *
     * @return array{runs: array<int, array<string, mixed>>}|\WP_Error
     */
    public function list_runs_for_campaign($campaign_id, int $limit = 20);

    /**
     * List every currently-in-flight (queued / running) run across ALL
     * the site's campaigns, newest-started first. Powers the wp-admin
     * SPA's refresh-recovery path: on a full page reload the in-memory
     * `RunsContext.activeRunId` resets, so any component that self-gates
     * on it (inline progress strip, live campaign-card badges)
     * disappears until the client asks "is anything still running?".
     *
     * Distinct from `list_attention_runs` (terminal-problem rows) and
     * `list_runs_for_campaign` (campaign-scoped history). This surface
     * exists specifically to answer "which card should light up right
     * now?" without needing to know which campaign a run belongs to in
     * advance.
     *
     * Cloud caps server-side at 10 — no UI surface needs more.
     *
     * @param int $limit Soft hint; cloud clamps to 1..10.
     *
     * @return array{runs: array<int, array<string, mixed>>}|\WP_Error
     */
    public function list_active_runs(int $limit = 10);

    /**
     * List the most recent ephemeral runs (the SPA's `/generate` form
     * submissions), newest-first. Powers the dashboard's "Recent
     * generations" widget — the at-a-glance receipt of one-off post
     * generations the user has fired without first creating a campaign.
     *
     * Distinct from `list_active_runs` (in-flight only) and
     * `list_runs_for_campaign` (campaign-scoped). The cloud filters on
     * `isEphemeral === true` so the widget never shows campaign runs;
     * those have their own surfaces.
     *
     * @param int $limit Soft hint; cloud clamps to 1..50.
     *
     * @return array{runs: array<int, array<string, mixed>>}|\WP_Error
     */
    public function list_single_post_runs(int $limit = 10);

    /**
     * Cancel a campaign run. Idempotent — re-cancelling an already-terminal
     * run succeeds.
     *
     * Called by the SPA when:
     *   - User clicks "Stop Run" button (cancelled_by: "user")
     *   - Polling hits max-attempts cap without seeing run start
     *     (cancelled_by: "system")
     *
     * @param string      $run_id        Run to cancel.
     * @param string      $cancelled_by  "user" or "system".
     * @param string|null $cancel_reason Optional reason for cancellation.
     *
     * @return array{success: true}|\WP_Error
     */
    public function cancel_run(string $run_id, string $cancelled_by, ?string $cancel_reason = null);
}
