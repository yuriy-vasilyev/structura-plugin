<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * wp-admin banner shown on every page when the WordPress uploads
 * directory is not writable — the condition that makes Structura's
 * image sideload (`media_handle_sideload`) fail for every generated
 * post.
 *
 * ### Why a dedicated notice surface
 *
 * `Core\Site_Health::test_uploads_writable()` already reports this via
 * Tools → Site Health, but that page is one nobody opens unless
 * directed to — and the failure mode is bad: with image generation on,
 * a sideload failure used to take down the whole post (a SiteGround
 * upload-permission case in the field — post-gen looked "successful" in
 * the cloud while nothing landed in WordPress). We now keep the post
 * (image-less) when sideload fails — see
 * `Task_Runner::receive_cloud_blueprint` — but the user still silently
 * loses every image until they fix permissions. A cross-wp-admin banner
 * with an explicit fix path is the right weight. Same reasoning as
 * {@see Wp_Cron_Disabled_Notice}.
 *
 * ### Detection
 *
 * `wp_upload_dir()` populates an `error` key when WordPress can't create
 * or write the uploads directory. It caches the readiness check, so this
 * is cheap to call on every admin page. {@see is_triggered()} is the
 * single source of truth, shared with the SPA bootstrap flag (so the
 * image toggles can disable themselves with a reason) and unit tests.
 *
 * ### Visual weight
 *
 * Stock `notice-error` (red). The failure is total for images, so yellow
 * "informational" weight would get skipped.
 */
class Image_Uploads_Unwritable_Notice
{
    /** @var string user-meta key; value is a dismissal epoch timestamp. */
    public const META_DISMISSED_AT = 'structura_uploads_notice_dismissed_at';

    /** @var string admin-ajax action name for the dismissal POST. */
    public const AJAX_ACTION = 'structura_dismiss_uploads_notice';

    /**
     * @var int Dismissal window (7 days). Shorter than the cron
     * notice's 90 because an unwritable uploads dir is an active,
     * fixable blocker — we want to re-prompt sooner if it isn't
     * resolved. Once the permission is fixed {@see is_triggered()}
     * returns false and the banner disappears on its own regardless.
     */
    public const DISMISSAL_TTL = 7 * DAY_IN_SECONDS;

    /**
     * @var string Public docs page explaining the cause + the
     * host-specific fix (SiteGround, etc.). Linked from the banner and
     * the disabled image toggles in the SPA.
     */
    public const DOCS_URL = 'https://docs.structurawp.com/troubleshooting/images-not-generating';

    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_render']);
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handle_dismiss']);
    }

    /**
     * Render unless (a) uploads are writable, (b) the viewer can't act,
     * or (c) dismissed within the window.
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
        <div class="notice notice-error" id="structura-uploads-notice">
            <p style="margin: 0.5em 0;">
                <strong><?php echo esc_html__('Structura: generated images can\'t be saved', 'structura'); ?></strong>
            </p>
            <p style="margin: 0.5em 0;">
                <?php echo esc_html__(
                    'WordPress can\'t write to your uploads directory (wp-content/uploads), so Structura can\'t save the images it generates. Your posts still publish, but without their images. This is usually a file-permission setting on your host — common on SiteGround and other managed hosts.',
                    'structura'
                ); ?>
            </p>
            <p style="margin: 0.75em 0 0.5em;">
                <a href="<?php echo esc_url(self::DOCS_URL); ?>" class="button button-primary" style="margin-right: 8px;" target="_blank" rel="noopener noreferrer">
                    <?php echo esc_html__('How to fix this', 'structura'); ?>
                </a>
                <button
                    type="button"
                    class="button-link"
                    id="structura-uploads-notice-dismiss"
                    style="color: #646970; text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0;"
                >
                    <?php echo esc_html__('Dismiss for now', 'structura'); ?>
                </button>
            </p>
        </div>
        <script>
        (function () {
            var btn = document.getElementById('structura-uploads-notice-dismiss');
            var notice = document.getElementById('structura-uploads-notice');
            if ( ! btn || ! notice) return;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var body = new FormData();
                body.append('action', <?php echo wp_json_encode($action); ?>);
                body.append('_wpnonce', <?php echo wp_json_encode($nonce); ?>);
                // Optimistic hide — the POST reconciles server-side. If it
                // fails the banner just reappears next page load.
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
     * True when the uploads directory is not writable. Shared by the
     * banner, the SPA bootstrap flag (which disables the image toggles),
     * and unit tests. Mirrors the probe in
     * `Core\Site_Health::test_uploads_writable()` — `wp_upload_dir()`
     * sets a non-empty `error` when it can't create/write the dir.
     */
    public static function is_triggered(): bool
    {
        $upload_dir = wp_upload_dir();

        return ! empty($upload_dir['error']);
    }
}
