<?php

namespace Structura\Compat;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Active SEO-plugin detection.
 *
 * Companion to {@see Builder_Detector}, same cheap-probe philosophy
 * (class / function / constant, no HTTP, no option reads). Structura
 * already *reads and writes* the major SEO plugins' focus-keyword and
 * meta-title/description fields (see `Scheduler\Context_Builder` and
 * `Scheduler\Task_Runner`) — we integrate with them rather than fight
 * them. This detector extends that posture to the llms.txt artifact.
 *
 * ### Why this exists
 *
 * As of 2026 Yoast SEO and Rank Math both ship native llms.txt
 * generation (and SEOPress / AIOSEO are adjacent). Structura's own
 * llms.txt fallback ({@see \Structura\Generator\Llms_Txt_Service})
 * must therefore DEFER when one of these is active: serving our own
 * /llms.txt over theirs would either duplicate or clobber the file
 * the site owner already gets. The fallback only fires on the
 * minority of sites running no SEO plugin at all.
 *
 * ### Conservative `owns_llms_txt`
 *
 * {@see seo_plugin_owns_llms_txt} returns true if *any* supported SEO
 * plugin is active, not only the two we've confirmed ship llms.txt.
 * That's deliberate: a false "defer" merely means we don't add a
 * fallback file on a site that already has a capable SEO plugin (it
 * can produce one); a false "serve" risks a duplicate/conflicting
 * /llms.txt. We bias to the harmless side.
 *
 * @since 1.x.0
 */
final class SEO_Plugin_Detector
{
    /**
     * Return the SEO plugins detected on the current site.
     *
     * @return array<string, array{label: string}>
     */
    public static function detect(): array
    {
        $detected = [];
        foreach (self::probe_table() as $slug => $probe) {
            if (self::matches($probe['probes'])) {
                $detected[$slug] = ['label' => $probe['label']];
            }
        }
        return $detected;
    }

    /**
     * The first detected SEO plugin's slug, or null when none is active.
     * Used by the settings surface to render "llms.txt is handled by
     * {RankMath}" instead of offering Structura's fallback toggle.
     */
    public static function active_seo_plugin(): ?string
    {
        $detected = self::detect();
        if ($detected === []) {
            return null;
        }
        return (string) array_key_first($detected);
    }

    /**
     * Human label for the first detected SEO plugin, or null.
     * Convenience for the deferral notice copy.
     */
    public static function active_seo_plugin_label(): ?string
    {
        foreach (self::detect() as $entry) {
            return $entry['label'];
        }
        return null;
    }

    /**
     * True when an active SEO plugin should own the site's llms.txt, so
     * Structura's fallback must stand down. Conservative — see the
     * class docblock: any supported SEO plugin present ⇒ defer.
     */
    public static function seo_plugin_owns_llms_txt(): bool
    {
        return self::detect() !== [];
    }

    /**
     * True when an active SEO plugin already emits the page-level
     * schema.org graph (Article/BlogPosting, Organization, BreadcrumbList,
     * author Person, dates), so Structura must NOT inject its own — two
     * BlogPosting nodes on a page is worse than one and can suppress the
     * rich result entirely.
     *
     * Same conservative posture as {@see seo_plugin_owns_llms_txt}: any
     * supported SEO plugin present ⇒ defer. Yoast, Rank Math, SEOPress
     * and AIOSEO all ship a complete article graph out of the box, so the
     * bias to defer is safe. Structura's content-derived FAQPage / HowTo
     * schema is emitted regardless — those are built from our own marked
     * blocks, which the SEO plugins don't parse, so there's no overlap.
     *
     * @since 1.x.0
     */
    public static function seo_plugin_owns_article_schema(): bool
    {
        return self::detect() !== [];
    }

    /**
     * Probe table — the single source of truth for SEO-plugin detection.
     *
     * Probes evaluate in order, first match wins. Mixing class /
     * function / constant keeps detection resilient across the plugins'
     * version bumps. Keep this list aligned with the focus-keyword meta
     * keys Structura reads in `Scheduler\Context_Builder`.
     *
     * @return array<string, array{
     *     label: string,
     *     probes: array<int, array{type: 'class'|'function'|'constant', name: string}>,
     * }>
     */
    private static function probe_table(): array
    {
        return [
            'yoast' => [
                'label'  => 'Yoast SEO',
                'probes' => [
                    ['type' => 'constant', 'name' => 'WPSEO_VERSION'],
                    ['type' => 'function', 'name' => 'wpseo_init'],
                    ['type' => 'class',    'name' => 'WPSEO_Options'],
                ],
            ],
            'rank-math' => [
                'label'  => 'Rank Math',
                'probes' => [
                    ['type' => 'constant', 'name' => 'RANK_MATH_VERSION'],
                    ['type' => 'class',    'name' => 'RankMath'],
                    ['type' => 'function', 'name' => 'rank_math'],
                ],
            ],
            'seopress' => [
                'label'  => 'SEOPress',
                'probes' => [
                    ['type' => 'constant', 'name' => 'SEOPRESS_VERSION'],
                    ['type' => 'function', 'name' => 'seopress_init'],
                ],
            ],
            'aioseo' => [
                'label'  => 'All in One SEO',
                'probes' => [
                    ['type' => 'constant', 'name' => 'AIOSEO_VERSION'],
                    ['type' => 'function', 'name' => 'aioseo'],
                ],
            ],
        ];
    }

    /**
     * Evaluate a probe list, returning true at the first match.
     *
     * @param array<int, array{type: 'class'|'function'|'constant', name: string}> $probes
     */
    private static function matches(array $probes): bool
    {
        foreach ($probes as $probe) {
            switch ($probe['type']) {
                case 'class':
                    if (class_exists($probe['name'])) {
                        return true;
                    }
                    break;
                case 'function':
                    if (function_exists($probe['name'])) {
                        return true;
                    }
                    break;
                case 'constant':
                    if (defined($probe['name'])) {
                        return true;
                    }
                    break;
            }
        }
        return false;
    }
}
