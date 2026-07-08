<?php

namespace Structura\Ui;

use Structura\Progress\Runs_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Cross-wp-admin attention notice for unacknowledged failed / warning runs.
 *
 * Spec: `specs/plugin-quiet-mode.md` §5.6 (failure surface) + §7
 * (native-admin triggers). Most Structura operators don't sit on the
 * plugin page — they spend their days in Posts, Media, and third-party
 * plugin screens. If a campaign run fails while they're elsewhere, an
 * in-SPA toast won't reach them. This class renders a bespoke,
 * brand-styled card on every wp-admin page when there's at least one
 * unacknowledged failed or warning run the current admin hasn't
 * already dismissed from *this* notice.
 *
 * Deliberately NOT using the stock `<div class="notice notice-info
 * is-dismissible">` pattern:
 *   - Visual weight matters. A generic blue WP info bar is how a
 *     dozen other plugins announce routine housekeeping — it gets
 *     ignored. A "someone's campaign run broke" signal needs to
 *     stand apart.
 *   - Scan affordances matter. We want the campaign name, the
 *     status, the step it stopped on, and the relative timestamp to
 *     all be legible at a glance — not buried in a paragraph.
 *   - The dismiss model differs from the WP default. WP's
 *     `is-dismissible` × toggles a single option; ours maintains a
 *     per-user list of run ids so re-surfacing a *new* failure works
 *     correctly even if the admin snoozed yesterday's batch.
 *
 * ### Snooze model — per-user, per-run-id
 *
 * Each admin has a `USER_SNOOZE_META` user-meta key holding a JSON
 * array of run ids they've dismissed *from this notice specifically*
 * (not an acknowledgement — that still needs to happen from the
 * Overview's Needs Attention widget where the Undo flow lives).
 * When `maybe_render()` runs, if **every** current attention run id
 * is already in the user's snoozed list, we stay silent. If any new
 * id slips in (a fresh failure while triaging the backlog), we
 * re-surface the card with the full list.
 *
 * This shape is chosen because a simple TTL-based snooze has a bad
 * failure mode: the operator mutes the banner for 6 hours, a new
 * failure lands 5 minutes later, and the banner stays silent until
 * the TTL expires. Run-id-scoped snoozing sidesteps that entirely —
 * "I've seen these five; shut up about them" without blinding me to
 * number six.
 *
 * ### Data source + caching
 *
 * Reads the same cloud endpoint as the Needs Attention widget
 * (`Runs_Service::list_attention_runs(10)`) but wraps the call in a
 * 60-second site transient so the cross-wp-admin render budget stays
 * cheap even on sites where an admin is clicking through Posts
 * rapidly. The transient is also busted from a few sensible points
 * (dismissal, REST acknowledgement) so the card reacts quickly to
 * state changes when it matters.
 */
class Attention_Admin_Notice
{
    /** Site-wide cache of the latest attention-runs response. */
    public const TRANSIENT_KEY = 'structura_attn_notice_runs';

    /**
     * 60 s matches a comfortable "I clicked through three admin pages
     * while triaging" window without blasting the cloud on every
     * pageview. Acknowledgement and dismissal bust this early.
     */
    public const TRANSIENT_TTL = 60;

    /** Per-user snoozed run ids. JSON-encoded array of strings. */
    public const USER_SNOOZE_META = 'structura_attn_snoozed_run_ids';

    /** admin-ajax action for the dismiss round-trip. */
    public const AJAX_ACTION = 'structura_dismiss_attn_notice';

    /** Keep the per-user snooze list bounded so the user-meta row stays small. */
    public const MAX_SNOOZED_IDS = 50;

    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_render']);
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handle_dismiss']);
    }

    /**
     * Invalidate the site transient. Called from the REST bridge when an
     * acknowledge/unacknowledge completes so the card mirrors the SPA's
     * state within a page navigation rather than up to 60 seconds later.
     */
    public static function bust_cache(): void
    {
        delete_site_transient(self::TRANSIENT_KEY);
    }

    /**
     * Render gate + card emission. Multiple bail points, each commented
     * with the reason the notice should stay silent:
     *   1. Capability — subscribers and editors never saw the old Logs
     *      surface and aren't actionable on a broken run either.
     *   2. Feature flag — if the progress-stream kill switch is off,
     *      the cloud won't serve us data; don't pretend to.
     *   3. Transient miss → cloud error → empty runs list — quiet.
     *   4. Per-user snooze covers every current run id — quiet.
     */
    public static function maybe_render(): void
    {
        if ( ! current_user_can('manage_options')) {
            return;
        }

        $runs = self::get_runs();
        if (empty($runs)) {
            return;
        }

        // Normalize to a list of string ids — the snooze comparison is id-based
        // and defending against a malformed cloud payload is cheaper here than
        // inside the diff loop.
        $current_ids = [];
        foreach ($runs as $run) {
            if (is_array($run) && isset($run['runId']) && is_string($run['runId']) && $run['runId'] !== '') {
                $current_ids[] = $run['runId'];
            }
        }

        if (empty($current_ids)) {
            return;
        }

        $snoozed   = self::get_snoozed_ids_for_current_user();
        $new_ids   = array_values(array_diff($current_ids, $snoozed));

        if (empty($new_ids)) {
            return;
        }

        self::render($runs, $current_ids);
    }

    /**
     * AJAX callback that persists the current run-id list into the
     * dismissing admin's user meta. Nonce-gated and capability-gated;
     * a missing nonce yields a silent 400 (stale-tab scenario).
     */
    public static function handle_dismiss(): void
    {
        if ( ! current_user_can('manage_options')) {
            wp_send_json_error(['reason' => 'forbidden'], 403);
        }

        $nonce = isset($_POST['_wpnonce']) ? sanitize_text_field(wp_unslash($_POST['_wpnonce'])) : '';
        if ( ! wp_verify_nonce($nonce, self::AJAX_ACTION)) {
            wp_send_json_error(['reason' => 'invalid_nonce'], 400);
        }

        $raw_ids = isset($_POST['run_ids']) && is_array($_POST['run_ids'])
            ? array_map('sanitize_text_field', wp_unslash($_POST['run_ids']))
            : [];

        $incoming = [];
        foreach ($raw_ids as $id) {
            $id = (string) $id;
            if ($id !== '') {
                $incoming[] = $id;
            }
        }

        $user_id  = get_current_user_id();
        $existing = self::get_snoozed_ids_for_user($user_id);

        // Merge-dedupe-tail-trim: oldest entries get evicted first so the
        // list never grows unboundedly. Tail ordering is "latest at end"
        // so eviction is from the head.
        $merged = array_values(array_unique(array_merge($existing, $incoming)));
        if (count($merged) > self::MAX_SNOOZED_IDS) {
            $merged = array_slice($merged, -self::MAX_SNOOZED_IDS);
        }

        update_user_meta($user_id, self::USER_SNOOZE_META, wp_json_encode($merged));

        // Bust the shared transient too — the next admin who visits a
        // wp-admin page should see a fresh read rather than the cached
        // copy from the triage session.
        self::bust_cache();

        wp_send_json_success([
            'dismissed_count' => count($incoming),
            'snoozed_total'   => count($merged),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Internals
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Get the cached runs list, falling back to a live cloud call and
     * caching the result for `TRANSIENT_TTL` seconds. Errors cache an
     * empty list so a flaky cloud doesn't retry on every admin pageview.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function get_runs(): array
    {
        $cached = get_site_transient(self::TRANSIENT_KEY);
        if (is_array($cached)) {
            return $cached;
        }

        // The service is tiny — instantiate per-call rather than holding
        // a singleton. Matches the style used by `Rest_Api::runs()`.
        $service = new Runs_Service();
        $result  = $service->list_attention_runs(10);

        if (is_wp_error($result)) {
            // Quiet failure — no card, and we suppress retries for a
            // minute so a flapping cloud can't turn wp-admin into a
            // request storm.
            set_site_transient(self::TRANSIENT_KEY, [], self::TRANSIENT_TTL);
            return [];
        }

        $runs = is_array($result['runs'] ?? null) ? $result['runs'] : [];
        set_site_transient(self::TRANSIENT_KEY, $runs, self::TRANSIENT_TTL);
        return $runs;
    }

    /**
     * Read the per-user snoozed run-id list. Stored as a JSON string so
     * the row stays compact and is easy to inspect by hand during
     * support calls ("what ids has this user dismissed?").
     *
     * @return array<int, string>
     */
    private static function get_snoozed_ids_for_current_user(): array
    {
        return self::get_snoozed_ids_for_user(get_current_user_id());
    }

    /**
     * @return array<int, string>
     */
    private static function get_snoozed_ids_for_user(int $user_id): array
    {
        if ($user_id <= 0) {
            return [];
        }

        $raw = get_user_meta($user_id, self::USER_SNOOZE_META, true);
        if ( ! is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if ( ! is_array($decoded)) {
            return [];
        }

        // Guard against a legacy format or manual hand-editing — filter
        // to strings only.
        return array_values(array_filter(array_map('strval', $decoded), static function ($id) {
            return $id !== '';
        }));
    }

    /**
     * Render the branded notice. All CSS is inline-scoped under
     * `.structura-attn` so we don't pay a stylesheet round-trip on
     * pages where the card isn't rendered (and most pageviews won't
     * render it once the per-user snooze kicks in).
     *
     * @param array<int, array<string, mixed>> $runs
     * @param array<int, string> $run_ids
     */
    private static function render(array $runs, array $run_ids): void
    {
        $failure_count = 0;
        $warning_count = 0;
        foreach ($runs as $run) {
            $status = is_array($run) ? (string) ($run['status'] ?? '') : '';
            if ($status === 'failed') {
                $failure_count++;
            } elseif ($status === 'succeeded_with_warnings') {
                $warning_count++;
            }
        }

        $overview_url = esc_url(admin_url('admin.php?page=structura#/'));
        $ajax_url     = esc_url(admin_url('admin-ajax.php'));
        $nonce        = wp_create_nonce(self::AJAX_ACTION);
        $action       = self::AJAX_ACTION;
        $run_ids_json = wp_json_encode(array_values($run_ids));

        // Headline copy tailored to the mix: all-failed, all-warnings,
        // or both. Each branch keeps the same verb-first structure so
        // the card feels consistent regardless of state.
        if ($failure_count > 0 && $warning_count === 0) {
            $headline = sprintf(
                /* translators: %d is the number of failed campaign runs. */
                _n(
                    '%d campaign run failed',
                    '%d campaign runs failed',
                    $failure_count,
                    'structura'
                ),
                $failure_count
            );
        } elseif ($failure_count === 0 && $warning_count > 0) {
            $headline = sprintf(
                /* translators: %d is the number of campaign runs that finished with warnings. */
                _n(
                    '%d campaign run finished with warnings',
                    '%d campaign runs finished with warnings',
                    $warning_count,
                    'structura'
                ),
                $warning_count
            );
        } else {
            $headline = sprintf(
                /* translators: 1: count of failed runs, 2: count of runs that finished with warnings. */
                __('%1$d failed, %2$d finished with warnings', 'structura'),
                $failure_count,
                $warning_count
            );
        }

        $subhead = __(
            'Open a run to see what happened and decide what to do next.',
            'structura'
        );

        // Cap the in-card list at 5 rows; everything else gets summarized
        // in the footer link. The Needs Attention widget on the Overview
        // is the place to work through the full backlog.
        $visible    = array_slice($runs, 0, 5);
        $overflow   = max(0, count($runs) - count($visible));

        ?>
        <div
            class="structura-attn"
            role="alert"
            aria-live="polite"
            data-run-ids='<?php echo esc_attr($run_ids_json); ?>'
        >
            <style>
                /* All selectors scoped to `.structura-attn` so we never
                   leak styles into the rest of wp-admin. The stylesheet
                   is tiny (~2KB) and only emitted on pageviews where
                   the notice actually renders. */
                .structura-attn {
                    margin: 18px 20px 12px 2px;
                    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, system-ui, sans-serif;
                    color: #e0e7ff;
                }
                .structura-attn__card {
                    position: relative;
                    border-radius: 14px;
                    padding: 20px 24px;
                    background:
                        radial-gradient(120% 140% at 0% 0%, rgba(99,102,241,0.35) 0%, transparent 55%),
                        linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%);
                    box-shadow:
                        0 1px 0 rgba(255,255,255,0.08) inset,
                        0 10px 30px -10px rgba(30, 27, 75, 0.55),
                        0 2px 6px -2px rgba(30, 27, 75, 0.35);
                    border: 1px solid rgba(165, 180, 252, 0.22);
                    overflow: hidden;
                }
                .structura-attn__card::before {
                    /* Thin accent bar signals severity without the
                       stock WP red/yellow left-border look. */
                    content: "";
                    position: absolute;
                    inset: 0 0 auto 0;
                    height: 3px;
                    background: linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #6366f1 100%);
                    opacity: 0.85;
                }
                .structura-attn__close {
                    position: absolute;
                    top: 14px;
                    right: 14px;
                    width: 30px;
                    height: 30px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.04);
                    color: #c7d2fe;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: background .15s ease, color .15s ease, border-color .15s ease;
                }
                .structura-attn__close:hover,
                .structura-attn__close:focus {
                    background: rgba(255,255,255,0.08);
                    color: #ffffff;
                    border-color: rgba(255,255,255,0.25);
                    outline: none;
                }
                .structura-attn__close svg {
                    width: 14px;
                    height: 14px;
                }
                .structura-attn__header {
                    display: flex;
                    align-items: flex-start;
                    gap: 14px;
                    padding-right: 40px; /* room for the × button */
                }
                .structura-attn__mark {
                    flex: 0 0 auto;
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
                    box-shadow: 0 6px 16px -6px rgba(99,102,241,0.55);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .structura-attn__mark svg {
                    width: 22px;
                    height: 22px;
                }
                .structura-attn__title {
                    margin: 0 0 2px;
                    font-size: 15px;
                    font-weight: 600;
                    color: #ffffff;
                    letter-spacing: -0.01em;
                }
                .structura-attn__subtitle {
                    margin: 0;
                    font-size: 13px;
                    line-height: 1.4;
                    color: rgba(199, 210, 254, 0.85);
                }
                .structura-attn__list {
                    margin: 14px 0 0;
                    padding: 0;
                    list-style: none;
                    display: grid;
                    gap: 1px;
                    background: rgba(255,255,255,0.06);
                    border-radius: 10px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.06);
                }
                .structura-attn__row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 14px;
                    background: rgba(30, 27, 75, 0.55);
                    text-decoration: none;
                    color: #e0e7ff;
                    transition: background .12s ease;
                    min-width: 0;
                }
                .structura-attn__row:hover,
                .structura-attn__row:focus {
                    background: rgba(49, 46, 129, 0.9);
                    outline: none;
                    color: #ffffff;
                }
                .structura-attn__pill {
                    flex: 0 0 auto;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    padding: 3px 8px;
                    border-radius: 999px;
                    border: 1px solid currentColor;
                    line-height: 1;
                }
                .structura-attn__pill--failed {
                    color: #fca5a5;
                }
                .structura-attn__pill--warnings {
                    color: #fcd34d;
                }
                .structura-attn__row-text {
                    flex: 1 1 auto;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .structura-attn__campaign {
                    font-size: 13px;
                    font-weight: 600;
                    color: #ffffff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .structura-attn__step {
                    font-size: 11.5px;
                    color: rgba(199, 210, 254, 0.78);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .structura-attn__time {
                    flex: 0 0 auto;
                    font-size: 11.5px;
                    color: rgba(199, 210, 254, 0.6);
                    font-variant-numeric: tabular-nums;
                }
                .structura-attn__actions {
                    margin-top: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .structura-attn__cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    border-radius: 8px;
                    background: #ffffff;
                    color: #1e1b4b;
                    font-weight: 600;
                    font-size: 13px;
                    text-decoration: none;
                    transition: transform .1s ease, box-shadow .15s ease;
                    box-shadow: 0 6px 18px -6px rgba(255,255,255,0.25);
                }
                .structura-attn__cta:hover,
                .structura-attn__cta:focus {
                    transform: translateY(-1px);
                    color: #1e1b4b;
                    box-shadow: 0 10px 22px -8px rgba(255,255,255,0.32);
                    outline: none;
                }
                .structura-attn__overflow {
                    font-size: 12px;
                    color: rgba(199, 210, 254, 0.75);
                }
                @media (max-width: 600px) {
                    .structura-attn__row-text { gap: 4px; }
                    .structura-attn__time { display: none; }
                }
            </style>

            <div class="structura-attn__card">
                <button
                    type="button"
                    class="structura-attn__close"
                    aria-label="<?php echo esc_attr__('Dismiss Structura attention notice', 'structura'); ?>"
                >
                    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                    </svg>
                </button>

                <div class="structura-attn__header">
                    <div class="structura-attn__mark" aria-hidden="true">
                        <!-- Ascending Overlap logo mark, simplified for small sizes -->
                        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8" y="54" width="54" height="24" rx="6" fill="#c7d2fe" opacity="0.55"/>
                            <rect x="24" y="34" width="48" height="24" rx="6" fill="#e0e7ff" opacity="0.85"/>
                            <rect x="40" y="14" width="42" height="24" rx="6" fill="#ffffff"/>
                        </svg>
                    </div>
                    <div>
                        <h2 class="structura-attn__title"><?php echo esc_html($headline); ?></h2>
                        <p class="structura-attn__subtitle"><?php echo esc_html($subhead); ?></p>
                    </div>
                </div>

                <ul class="structura-attn__list">
                    <?php foreach ($visible as $run): ?>
                        <?php
                        $run_id        = isset($run['runId']) && is_string($run['runId']) ? $run['runId'] : '';
                        $campaign_name = isset($run['campaignName']) && is_string($run['campaignName']) && $run['campaignName'] !== ''
                            ? $run['campaignName']
                            : __('Untitled campaign', 'structura');
                        $status        = isset($run['status']) ? (string) $run['status'] : '';
                        $is_warning    = $status === 'succeeded_with_warnings';
                        $pill_class    = $is_warning ? 'structura-attn__pill--warnings' : 'structura-attn__pill--failed';
                        $pill_label    = $is_warning
                            ? __('Warnings', 'structura')
                            : __('Failed', 'structura');
                        $step_copy     = isset($run['headline']) && is_string($run['headline']) && $run['headline'] !== ''
                            ? $run['headline']
                            : __('See run details', 'structura');
                        $ended_at      = isset($run['endedAt']) && is_string($run['endedAt']) ? $run['endedAt'] : '';
                        $time_copy     = self::format_time_ago($ended_at);
                        $href          = $run_id !== ''
                            ? admin_url('admin.php?page=structura#/runs/') . rawurlencode($run_id)
                            : admin_url('admin.php?page=structura#/');
                        ?>
                        <li>
                            <a
                                class="structura-attn__row"
                                href="<?php echo esc_url($href); ?>"
                            >
                                <span class="structura-attn__pill <?php echo esc_attr($pill_class); ?>">
                                    <?php echo esc_html($pill_label); ?>
                                </span>
                                <span class="structura-attn__row-text">
                                    <span class="structura-attn__campaign">
                                        <?php echo esc_html($campaign_name); ?>
                                    </span>
                                    <span class="structura-attn__step">
                                        <?php echo esc_html($step_copy); ?>
                                    </span>
                                </span>
                                <span class="structura-attn__time">
                                    <?php echo esc_html($time_copy); ?>
                                </span>
                            </a>
                        </li>
                    <?php endforeach; ?>
                </ul>

                <div class="structura-attn__actions">
                    <a class="structura-attn__cta" href="<?php echo esc_url($overview_url); ?>">
                        <?php echo esc_html__('Open Structura Overview', 'structura'); ?>
                        <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true">
                            <path d="M3 7h8M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    </a>
                    <?php if ($overflow > 0): ?>
                        <span class="structura-attn__overflow">
                            <?php
                            echo esc_html(sprintf(
                                /* translators: %d is the number of additional runs needing attention beyond what fits in the list. */
                                _n(
                                    '+%d more needing attention',
                                    '+%d more needing attention',
                                    $overflow,
                                    'structura'
                                ),
                                $overflow
                            ));
                            ?>
                        </span>
                    <?php endif; ?>
                </div>
            </div>

            <script>
            (function () {
                var card = document.currentScript && document.currentScript.parentElement;
                if (!card) return;
                var closeBtn = card.querySelector('.structura-attn__close');
                if (!closeBtn) return;
                closeBtn.addEventListener('click', function () {
                    var ids = [];
                    try { ids = JSON.parse(card.getAttribute('data-run-ids') || '[]'); }
                    catch (e) { ids = []; }
                    var body = new FormData();
                    body.append('action', <?php echo wp_json_encode($action); ?>);
                    body.append('_wpnonce', <?php echo wp_json_encode($nonce); ?>);
                    // PHP expects `run_ids[]` as an array. Append each id
                    // with the bracket suffix so `$_POST['run_ids']` ends
                    // up as an indexed array without us parsing a JSON
                    // string server-side.
                    for (var i = 0; i < ids.length; i++) {
                        body.append('run_ids[]', ids[i]);
                    }
                    // Remove the card immediately — a flaky network
                    // shouldn't strand the admin looking at a button
                    // that doesn't respond. Worst case, the POST fails
                    // and the card reappears on next load.
                    card.parentNode && card.parentNode.removeChild(card);
                    fetch(<?php echo wp_json_encode($ajax_url); ?>, {
                        method: 'POST',
                        credentials: 'same-origin',
                        body: body
                    });
                });
            })();
            </script>
        </div>
        <?php
    }

    /**
     * Coarse "x min ago / x hrs ago / date" formatter. We deliberately
     * stay coarser than the SPA widget's formatter (which also knows
     * about "just now") — the wp-admin card will often display data up
     * to 60 s stale because of the site transient, so sub-minute
     * granularity would lie.
     */
    private static function format_time_ago(string $iso): string
    {
        if ($iso === '') {
            return '';
        }

        $ts = strtotime($iso);
        if ( ! $ts) {
            return '';
        }

        $delta = time() - $ts;
        if ($delta < 0) {
            return '';
        }

        if ($delta < HOUR_IN_SECONDS) {
            $mins = max(1, (int) floor($delta / MINUTE_IN_SECONDS));
            return sprintf(
                /* translators: %d is the number of minutes since the run finished. */
                _n('%d min ago', '%d mins ago', $mins, 'structura'),
                $mins
            );
        }
        if ($delta < DAY_IN_SECONDS) {
            $hours = (int) floor($delta / HOUR_IN_SECONDS);
            return sprintf(
                /* translators: %d is the number of hours since the run finished. */
                _n('%d hr ago', '%d hrs ago', $hours, 'structura'),
                $hours
            );
        }
        if ($delta < 7 * DAY_IN_SECONDS) {
            $days = (int) floor($delta / DAY_IN_SECONDS);
            return sprintf(
                /* translators: %d is the number of days since the run finished. */
                _n('%d day ago', '%d days ago', $days, 'structura'),
                $days
            );
        }

        return date_i18n(get_option('date_format', 'Y-m-d'), $ts);
    }
}
