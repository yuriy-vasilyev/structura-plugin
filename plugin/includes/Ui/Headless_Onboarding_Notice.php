<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * One-time admin notice for `cms.*` installs that probably want headless
 * mode set up.
 *
 * Spec: `specs/site-identity-headless.md` §7.
 *
 * Detection
 * ---------
 * We gate the banner on a single, cheap signal: the WP install's host
 * starts with `cms.` (e.g. `cms.xerx.io`, `cms.formulafoundry.io`). This
 * catches the obvious case without:
 *   - probing the parent domain (would burn an outbound request on every
 *     wp-admin page-load until dismissed)
 *   - false-positiving on legitimate sub-brand setups (`blog.acme.com`
 *     IS the public face — nothing for us to nudge)
 *
 * Operators of headless setups that don't follow the `cms.*` convention
 * discover the feature through the docs page + Settings → General. The
 * banner is a high-precision shortcut, not a complete onboarding gate.
 *
 * Dismissal
 * ---------
 * Site-level option. Per-user dismissal would be more correct in theory
 * but Structura sites typically have a single admin and the option
 * simplifies cleanup.
 *
 * The banner ALSO suppresses itself once headless mode is enabled —
 * if the operator turned headless on through any path, the nudge is
 * obviously no longer needed.
 */
class Headless_Onboarding_Notice
{
    /** Site-level flag. 'yes' = dismissed, default = show. */
    public const OPTION_DISMISSED = 'structura_headless_onboarding_notice_dismissed';

    /** admin-ajax action name. */
    public const AJAX_ACTION = 'structura_dismiss_headless_onboarding_notice';

    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_render']);
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handle_dismiss']);
    }

    /**
     * Render the notice unless one of the suppression conditions applies:
     *   - viewer can't manage options (subscribers / contributors / editors)
     *   - already dismissed
     *   - host doesn't match `cms.*` (the trigger signal)
     *   - headless mode is already on (operator went straight to settings)
     */
    public static function maybe_render(): void
    {
        if ( ! current_user_can('manage_options')) {
            return;
        }

        if (get_option(self::OPTION_DISMISSED, 'no') === 'yes') {
            return;
        }

        if ( ! self::host_looks_headless()) {
            return;
        }

        // If the operator has already enabled headless mode (via the
        // settings card or via the legacy `STRUCTURA_MARKETING_SITE_URL`
        // constant seeding), the nudge is moot. Reading the option
        // directly avoids the cost of constructing the full
        // `Public_Site_Profile` object on every admin page-load.
        $option = get_option(\Structura\Core\Public_Site_Profile::OPTION_NAME, []);
        if (is_array($option) && ! empty($option['isHeadless'])) {
            return;
        }

        // Docs link is hardcoded to /en/ for now — the docs site routes
        // every URL through `[lang]` and de/es/fr translations of
        // `using/headless-mode` already exist. Pinning to /en/ matches
        // the SPA's `docsUrl()` helper, which still hardcodes the
        // locale (see client/src/utils/docsUrl.ts) — when that helper
        // becomes locale-aware, mirror the change here.
        $docs_url = 'https://docs.structurawp.com/en/using/headless-mode';
        $ajax_url = admin_url('admin-ajax.php');
        $nonce    = wp_create_nonce(self::AJAX_ACTION);
        $action   = self::AJAX_ACTION;

        ?>
        <div class="notice notice-info is-dismissible" id="structura-headless-onboarding-notice">
            <p>
                <strong><?php echo esc_html__('Is this a headless WordPress install?', 'structura'); ?></strong>
                <?php echo esc_html__(
                    'Your site lives at a "cms." subdomain — if your readers visit a different website (e.g. xerx.io) and this WordPress install only stores content, set up the public website URL so Structura\'s suggestions, internal links, and channel shares point to the right place.',
                    'structura'
                ); ?>
                <a href="<?php echo esc_url(admin_url('admin.php?page=structura#/settings')); ?>" style="margin-left: 6px;">
                    <?php echo esc_html__('Set up public website', 'structura'); ?>
                </a>
                <span style="margin: 0 6px; color: #999;">·</span>
                <a href="<?php echo esc_url($docs_url); ?>" target="_blank" rel="noopener noreferrer">
                    <?php echo esc_html__('Read the guide', 'structura'); ?>
                </a>
            </p>
        </div>
        <script>
        (function () {
            var notice = document.getElementById('structura-headless-onboarding-notice');
            if (!notice) return;
            notice.addEventListener('click', function (e) {
                var target = e.target;
                if (!target || !target.classList || !target.classList.contains('notice-dismiss')) {
                    return;
                }
                var body = new FormData();
                body.append('action', <?php echo wp_json_encode($action); ?>);
                body.append('_wpnonce', <?php echo wp_json_encode($nonce); ?>);
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
     * Persist the dismissal. Same nonce + capability gate as every
     * Structura admin notice; bad nonce is silent no-op so stale tabs
     * don't surface scary errors.
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

        update_option(self::OPTION_DISMISSED, 'yes');
        wp_send_json_success(['dismissed' => true]);
    }

    /**
     * Pure detection helper. Public + static so tests can hit it
     * directly without spinning up the WP admin context.
     *
     * Matches `cms.<anything>` hosts (case-insensitive). Anything else
     * — bare-domain WP installs, `blog.example.com`, `staging.example.com`,
     * IP-only addresses — falls through to "looks like a normal install"
     * and the nudge stays quiet.
     */
    public static function host_looks_headless(): bool
    {
        $host = wp_parse_url(home_url(), PHP_URL_HOST);
        if ( ! is_string($host) || $host === '') {
            return false;
        }
        return stripos($host, 'cms.') === 0;
    }
}
