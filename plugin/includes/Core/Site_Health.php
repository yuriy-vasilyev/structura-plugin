<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Structura-specific Site Health tests.
 *
 * Why Site Health and not admin notices:
 *   - Admin-notice warnings are noisy and train users to dismiss them. The
 *     conditions we detect here (MySQL packet size, disabled WP-Cron,
 *     unwritable uploads dir) are environmental, not things the user
 *     triggered today — they deserve the quieter, dedicated surface.
 *   - Site Health tests are discoverable in Tools → Site Health, already
 *     familiar to WordPress operators, and picked up by hosts like Kinsta
 *     and WP Engine for their own diagnostics pages.
 *
 * What this class does NOT do:
 *   - It does not fix anything. Each test is a probe: detect, explain,
 *     link to docs. Shared-host users can't change `max_allowed_packet`
 *     without a support ticket anyway — our job is to make the problem
 *     legible so they know what ticket to file.
 *
 * Each test follows the Site Health contract:
 *   [
 *       'label'       => user-facing label shown on the report card,
 *       'status'      => 'good' | 'recommended' | 'critical',
 *       'badge'       => ['label' => section, 'color' => 'blue'|'orange'|'red'|'gray'|'green'],
 *       'description' => HTML-safe paragraph explaining the finding,
 *       'actions'     => HTML link(s) to docs / next steps,
 *       'test'        => test id (matches the filter key),
 *   ]
 *
 * See: https://make.wordpress.org/core/2019/04/25/site-health-check-in-5-2/
 */
class Site_Health
{
    /**
     * Anchor for "learn more" action links. Points at a troubleshooting
     * section in the docs site. Kept as a constant so the docs URL
     * structure is trivial to rehome without grepping strings.
     *
     * The `/en/` segment is required: the docs site routes through
     * `app/[lang]/[[...mdxPath]]/page.tsx` and `nextra/locales`
     * middleware redirects un-prefixed URLs into `/{detected-locale}/...`.
     * Only English content exists today (`docs/content/en/`), so a
     * German Site Health visitor would otherwise be redirected to
     * `/de/troubleshooting/...` and 404. Drop the prefix once
     * `docs/content/{de,es,fr}/` ship.
     */
    private const DOCS_TROUBLESHOOTING_URL = 'https://docs.structurawp.com/en/troubleshooting/images-not-generating';

    /**
     * Threshold below which `max_allowed_packet` is considered risky.
     *
     * 4 MB is a conservative floor: a typical Structura campaign row
     * serializes to ~50–500 KB, AS's `args` column stores it in a
     * LONGTEXT packed blob, and several WordPress hosts ship with the
     * MySQL default of 1 MB. We want a clear warning well before the
     * packet ceiling so operators can open a support ticket with their
     * host before a campaign actually silently fails.
     *
     * 4 MB matches the suggested floor in WordPress core's own
     * debug_information output for shared hosts.
     */
    private const MAX_ALLOWED_PACKET_FLOOR_BYTES = 4 * 1024 * 1024;

    public static function init(): void
    {
        add_filter('site_status_tests', [self::class, 'register_tests']);
    }

    /**
     * @param array $tests Core Site Health registry.
     *
     * @return array
     */
    public static function register_tests(array $tests): array
    {
        $tests['direct']['structura_actionscheduler_packet_size'] = [
            'label' => __('Structura: MySQL packet size is sufficient for background tasks', 'structura'),
            'test'  => [self::class, 'test_actionscheduler_packet_size'],
        ];

        $tests['direct']['structura_wp_cron_enabled'] = [
            'label' => __('Structura: WordPress cron is enabled', 'structura'),
            'test'  => [self::class, 'test_wp_cron_enabled'],
        ];

        $tests['direct']['structura_uploads_writable'] = [
            'label' => __('Structura: WordPress uploads directory is writable', 'structura'),
            'test'  => [self::class, 'test_uploads_writable'],
        ];

        return $tests;
    }

    /**
     * Detects low `max_allowed_packet` on the MySQL server.
     *
     * Action Scheduler persists every queued action's args as a serialized
     * blob in `wp_actionscheduler_actions.args`. The write happens via
     * `wpdb->insert()`, which **returns false silently** when the packet
     * exceeds `max_allowed_packet` — no PHP error, no exception, just a
     * missing row. The plugin flags this at enqueue time now (see
     * `Task_Runner::enqueue_image_task`), but catching it proactively here
     * means operators see the underlying cause before the first campaign
     * run, not after.
     */
    public static function test_actionscheduler_packet_size(): array
    {
        $limit = self::query_max_allowed_packet();

        if ($limit === null) {
            return self::result(
                'structura_actionscheduler_packet_size',
                'recommended',
                __('Structura could not read the MySQL packet size limit', 'structura'),
                __('We could not query <code>max_allowed_packet</code> on your database. This usually means the database user lacks <code>SHOW VARIABLES</code> permissions — it is not a bug, but Structura cannot confirm background tasks will enqueue successfully.', 'structura'),
                __('Read the troubleshooting guide', 'structura')
            );
        }

        if ($limit < self::MAX_ALLOWED_PACKET_FLOOR_BYTES) {
            return self::result(
                'structura_actionscheduler_packet_size',
                'critical',
                __('MySQL packet size is too small for reliable background tasks', 'structura'),
                sprintf(
                    /* translators: 1: current packet size (e.g. "1 MB"), 2: recommended floor (e.g. "4 MB") */
                    __('Your MySQL server reports <code>max_allowed_packet = %1$s</code>. Structura queues background tasks (image generation, campaign steps) in the <code>wp_actionscheduler_actions</code> table, and rows can exceed this limit on a busy site. When that happens the task is silently dropped and you see no featured image and no error. We recommend at least <strong>%2$s</strong>. Most shared hosts will raise this on request.', 'structura'),
                    size_format($limit),
                    size_format(self::MAX_ALLOWED_PACKET_FLOOR_BYTES)
                ),
                __('Read the troubleshooting guide', 'structura')
            );
        }

        return self::result(
            'structura_actionscheduler_packet_size',
            'good',
            __('MySQL packet size is sufficient for background tasks', 'structura'),
            sprintf(
                /* translators: %s: current packet size */
                __('Your MySQL server reports <code>max_allowed_packet = %s</code>, which is large enough for Structura\'s background task queue.', 'structura'),
                size_format($limit)
            ),
            null,
            'green'
        );
    }

    /**
     * Detects `DISABLE_WP_CRON` + missing system-cron fallback.
     *
     * Action Scheduler piggybacks on `wp_loaded` for opportunistic
     * dispatch, but on low-traffic sites the dispatch tick only happens
     * when someone loads a page. If WP-Cron is disabled *and* no system
     * cron hits `wp-cron.php`, background tasks stack up indefinitely —
     * users see "enqueued" in the logs and nothing more.
     *
     * We can detect the constant reliably. We cannot detect the presence
     * of an external system-cron job, so the warning is advisory.
     */
    public static function test_wp_cron_enabled(): array
    {
        if (defined('DISABLE_WP_CRON') && DISABLE_WP_CRON) {
            return self::result(
                'structura_wp_cron_enabled',
                'recommended',
                __('WordPress cron is disabled — verify your system cron is configured', 'structura'),
                __('Your <code>wp-config.php</code> sets <code>DISABLE_WP_CRON</code> to true. Structura\'s background tasks (image generation, scheduled campaigns) rely on Action Scheduler, which requires <strong>either</strong> WP-Cron <strong>or</strong> a system cron job hitting <code>wp-cron.php</code>. If you don\'t have a system cron set up, queued image tasks will never run.', 'structura'),
                __('Read the troubleshooting guide', 'structura')
            );
        }

        return self::result(
            'structura_wp_cron_enabled',
            'good',
            __('WordPress cron is enabled', 'structura'),
            __('Structura\'s background tasks can be dispatched via WP-Cron.', 'structura'),
            null,
            'green'
        );
    }

    /**
     * Detects an unwritable `wp-content/uploads/` directory.
     *
     * `wp_upload_dir()` caches the result of its readiness check, so
     * calling `wp_upload_dir()` and inspecting the `error` key is enough
     * — we don't need to touch the filesystem ourselves.
     */
    public static function test_uploads_writable(): array
    {
        $upload_dir = wp_upload_dir();

        if ( ! empty($upload_dir['error'])) {
            return self::result(
                'structura_uploads_writable',
                'critical',
                __('WordPress uploads directory is not writable', 'structura'),
                sprintf(
                    /* translators: %s: error message from wp_upload_dir() */
                    __('WordPress reports: <code>%s</code>. Structura saves generated images to the uploads directory via <code>media_handle_sideload</code> — if WordPress can\'t write there, image generation will fail every time.', 'structura'),
                    esc_html($upload_dir['error'])
                ),
                __('Read the troubleshooting guide', 'structura')
            );
        }

        return self::result(
            'structura_uploads_writable',
            'good',
            __('WordPress uploads directory is writable', 'structura'),
            sprintf(
                /* translators: %s: absolute path to the uploads directory */
                __('Generated images will be saved to <code>%s</code>.', 'structura'),
                esc_html($upload_dir['basedir'])
            ),
            null,
            'green'
        );
    }

    /**
     * Query `max_allowed_packet` in bytes.
     *
     * Returns `null` when the query fails or the value looks impossible.
     * Using `$wpdb->get_var` rather than a higher-level helper keeps this
     * testable with Brain Monkey + Mockery (no `$wpdb` globals in unit
     * tests).
     */
    private static function query_max_allowed_packet(): ?int
    {
        global $wpdb;

        if ( ! isset($wpdb) || ! is_object($wpdb)) {
            return null;
        }

        $value = $wpdb->get_var("SHOW VARIABLES LIKE 'max_allowed_packet'", 1);

        if ($value === null || $value === '') {
            return null;
        }

        $bytes = (int)$value;

        // Some MySQL servers return the value as bytes directly, some as
        // a string like "16777216". A value below 1 KB is almost certainly
        // a parsing failure, not a real setting.
        if ($bytes < 1024) {
            return null;
        }

        return $bytes;
    }

    /**
     * Shape a Site Health result. Keeps the three test methods terse.
     *
     * @param string      $test_id            Matches the filter key.
     * @param string      $status             'good' | 'recommended' | 'critical'.
     * @param string      $label              Short label for the card.
     * @param string      $description_html   Already-escaped HTML body.
     * @param string|null $action_label       If set, renders a link to the
     *                                        troubleshooting docs.
     * @param string      $badge_color        Color of the badge pill.
     */
    private static function result(
        string $test_id,
        string $status,
        string $label,
        string $description_html,
        ?string $action_label,
        string $badge_color = 'orange'
    ): array {
        $result = [
            'label'       => $label,
            'status'      => $status,
            'badge'       => [
                'label' => __('Structura', 'structura'),
                'color' => $status === 'good' ? 'green' : $badge_color,
            ],
            'description' => '<p>' . $description_html . '</p>',
            'test'        => $test_id,
        ];

        if ($action_label !== null) {
            $result['actions'] = sprintf(
                '<p><a href="%1$s" target="_blank" rel="noopener">%2$s <span class="screen-reader-text"> %3$s</span><span aria-hidden="true" class="dashicons dashicons-external"></span></a></p>',
                esc_url(self::DOCS_TROUBLESHOOTING_URL),
                esc_html($action_label),
                esc_html__('(opens in a new tab)', 'structura')
            );
        }

        return $result;
    }
}
