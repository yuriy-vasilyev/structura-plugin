<?php

namespace Structura\Compat;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Schedule the page-builder detection recheck and expose the
 * snapshot via a single WordPress option.
 *
 * Spec: `specs/page-builder-compat.md` §3.2.
 *
 * ### Why an option snapshot?
 *
 * `Builder_Detector::detect()` is cheap per-call (a handful of
 * `class_exists` / `function_exists` / `defined` probes), but the
 * callers who want the answer — `Page_Builder_Notice` on every
 * `admin_notices` run, the `/compat/page-builders` REST endpoint,
 * the campaign-editor inline card — would each pay that cost on
 * every request. Running detection once per day via Action
 * Scheduler, storing the result in `structura_detected_page_builders`,
 * and letting every consumer `get_option(...)` gives us a single
 * source of truth with zero per-request probe cost.
 *
 * The trade-off: a newly-installed page builder doesn't show up in
 * the notice until the next daily recheck (or until the user
 * deactivates + reactivates Structura to retrigger the activation
 * hook). That's fine — the window is bounded, the data this
 * informs is cosmetic (a docs link), and the *actual* opt-out
 * (`Builder_Compat::opt_out_meta()`) runs on every post insert
 * regardless of what this cache says.
 *
 * ### Why Action Scheduler and not WP-Cron?
 *
 * Structura already runs every other recurring job through Action
 * Scheduler (`Scheduler/Action_Scheduler_Service`), so the daily
 * detection refresh goes in the same place rather than splitting
 * recurring-job execution across two systems. AS also has better
 * observability (the admin can see the action history under
 * Tools → Scheduled Actions) which helps support debug claims
 * like "the notice is wrong" by confirming when detection last
 * ran.
 */
final class Compat_Scheduler
{
    /** @var string Action Scheduler hook for the daily recheck. */
    public const HOOK = 'structura_compat_recheck';

    /** @var string Option where the last detection snapshot lives. */
    public const OPTION_DETECTED = 'structura_detected_page_builders';

    /** @var string Option where the last-run timestamp lives (UTC epoch). */
    public const OPTION_LAST_RUN = 'structura_detected_page_builders_last_run';

    /**
     * Hook the daily recheck. Call from `Core\Loader::load_core_modules()`
     * alongside other eager bootstrap so the recurring action is
     * registered on every request (not just activation) — otherwise a
     * site whose AS record was cleared by a cleanup plugin would
     * silently stop refreshing.
     */
    public static function init(): void
    {
        add_action(self::HOOK, [self::class, 'refresh']);
        // Self-healing: if the daily recheck isn't scheduled for any
        // reason (new install, AS record dropped, etc.), schedule it
        // and immediately run a one-shot refresh. Guarded by a
        // function_exists check because Action Scheduler ships with
        // WooCommerce and is loaded very early, but a freshly-
        // installed Structura might hit this path before WC's
        // bootstrap if another plugin is misbehaving.
        add_action('init', [self::class, 'ensure_scheduled'], 20);
    }

    /**
     * Called by `register_activation_hook` in the root plugin file.
     * Runs detection once immediately so the notice has data to
     * render on the first admin pageview, and schedules the
     * recurring recheck.
     */
    public static function activate(): void
    {
        self::refresh();
        self::ensure_scheduled();
    }

    /**
     * Called by `register_deactivation_hook`. Clears the scheduled
     * recheck so an admin who deactivates Structura doesn't keep
     * seeing a cron entry for it.
     *
     * The option snapshot is intentionally *not* deleted here —
     * deactivation shouldn't be destructive, and a reactivation the
     * next minute shouldn't pay the cost of a fresh detection pass
     * for the sake of it.
     */
    public static function deactivate(): void
    {
        if (function_exists('as_unschedule_all_actions')) {
            as_unschedule_all_actions(self::HOOK, [], STRUCTURA_AS_GROUP);
        }
    }

    /**
     * Ensure exactly one daily recheck is scheduled. Idempotent —
     * safe to call on every `init`.
     */
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
            DAY_IN_SECONDS,
            self::HOOK,
            [],
            STRUCTURA_AS_GROUP
        );
    }

    /**
     * Run the detector and persist the result. Public so it can be
     * triggered from unit tests, a support-tool command, or the
     * `/compat/page-builders/refresh` REST endpoint (if/when that
     * lands — not in scope today).
     *
     * The option stores `Builder_Detector::detect()`'s full return
     * shape (slug => {label, kind, docs_slug}) so every consumer
     * reads the same structure without re-hydrating it.
     */
    public static function refresh(): void
    {
        $detected = Builder_Detector::detect();
        update_option(self::OPTION_DETECTED, $detected, false);
        update_option(self::OPTION_LAST_RUN, time(), false);

        /**
         * Fires after a detection refresh completes, with the
         * freshly-persisted snapshot. Consumers can cache-invalidate
         * their own downstream reads without having to poll the
         * option. Custom Structura hook per AGENTS.md §7.
         *
         * @since 1.x.0
         *
         * @param array<string, array{label: string, kind: string, docs_slug: string}> $detected
         */
        do_action('structura/compat/detected_page_builders', $detected);
    }
}
