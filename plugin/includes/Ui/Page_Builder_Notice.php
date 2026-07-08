<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * wp-admin banner shown when Structura detects a page builder that
 * would otherwise hijack generated-post rendering.
 *
 * Spec: `specs/page-builder-compat.md` §3.2 + §4. The detection
 * itself runs via `Structura\Compat\Builder_Detector` on plugin
 * activation and on a daily Action Scheduler recheck; results land
 * in the site option `structura_detected_page_builders`. This class
 * reads that option — it never probes the environment on every
 * admin request, which matters because the notice renders on
 * `admin_notices`, i.e. on literally every admin screen.
 *
 * ### Which builders trigger the notice
 *
 * Only the ones we actively opt out against via
 * `Builder_Compat::opt_out_meta()` — Divi and WPBakery today. The
 * rationale is that this notice's job is to explain something the
 * plugin *did* ("we just neutralised your page builder for posts
 * we insert"); showing the notice for Elementor / Beaver / Brizy /
 * Bricks would be a notice about a *hypothetical* ("if you ever
 * opt this post into the builder, your Gutenberg content will
 * disappear"), which lives in the campaign-editor inline card
 * instead (§4.2). Keeping the two surfaces semantically distinct
 * avoids notice fatigue.
 *
 * ### Dismissal model: per-user, not site-level
 *
 * Unlike sibling notices that use a site-level option because most
 * Structura sites have one admin, this notice can surface on agency-run
 * sites where the campaign editor is a different human than the site
 * owner who first saw the banner. Per-user dismissal via `user_meta`
 * means each admin who touches the screen gets the heads-up exactly
 * once rather than silently missing it because a colleague clicked ×
 * last Tuesday.
 *
 * The trade-off is a small `user_meta` row per admin, which at the
 * scale Structura operates (small businesses, agencies) is
 * negligible — WP already writes many such rows per user for its
 * own dismissed-pointer machinery.
 */
class Page_Builder_Notice
{
    /** @var string user_meta key — 'yes' when dismissed, otherwise unset. */
    public const META_DISMISSED = 'structura_page_builder_notice_dismissed';

    /** @var string admin-ajax action name for the dismissal POST. */
    public const AJAX_ACTION = 'structura_dismiss_page_builder_notice';

    /** @var string option name where Builder_Detector stashes its last result. */
    public const OPTION_DETECTED = 'structura_detected_page_builders';

    /**
     * Builders whose detection should *trigger* this notice. See the
     * class docblock for why Elementor et al. are excluded.
     *
     * Keep this list in sync with the `kind === 'atomic-meta'`
     * entries in `Builder_Detector::probe_table()`. The `BuilderDetector`
     * test suite pins both lists against a shared source of truth
     * so drift is caught at CI time.
     *
     * @var string[]
     */
    private const NOTIFIABLE_SLUGS = ['divi', 'wpbakery'];

    public static function init(): void
    {
        add_action('admin_notices', [self::class, 'maybe_render']);
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handle_dismiss']);
    }

    /**
     * Render the notice iff:
     *   - the current user can manage plugin settings (matches
     *     `Rest_Api::check_permission`),
     *   - the user hasn't previously dismissed it,
     *   - the cached detection includes at least one notifiable
     *     builder (Divi or WPBakery).
     *
     * The capability check keeps editors / authors / contributors
     * out of scope — they can't change Divi's Default Editor option
     * even if they wanted to, so the notice would be pure noise.
     */
    public static function maybe_render(): void
    {
        if ( ! current_user_can('manage_options')) {
            return;
        }

        $user_id = get_current_user_id();
        if ($user_id && get_user_meta($user_id, self::META_DISMISSED, true) === 'yes') {
            return;
        }

        $notifiable = self::notifiable_detections();
        if ($notifiable === []) {
            return;
        }

        $labels     = array_column($notifiable, 'label');
        $first_slug = $notifiable[0]['docs_slug'] ?? $notifiable[0]['slug'];
        $locale     = self::docs_locale();
        $docs_url   = self::docs_url($locale, $first_slug);
        $ajax_url   = admin_url('admin-ajax.php');
        $nonce      = wp_create_nonce(self::AJAX_ACTION);
        $action     = self::AJAX_ACTION;

        // Headline names the detected builders literally — less
        // jargon, and the matching docs page title reinforces that
        // the reader is in the right place.
        $builder_list = self::human_list($labels);
        ?>
        <div class="notice notice-info is-dismissible" id="structura-page-builder-notice">
            <p>
                <strong><?php
                    echo esc_html(sprintf(
                        /* translators: %s: comma-separated list of page-builder display names, e.g. "Divi" or "Divi and WPBakery". */
                        __('Structura detected %s on this site.', 'structura'),
                        $builder_list
                    ));
                ?></strong>
                <?php echo esc_html__(
                    'Structura-generated posts already include an opt-out flag so the builder does not hijack their rendering. If a post still renders blank on the front end, check your theme builder template.',
                    'structura'
                ); ?>
                <a
                    href="<?php echo esc_url($docs_url); ?>"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="margin-left: 6px;"
                >
                    <?php echo esc_html__('Read the compatibility guide', 'structura'); ?>
                </a>
            </p>
        </div>
        <script>
        (function () {
            var notice = document.getElementById('structura-page-builder-notice');
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
     * Handle the dismissal POST. Silent no-op on nonce / cap failure so
     * a stale tab can't scare the user with an error banner.
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
            update_user_meta($user_id, self::META_DISMISSED, 'yes');
        }
        wp_send_json_success(['dismissed' => true]);
    }

    /**
     * Filter the cached detection map down to builders that should
     * actually trigger this notice. Returns an array where each
     * entry has at least `slug`, `label`, `docs_slug` — the same
     * shape `Builder_Detector::detect()` returns, with the slug
     * hoisted from the key so consumers can iterate numerically.
     *
     * Public for the unit test; the REST endpoint and the
     * campaign-editor card compose their own filters.
     *
     * @return array<int, array{slug: string, label: string, kind: string, docs_slug: string}>
     */
    public static function notifiable_detections(): array
    {
        $raw = get_option(self::OPTION_DETECTED, []);
        if ( ! is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $slug => $entry) {
            if ( ! is_array($entry)) {
                continue;
            }
            if ( ! in_array($slug, self::NOTIFIABLE_SLUGS, true)) {
                continue;
            }
            $out[] = [
                'slug'      => (string)$slug,
                'label'     => (string)($entry['label'] ?? $slug),
                'kind'      => (string)($entry['kind'] ?? 'atomic-meta'),
                'docs_slug' => (string)($entry['docs_slug'] ?? $slug),
            ];
        }
        return $out;
    }

    /**
     * Resolve the docs locale from the site locale.
     *
     * Docs ship in en / de / es / fr at the *config* level
     * (`docs/next.config.mjs` i18n.locales), but `docs/content/` only
     * contains `en/` for now — the de/es/fr translations are deferred
     * to phase 2 of `specs/docs-site-rewrite.md` (§8). The Nextra
     * locale middleware will happily redirect a German-speaking
     * visitor at `https://docs.structurawp.com/de/...` straight into
     * a 404, so until the translated content lands we MUST emit
     * English URLs even on de/es/fr WordPress installs.
     *
     * Phase-2 unfreeze: drop the `return 'en'` short-circuit. The
     * WP-locale → docs-locale mapping below is preserved so that's
     * a one-line revert. Keep the supported list in sync with
     * `packages/i18n-contracts/src/locales.ts`.
     */
    private static function docs_locale(): string
    {
        // Phase-1 short-circuit. Flip this to true (or just delete the
        // guard and the helper-internal flag) when the de/es/fr content
        // directories ship — the WP-locale branch below is preserved so
        // unfreezing is a one-line change rather than a re-implementation.
        $docs_i18n_phase_2_complete = false;
        if ( ! $docs_i18n_phase_2_complete) {
            return 'en';
        }

        $locale = function_exists('determine_locale') ? determine_locale() : get_locale();
        $short  = strtolower(substr((string)$locale, 0, 2));
        $supported = ['en', 'de', 'es', 'fr'];
        return in_array($short, $supported, true) ? $short : 'en';
    }

    /**
     * Build the canonical docs URL for a given locale + builder slug.
     * Centralised so the admin notice, the REST endpoint, and any
     * future surface all link to the same URL shape.
     */
    private static function docs_url(string $locale, string $slug): string
    {
        return sprintf(
            'https://docs.structurawp.com/%s/troubleshooting/page-builders/%s',
            rawurlencode($locale),
            rawurlencode($slug)
        );
    }

    /**
     * Render a list of labels as natural language: `["Divi"]` →
     * `"Divi"`, `["Divi", "WPBakery"]` → `"Divi and WPBakery"`.
     * Translators-friendly because we join with `__('and')` rather
     * than a hardcoded English conjunction.
     *
     * @param string[] $labels
     */
    private static function human_list(array $labels): string
    {
        $count = count($labels);
        if ($count === 0) {
            return '';
        }
        if ($count === 1) {
            return (string)$labels[0];
        }
        if ($count === 2) {
            return sprintf(
                /* translators: 1/2: page-builder display names, joined as "A and B". */
                __('%1$s and %2$s', 'structura'),
                $labels[0],
                $labels[1]
            );
        }
        // 3+ builders is a rare agency-site edge; fall back to comma
        // join with an Oxford-and. Not ideal for every locale, but
        // the notice's body is short enough that the reader gets
        // the point either way.
        $tail = array_pop($labels);
        return sprintf(
            /* translators: 1: comma-separated list, 2: last item — "A, B, and C". */
            __('%1$s, and %2$s', 'structura'),
            implode(', ', $labels),
            $tail
        );
    }
}
