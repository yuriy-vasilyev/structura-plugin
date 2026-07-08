<?php

namespace Structura\Compat;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Page-builder compatibility shims.
 *
 * A small number of WordPress page builders replace the `the_content`
 * rendering pipeline with their own shortcode / layout loader. When a
 * builder takes over a post, Gutenberg blocks in `post_content` are
 * silently dropped on render — the admin UI shows a builder placeholder
 * ("This layout is built with Divi", etc.) and the front-end body appears
 * empty. Yoast and other content analyzers still see the raw blocks
 * because they read `post_content` directly, so the observed symptom is
 * "keyphrase analysis passes, post renders blank".
 *
 * The opt-out surface is always the same shape: a post-meta flag on the
 * post that tells the builder "this post isn't mine, hands off". If we
 * write that meta atomically via `wp_insert_post`'s `meta_input` argument
 * WP persists it *before* firing `save_post`, so the builder's own
 * save-handler sees a populated meta and skips its auto-enable branch.
 * This is the race-proof shape — writing after `wp_insert_post` via
 * `update_post_meta` loses the race on sites where Divi's "Default
 * Editor" option is set to "Divi Builder".
 *
 * ### Currently-written opt-outs
 *
 * - **Divi** (`_et_pb_use_builder = 'off'`) — Divi's "Default Editor" site
 *   option, when set to "Divi Builder", installs a `save_post` hook that
 *   writes `'on'` into every new post on its own. Our pre-existing
 *   `'off'` wins the race. Confirmed breakage on a client site 2026-04-23.
 * - **WPBakery** (`_wpb_vc_js_status = 'false'`) — defensive; WPBakery
 *   reads this flag when deciding whether to render its frontend
 *   shortcode parser. The default is already `false` when the meta is
 *   absent, but writing it explicitly documents intent and neutralises
 *   any third-party add-on that might flip it.
 *
 * ### Deliberately not written
 *
 * Elementor (`_elementor_edit_mode`), Beaver Builder
 * (`_fl_builder_enabled`), Brizy (`brizy_post_uid`), and Bricks
 * (`_bricks_editor_mode`) are all strictly opt-in — they only take over
 * a post after the site owner explicitly clicks "Edit with <X>" in the
 * toolbar, which is the moment they write their own meta. Writing a
 * pre-emptive `''` would add meta rows without protecting against any
 * observed failure mode. If one of these builders is reported to
 * auto-enable in the future, add it to `opt_out_meta()` with a reference
 * to the incident.
 *
 * @since 1.x.0
 */
final class Builder_Compat
{
    /**
     * Post-meta key/value map to merge into `wp_insert_post`'s
     * `meta_input` so known page builders do not hijack rendering of
     * Structura-generated posts.
     *
     * Values are plain string scalars so they pass straight through WP's
     * meta sanitiser without coercion surprises. `_et_pb_use_builder` in
     * particular is compared with `===` against `'on'` / `'off'` inside
     * Divi — a boolean `false` would not match and the opt-out would
     * silently break.
     *
     * The meta writes are harmless on sites that don't have the
     * corresponding builder installed: the keys are just namespaced post
     * meta, and nothing in core reads them.
     *
     * @return array<string, string> Meta key => meta value, ready to be
     *                               merged into a `wp_insert_post` args
     *                               array under the `meta_input` key.
     */
    public static function opt_out_meta(): array
    {
        return [
            '_et_pb_use_builder' => 'off',
            '_wpb_vc_js_status'  => 'false',
        ];
    }
}
