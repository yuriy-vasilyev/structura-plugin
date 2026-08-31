<?php

namespace Structura\Ui;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Enqueue helpers for the static assets behind Structura's wp-admin
 * notices and dashboard widget.
 *
 * Why this exists: the wp.org plugin review (2026-08-27) flagged every
 * inline `<script>` / `<style>` block our notices printed. WordPress
 * wants static JS/CSS to go through `wp_enqueue_script()` /
 * `wp_enqueue_style()` so it can dedupe, version, and let site owners
 * filter them. The notices now emit markup + data attributes only and
 * call one of these helpers; the behaviour lives in
 * `assets-static/admin-notices.js` and the two stylesheets.
 *
 * Timing: `wp_enqueue_*` may only run once `admin_enqueue_scripts` has
 * fired (earlier calls trip `_doing_it_wrong`). The notices render on
 * `admin_notices`, which is later in the same request, so enqueueing
 * from inside a render callback is safe — WordPress prints late
 * scripts in the admin footer and late styles via `print_late_styles()`.
 * Anything that must be styled before first paint (the attention card,
 * the dashboard widget) enqueues its stylesheet from
 * `admin_enqueue_scripts` instead, gated on the same predicate its
 * render path uses.
 */
class Admin_Notice_Assets
{
    public const SCRIPT_HANDLE            = 'structura-admin-notices';
    public const ATTENTION_STYLE_HANDLE   = 'structura-attention-notice';
    public const WIDGET_STYLE_HANDLE      = 'structura-dashboard-widget';

    /**
     * Enqueue the shared dismiss handler. Idempotent — WordPress ignores
     * a second enqueue of the same handle, so every notice on the page
     * can call this without coordinating.
     */
    public static function enqueue_dismiss_script(): void
    {
        wp_enqueue_script(
            self::SCRIPT_HANDLE,
            STRUCTURA_URL . 'assets-static/admin-notices.js',
            [],
            STRUCTURA_VERSION,
            true
        );
    }

    /** Stylesheet for {@see Attention_Admin_Notice}. */
    public static function enqueue_attention_style(): void
    {
        wp_enqueue_style(
            self::ATTENTION_STYLE_HANDLE,
            STRUCTURA_URL . 'assets-static/attention-notice.css',
            [],
            STRUCTURA_VERSION
        );
    }

    /** Stylesheet for {@see Dashboard_Widget}. */
    public static function enqueue_widget_style(): void
    {
        wp_enqueue_style(
            self::WIDGET_STYLE_HANDLE,
            STRUCTURA_URL . 'assets-static/dashboard-widget.css',
            [],
            STRUCTURA_VERSION
        );
    }
}
