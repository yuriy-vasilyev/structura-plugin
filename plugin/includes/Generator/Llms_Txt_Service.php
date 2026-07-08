<?php

namespace Structura\Generator;

use Structura\Compat\SEO_Plugin_Detector;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Fallback `/llms.txt` generator — serves an AI-crawler manifest ONLY
 * when no SEO plugin already owns the file.
 *
 * Background
 * ----------
 * llms.txt is a 2024-era convention: a markdown manifest at the site
 * root that points AI crawlers / answer engines at the canonical
 * content. By 2026 Yoast SEO and Rank Math both generate it natively
 * (SEOPress / AIOSEO adjacent). Structura's job is integration, not
 * duplication — the same posture we take on focus-keyword + meta
 * fields. So this service stands down the moment a capable SEO plugin
 * is active (see {@see SEO_Plugin_Detector::seo_plugin_owns_llms_txt}),
 * and only fills the gap on sites running none.
 *
 * Serving strategy
 * ----------------
 * Mirrors {@see \Structura\Channels\IndexNow_Key_Service}: an `init`
 * (priority 1) hook matches the request path against `/llms.txt` and
 * emits a plain-text/markdown body, then `exit`s — no rewrite rules,
 * no flush, no activation-hook coupling. Deferring is just an early
 * `return` (we never `exit`), so the SEO plugin's own handler runs
 * untouched. Headless installs: the hook simply never matches because
 * the public front end isn't this WP install.
 *
 * Opt-out
 * -------
 * The whole feature can be disabled with the
 * `structura/llms_txt/enabled` filter (default true). It activates
 * only as a fallback and honours `noindex` is moot here — when an SEO
 * plugin (the source of per-post noindex) is present we've already
 * deferred entirely.
 *
 * @since 1.x.0
 */
final class Llms_Txt_Service
{
    /** Canonical request path we answer. */
    private const PATH = '/llms.txt';

    /** Hard cap on listed entries — keeps the manifest bounded. */
    private const MAX_ENTRIES = 100;

    public static function init(): void
    {
        // Priority 1 for the same reason IndexNow uses it: act before
        // WP routes `/llms.txt` toward a 404.
        add_action('init', [self::class, 'maybe_serve'], 1);
    }

    /**
     * `init` hook: emit the manifest when the request is for `/llms.txt`
     * and we're the component that should serve it.
     */
    public static function maybe_serve(): void
    {
        $request_uri = isset($_SERVER['REQUEST_URI'])
            ? sanitize_text_field(wp_unslash((string) $_SERVER['REQUEST_URI']))
            : '';
        if ( ! self::matches_path($request_uri)) {
            return;
        }
        if ( ! self::should_serve()) {
            // Defer (SEO plugin owns it) or disabled — let WP route
            // normally so the other handler, if any, takes over.
            return;
        }

        nocache_headers();
        header('Content-Type: text/plain; charset=utf-8');
        $name    = (string) get_bloginfo('name');
        $tagline = (string) get_bloginfo('description');
        echo self::build_markdown($name, $tagline, self::collect_entries()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- markdown body, fields escaped inside build_markdown
        exit;
    }

    /**
     * True only for the exact `/llms.txt` path (query string ignored,
     * optional trailing slash tolerated). Pure + public for testing.
     */
    public static function matches_path(string $request_uri): bool
    {
        if ($request_uri === '') {
            return false;
        }
        $path = (string) wp_parse_url($request_uri, PHP_URL_PATH);
        if ($path === '') {
            return false;
        }
        return rtrim($path, '/') === rtrim(self::PATH, '/');
    }

    /**
     * Whether Structura should serve its fallback manifest: the feature
     * is enabled AND no SEO plugin already owns llms.txt.
     */
    public static function should_serve(): bool
    {
        if ( ! self::is_enabled()) {
            return false;
        }
        return ! SEO_Plugin_Detector::seo_plugin_owns_llms_txt();
    }

    /**
     * Feature gate. Default on (it only fires as a fallback); operators
     * can hard-disable in code via the filter.
     */
    public static function is_enabled(): bool
    {
        return (bool) apply_filters('structura/llms_txt/enabled', true);
    }

    /**
     * Build the llms.txt markdown body from a site name, tagline, and a
     * list of `{title, url, description}` entries. Pure — no WP calls —
     * so the format is unit-testable without a WP fixture.
     *
     * @param array<int, array{title: string, url: string, description: string}> $entries
     */
    public static function build_markdown(string $name, string $tagline, array $entries): string
    {
        $title = $name !== '' ? $name : 'Website';
        $lines = ['# ' . $title];
        if ($tagline !== '') {
            $lines[] = '';
            $lines[] = '> ' . $tagline;
        }
        $lines[] = '';
        $lines[] = '## Content';

        foreach ($entries as $entry) {
            $entry_title = trim($entry['title'] ?? '');
            $url         = trim($entry['url'] ?? '');
            if ($entry_title === '' || $url === '') {
                continue;
            }
            $desc = trim($entry['description'] ?? '');
            $line = '- [' . $entry_title . '](' . $url . ')';
            if ($desc !== '') {
                $line .= ': ' . $desc;
            }
            $lines[] = $line;
        }

        return implode("\n", $lines) . "\n";
    }

    /**
     * Collect published posts + pages as manifest entries, newest first.
     * Thin WP-querying glue around {@see build_markdown}.
     *
     * @return array<int, array{title: string, url: string, description: string}>
     */
    private static function collect_entries(): array
    {
        $posts = get_posts([
            'post_type'        => ['post', 'page'],
            'post_status'      => 'publish',
            'numberposts'      => self::MAX_ENTRIES,
            'orderby'          => 'date',
            'order'            => 'DESC',
            'suppress_filters' => false,
        ]);

        $entries = [];
        foreach ((array) $posts as $post) {
            $title = get_the_title($post);
            $url   = (string) get_permalink($post);
            if ($title === '' || $url === '') {
                continue;
            }
            // Prefer the hand-written excerpt; fall back to a trimmed
            // body. wp_trim_words strips tags + shortcodes for us.
            $excerpt = has_excerpt($post)
                ? get_the_excerpt($post)
                : wp_trim_words((string) ($post->post_content ?? ''), 30, '…');

            $entries[] = [
                'title'       => $title,
                'url'         => $url,
                'description' => (string) $excerpt,
            ];
        }

        return $entries;
    }
}
