<?php

namespace Structura\Ui;

use Structura\Progress\Runs_Service;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * wp-admin Dashboard widget — Structura status at a glance.
 *
 * Spec: `specs/plugin-quiet-mode.md` §7 (native-admin surfaces).
 *
 * Most Structura operators pin the WordPress Dashboard as their
 * landing page. A widget there is the cheapest possible way to
 * tell them whether any campaigns need attention without them
 * having to remember to click through to Structura → Overview.
 *
 * Greenfield: the plugin registers no other dashboard widgets today
 * (confirmed by grep), so we own the `wp_add_dashboard_widget`
 * contract and the styling from scratch.
 *
 * ### Design choices
 *
 * The widget is ALWAYS rendered — even in the empty-state — because
 * operators told us a visible "all green" card is more reassuring
 * than a missing widget. The empty state is a single line of copy
 * plus a deep link to the Overview; no noise.
 *
 * Styling deliberately rejects the stock `.postbox .inside` look.
 * Default WP widget chrome makes everything look equally unimportant
 * — we want the Structura widget to *feel* different the first time
 * an admin sees it, matching the `Attention_Admin_Notice` language
 * so the pair reads as a coherent product surface.
 *
 * ### Data source + caching
 *
 * Reuses `Attention_Admin_Notice::bust_cache()` ground truth by
 * going through the same transient. That keeps the widget and the
 * cross-admin banner consistent without a second cache key. The
 * dashboard page isn't high-traffic so we don't need extra paging
 * or a bespoke cache here.
 */
class Dashboard_Widget
{
    public const WIDGET_ID = 'structura_attention_widget';

    public static function init(): void
    {
        add_action('wp_dashboard_setup', [self::class, 'register']);
        add_action('admin_enqueue_scripts', [self::class, 'maybe_enqueue_style']);
    }

    /**
     * Enqueue the widget stylesheet on the Dashboard screen only, for
     * the same admins `register()` shows the widget to. Hooked on
     * `admin_enqueue_scripts` rather than called from `register()`
     * because `wp_dashboard_setup` fires before WordPress allows
     * enqueues (`_doing_it_wrong` otherwise).
     *
     * @param string $hook_suffix Current admin page hook.
     */
    public static function maybe_enqueue_style(string $hook_suffix = ''): void
    {
        if ($hook_suffix !== 'index.php' || ! current_user_can('manage_options')) {
            return;
        }
        Admin_Notice_Assets::enqueue_widget_style();
    }

    public static function register(): void
    {
        // Capability gate — subscribers and editors never had access to
        // Structura's Overview, and we don't want their dashboards to
        // get cluttered with a card they can't act on.
        if ( ! current_user_can('manage_options')) {
            return;
        }

        wp_add_dashboard_widget(
            self::WIDGET_ID,
            __('Structura status', 'structura'),
            [self::class, 'render']
        );
    }

    /**
     * Callback wired into `wp_add_dashboard_widget`. The widget pulls
     * its own data; we don't trust a global singleton to be populated
     * by this point in the admin request.
     */
    public static function render(): void
    {
        $runs = self::get_runs();

        // Split failures and warnings so the summary line can name them
        // separately. A pure-failures state is louder than a pure-
        // warnings state and the copy reflects that.
        $failures = 0;
        $warnings = 0;
        foreach ($runs as $run) {
            $status = is_array($run) ? (string) ($run['status'] ?? '') : '';
            if ($status === 'failed') {
                $failures++;
            } elseif ($status === 'succeeded_with_warnings') {
                $warnings++;
            }
        }
        $total = $failures + $warnings;

        $overview_url = esc_url(admin_url('admin.php?page=structura#/'));

        ?>
        <div class="structura-widget" data-has-issues="<?php echo $total > 0 ? '1' : '0'; ?>">

            <div class="structura-widget__card" data-state="<?php echo $total > 0 ? 'alert' : 'green'; ?>">
                <div class="structura-widget__header">
                    <div class="structura-widget__mark" aria-hidden="true">
                        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8"  y="54" width="54" height="24" rx="6" fill="#c7d2fe" opacity="0.55"/>
                            <rect x="24" y="34" width="48" height="24" rx="6" fill="#e0e7ff" opacity="0.85"/>
                            <rect x="40" y="14" width="42" height="24" rx="6" fill="#ffffff"/>
                        </svg>
                    </div>
                    <div>
                        <?php self::render_headline($failures, $warnings); ?>
                    </div>
                </div>

                <?php if ($total === 0): ?>
                    <div class="structura-widget__empty">
                        <span class="structura-widget__empty-dot" aria-hidden="true"></span>
                        <span>
                            <?php echo esc_html__(
                                'No failed or warning runs right now. We\'ll surface any problems here.',
                                'structura'
                            ); ?>
                        </span>
                    </div>
                <?php else: ?>
                    <?php
                    // Keep the widget compact — 3 rows visible. The
                    // cross-wp-admin banner and the Overview's full
                    // widget are where the long list lives.
                    $visible  = array_slice($runs, 0, 3);
                    $overflow = max(0, count($runs) - count($visible));
                    ?>
                    <ul class="structura-widget__list">
                        <?php foreach ($visible as $run): ?>
                            <?php self::render_row($run); ?>
                        <?php endforeach; ?>
                    </ul>
                    <?php if ($overflow > 0): ?>
                        <div class="structura-widget__overflow" style="margin-top: 8px;">
                            <?php
                            echo esc_html(sprintf(
                                /* translators: %d is the number of additional runs needing attention beyond what fits in the widget. */
                                _n(
                                    '+%d more needs attention',
                                    '+%d more need attention',
                                    $overflow,
                                    'structura'
                                ),
                                $overflow
                            ));
                            ?>
                        </div>
                    <?php endif; ?>
                <?php endif; ?>

                <div class="structura-widget__footer">
                    <a class="structura-widget__cta" href="<?php echo esc_url($overview_url); ?>">
                        <?php echo esc_html__('Open Structura', 'structura'); ?>
                        <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true">
                            <path d="M3 7h8M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    </a>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render the widget's title + subtitle pair, with copy tailored to
     * the failure / warning mix. The method is split out so the render
     * method stays scannable — the copy permutations were cluttering
     * the main layout.
     */
    private static function render_headline(int $failures, int $warnings): void
    {
        if ($failures === 0 && $warnings === 0) {
            $title    = __('All campaigns running cleanly', 'structura');
            $subtitle = __(
                'Nothing needs your attention.',
                'structura'
            );
        } elseif ($failures > 0 && $warnings === 0) {
            $title = sprintf(
                /* translators: %d is the number of failed campaign runs. */
                _n(
                    '%d campaign run failed',
                    '%d campaign runs failed',
                    $failures,
                    'structura'
                ),
                $failures
            );
            $subtitle = __(
                'Open Structura to see what stopped and decide what to do next.',
                'structura'
            );
        } elseif ($failures === 0 && $warnings > 0) {
            $title = sprintf(
                /* translators: %d is the number of campaign runs that finished with warnings. */
                _n(
                    '%d run finished with warnings',
                    '%d runs finished with warnings',
                    $warnings,
                    'structura'
                ),
                $warnings
            );
            $subtitle = __(
                'Runs completed, but something wasn\'t quite right.',
                'structura'
            );
        } else {
            $title = sprintf(
                /* translators: 1: count of failed runs, 2: count of runs that finished with warnings. */
                __('%1$d failed, %2$d finished with warnings', 'structura'),
                $failures,
                $warnings
            );
            $subtitle = __(
                'Open Structura to triage the list.',
                'structura'
            );
        }

        echo '<div class="structura-widget__title">' . esc_html($title) . '</div>';
        echo '<div class="structura-widget__subtitle">' . esc_html($subtitle) . '</div>';
    }

    /**
     * Render one attention row. Kept private — the widget owns its
     * internal layout and we don't want the shape to drift from the
     * cross-admin banner piecemeal.
     *
     * @param array<string, mixed> $run
     */
    private static function render_row(array $run): void
    {
        $run_id = isset($run['runId']) && is_string($run['runId']) ? $run['runId'] : '';
        if ($run_id === '') {
            return;
        }

        $campaign_name = isset($run['campaignName']) && is_string($run['campaignName']) && $run['campaignName'] !== ''
            ? $run['campaignName']
            : __('Untitled campaign', 'structura');

        $status     = isset($run['status']) ? (string) $run['status'] : '';
        $is_warning = $status === 'succeeded_with_warnings';
        $pill_class = $is_warning ? 'structura-widget__pill--warnings' : 'structura-widget__pill--failed';
        $pill_label = $is_warning
            ? __('Warnings', 'structura')
            : __('Failed', 'structura');

        $step_copy = isset($run['headline']) && is_string($run['headline']) && $run['headline'] !== ''
            ? $run['headline']
            : __('See run details', 'structura');

        $ended_at = isset($run['endedAt']) && is_string($run['endedAt']) ? $run['endedAt'] : '';
        $time_copy = self::format_time_ago($ended_at);

        $href = admin_url('admin.php?page=structura#/runs/') . rawurlencode($run_id);

        ?>
        <li>
            <a class="structura-widget__row" href="<?php echo esc_url($href); ?>">
                <span class="structura-widget__pill <?php echo esc_attr($pill_class); ?>">
                    <?php echo esc_html($pill_label); ?>
                </span>
                <span class="structura-widget__row-text">
                    <span class="structura-widget__campaign">
                        <?php echo esc_html($campaign_name); ?>
                    </span>
                    <span class="structura-widget__step">
                        <?php echo esc_html($step_copy); ?>
                    </span>
                </span>
                <?php if ($time_copy !== ''): ?>
                    <span class="structura-widget__time">
                        <?php echo esc_html($time_copy); ?>
                    </span>
                <?php endif; ?>
            </a>
        </li>
        <?php
    }

    /**
     * Shared cache read with `Attention_Admin_Notice`. A single transient
     * backs both surfaces so they never drift on the same page view.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function get_runs(): array
    {
        $cached = get_site_transient(Attention_Admin_Notice::TRANSIENT_KEY);
        if (is_array($cached)) {
            return $cached;
        }

        $service = new Runs_Service();
        $result  = $service->list_attention_runs(10);

        if (is_wp_error($result)) {
            set_site_transient(
                Attention_Admin_Notice::TRANSIENT_KEY,
                [],
                Attention_Admin_Notice::TRANSIENT_TTL
            );
            return [];
        }

        $runs = is_array($result['runs'] ?? null) ? $result['runs'] : [];
        set_site_transient(
            Attention_Admin_Notice::TRANSIENT_KEY,
            $runs,
            Attention_Admin_Notice::TRANSIENT_TTL
        );
        return $runs;
    }

    /**
     * Same shape as the sibling method in `Attention_Admin_Notice`.
     * Duplicated (not extracted) because pulling a static helper into
     * a shared utility would couple these two independent UI surfaces
     * through infrastructure just to save ~15 lines — not worth it.
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
