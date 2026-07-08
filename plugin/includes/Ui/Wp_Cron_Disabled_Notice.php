<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * wp-admin banner shown on every page when `DISABLE_WP_CRON` is set
 * in `wp-config.php` without a system-cron replacement visible to
 * Structura.
 *
 * ### Why a dedicated notice surface
 *
 * `Core\Site_Health::test_wp_cron_enabled()` already reports this
 * via Tools → Site Health, but Site Health is a page nobody opens
 * unless directed to. The symptom of "scheduled campaigns never
 * run / queued images never appear" is catastrophic enough that it
 * warrants a cross-wp-admin banner the operator can't miss — the
 * same reasoning as `Attention_Admin_Notice` for unacknowledged
 * failed runs (spec `plugin-quiet-mode.md` §7).
 *
 * ### Detection logic
 *
 * `DISABLE_WP_CRON === true` in wp-config is the primary signal.
 * We cannot *directly* confirm whether a system cron is hitting
 * `wp-cron.php` on schedule (there's no universal way to introspect
 * the host's crontab from PHP). Instead we accept that the user may
 * legitimately have system cron configured; the notice offers an
 * "I've got this covered" acknowledgement that dismisses it
 * per-user for 90 days. If the constant is still true at the end of
 * that window, the notice re-surfaces — a system-cron rig that
 * broke silently three months ago is exactly what we want to catch.
 *
 * Per-user rather than site-level dismissal because agency-run
 * sites often have multiple admins, and the colleague who knows
 * the server cron setup may not be the one who sees Structura.
 *
 * ### Visual weight
 *
 * Stock `notice-error` (red). Deliberately not `notice-warning`
 * (yellow) because the failure mode is silent: campaigns look
 * "active" in the UI but never run. Users interpret yellow as
 * "informational" and skip it. Red + explicit "campaigns will not
 * run" copy + a clear CTA gets acted on.
 */
class Wp_Cron_Disabled_Notice
{
    /** @var string user-meta key; value is a dismissal epoch timestamp. */
    public const META_DISMISSED_AT = 'structura_wp_cron_notice_dismissed_at';

    /** @var string admin-ajax action name for the dismissal POST. */
    public const AJAX_ACTION = 'structura_dismiss_wp_cron_notice';

    /**
     * @var int Dismissal window in seconds (90 days). After this
     * interval the banner re-surfaces even if the user previously
     * acknowledged. Intentional: a system-cron rig can silently
     * break (hostname change, crontab wipe on migration) and we
     * want the re-prompt.
     */
    public const DISMISSAL_TTL = 90 * DAY_IN_SECONDS;

    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_render']);
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handle_dismiss']);
    }

    /**
     * Render unless (a) the condition isn't met, (b) the viewer can't
     * act on it, or (c) dismissed within the 90-day window.
     */
    public static function maybe_render(): void
    {
        if ( ! self::is_triggered()) {
            return;
        }

        if ( ! current_user_can('manage_options')) {
            return;
        }

        $user_id = get_current_user_id();
        if ($user_id) {
            $dismissed_at = (int)get_user_meta($user_id, self::META_DISMISSED_AT, true);
            if ($dismissed_at > 0 && (time() - $dismissed_at) < self::DISMISSAL_TTL) {
                return;
            }
        }

        $ajax_url = admin_url('admin-ajax.php');
        $nonce    = wp_create_nonce(self::AJAX_ACTION);
        $action   = self::AJAX_ACTION;
        ?>
        <div class="notice notice-error" id="structura-wp-cron-notice">
            <p style="margin: 0.5em 0;">
                <strong><?php echo esc_html__('Structura: WordPress cron is disabled', 'structura'); ?></strong>
            </p>
            <p style="margin: 0.5em 0;">
                <?php echo esc_html__(
                    'Your site sets DISABLE_WP_CRON in wp-config.php. Structura\'s campaigns, image generation, and scheduled tasks all rely on Action Scheduler, which needs either WP-Cron or a system cron hitting wp-cron.php. Without one, queued tasks will never run — your scheduled posts will stall silently.',
                    'structura'
                ); ?>
            </p>
            <p style="margin: 0.75em 0 0.5em;">
                <a href="<?php echo esc_url(admin_url('admin.php?page=structura#/settings')); ?>" class="button button-primary" style="margin-right: 8px;">
                    <?php echo esc_html__('View Structura settings', 'structura'); ?>
                </a>
                <button
                    type="button"
                    class="button-link"
                    id="structura-wp-cron-notice-dismiss"
                    style="color: #646970; text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0;"
                >
                    <?php echo esc_html__('I have a system cron configured', 'structura'); ?>
                </button>
            </p>
        </div>
        <script>
        (function () {
            var btn = document.getElementById('structura-wp-cron-notice-dismiss');
            var notice = document.getElementById('structura-wp-cron-notice');
            if ( ! btn || ! notice) return;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var body = new FormData();
                body.append('action', <?php echo wp_json_encode($action); ?>);
                body.append('_wpnonce', <?php echo wp_json_encode($nonce); ?>);
                // Optimistic hide — the POST reconciles server-side. If
                // the POST fails, the worst case is the banner reappears
                // on the next page load, which is an acceptable
                // degradation.
                notice.style.display = 'none';
                fetch(<?php echo wp_json_encode($ajax_url); ?>, {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: body
                });
            });
        })();
        </script>
        <?php
    }

    /**
     * Persist per-user dismissal. Silent no-op on nonce / cap
     * failure so a stale tab can't scare the user with an error.
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

        $user_id = get_current_user_id();
        if ($user_id) {
            update_user_meta($user_id, self::META_DISMISSED_AT, time());
        }
        wp_send_json_success(['dismissed_at' => time()]);
    }

    /**
     * True when the notice should be shown — i.e. WP-Cron is
     * disabled. Factored out so the SPA config localiser and
     * unit tests can share the detection.
     */
    public static function is_triggered(): bool
    {
        return defined('DISABLE_WP_CRON') && DISABLE_WP_CRON === true;
    }
}
