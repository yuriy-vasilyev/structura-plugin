<?php

namespace Structura\Ui;

use Structura\Core\Site_Reachability;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * wp-admin banner shown on every page when the cloud could not reach
 * this site's blueprint webhook on the last handshake probe.
 *
 * ### Why a dedicated notice surface
 *
 * Mirrors `Wp_Cron_Disabled_Notice`. Both failures are silent and
 * catastrophic — a campaign shows "running" but no post ever lands —
 * and both deserve a banner the operator can't miss rather than a
 * Site-Health page nobody opens. Where WP-Cron is a local config the
 * plugin can read synchronously, reachability can only be known from
 * the real cloud → plugin round-trip; this notice reads the cached
 * verdict that `Site_Reachability` refreshes on the daily cron, after
 * activation, and on the manual pulse button.
 *
 * ### Detection logic
 *
 * `Site_Reachability::is_unreachable()` — true only when a probe has
 * actually run AND reported the cloud could not POST back. An
 * un-probed site (fresh install before the first handshake) and a site
 * whose own egress to the cloud was down (a different fault) both read
 * as "not triggered" so we never cry wolf.
 *
 * Per-user dismissal with a 14-day re-prompt — shorter than the
 * WP-Cron notice's 90 days because an unreachable site is actively
 * losing every scheduled post, so a quieter-but-sooner re-nudge is
 * warranted. If the next probe flips to reachable the banner clears on
 * its own regardless of dismissal (is_triggered short-circuits).
 *
 * ### Visual weight
 *
 * Stock `notice-error` (red), same reasoning as the WP-Cron notice:
 * yellow reads as "informational" and gets skipped, but the failure
 * mode here is total.
 */
class Site_Unreachable_Notice
{
    /** @var string user-meta key; value is a dismissal epoch timestamp. */
    public const META_DISMISSED_AT = 'structura_site_unreachable_notice_dismissed_at';

    /** @var string admin-ajax action name for the dismissal POST. */
    public const AJAX_ACTION = 'structura_dismiss_site_unreachable_notice';

    /**
     * @var int Dismissal window in seconds (14 days). After this interval
     * the banner re-surfaces if the site is still unreachable.
     */
    public const DISMISSAL_TTL = 14 * DAY_IN_SECONDS;

    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_render']);
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handle_dismiss']);
    }

    /**
     * Render unless (a) the site is reachable / unprobed, (b) the viewer
     * can't act on it, or (c) dismissed within the 14-day window.
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
        <div class="notice notice-error" id="structura-site-unreachable-notice">
            <p style="margin: 0.5em 0;">
                <strong><?php echo esc_html__('Structura: the cloud can\'t reach this site', 'structura'); ?></strong>
            </p>
            <p style="margin: 0.5em 0;">
                <?php echo esc_html__(
                    'Structura generates every post in the cloud and delivers it back to your site over a secure webhook. The last connection check could not reach this site — common causes are a local/staging URL (localhost, *.local, *.test), a private network address, HTTP password protection, or a firewall blocking incoming requests. Until the cloud can reach your site, campaigns will run but no posts will ever arrive.',
                    'structura'
                ); ?>
            </p>
            <p style="margin: 0.75em 0 0.5em;">
                <?php // `run=connection-check` makes Settings auto-fire the
                      // Bridge Diagnostics pulse (which re-probes cloud→site
                      // reachability and clears this banner on success), so the
                      // button actually RUNS a check instead of just landing
                      // the user on Settings. ?>
                <a href="<?php echo esc_url(admin_url('admin.php?page=structura#/settings?run=connection-check')); ?>" class="button button-primary" style="margin-right: 8px;">
                    <?php echo esc_html__('Run a connection check', 'structura'); ?>
                </a>
                <button
                    type="button"
                    class="button-link"
                    id="structura-site-unreachable-notice-dismiss"
                    style="color: #646970; text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0;"
                >
                    <?php echo esc_html__('Dismiss for now', 'structura'); ?>
                </button>
            </p>
        </div>
        <script>
        (function () {
            var btn = document.getElementById('structura-site-unreachable-notice-dismiss');
            var notice = document.getElementById('structura-site-unreachable-notice');
            if ( ! btn || ! notice) return;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var body = new FormData();
                body.append('action', <?php echo wp_json_encode($action); ?>);
                body.append('_wpnonce', <?php echo wp_json_encode($nonce); ?>);
                // Optimistic hide — the POST reconciles server-side. If it
                // fails, the worst case is the banner reappears next page
                // load, an acceptable degradation.
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
     * Persist per-user dismissal. Silent no-op on nonce / cap failure so
     * a stale tab can't scare the user with an error.
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
     * True when the notice should be shown — i.e. the last reachability
     * probe found the cloud could not reach this site. Delegates to the
     * shared `Site_Reachability` verdict so the wp-admin banner, the
     * in-SPA banner, and the diagnostics run never disagree.
     */
    public static function is_triggered(): bool
    {
        return Site_Reachability::is_unreachable();
    }
}
