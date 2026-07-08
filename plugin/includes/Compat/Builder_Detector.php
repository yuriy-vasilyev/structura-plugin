<?php

namespace Structura\Compat;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Active page-builder detection.
 *
 * Companion to `Builder_Compat`. Where `Builder_Compat` writes
 * opt-out meta *passively* (always, on every post insert), this
 * class answers the *active* question: "is a known page builder
 * actually running on this site right now?" The answer drives the
 * admin notice (`Page_Builder_Notice`), the campaign-editor inline
 * card, and the locale-aware docs links surfaced by the REST
 * endpoint `/structura/v1/compat/page-builders`.
 *
 * ### Why detect at all
 *
 * `Builder_Compat::opt_out_meta()` runs on every post regardless of
 * whether any builder is installed — the writes are harmless no-ops
 * on unaffected sites. Detection is only needed for surfacing:
 * we don't show a "page builder detected" notice on a site running
 * Twenty Twenty-Four; we don't link to the Divi docs page from the
 * campaign editor if Divi isn't installed.
 *
 * ### Detection strategy
 *
 * Each builder is probed by a small battery of cheap checks in the
 * following priority order, stopping at the first match:
 *
 *   1. `class_exists()` on the builder's canonical top-level class.
 *   2. `function_exists()` on a known bootstrap function.
 *   3. `defined()` on the builder's version or bootstrap constant.
 *
 * No HTTP calls, no filesystem walks, no `get_option()` lookups —
 * detection has to be safe to run inside a `plugins_loaded` or
 * `admin_init` handler on every wp-admin request without adding a
 * measurable cost. Builders that are installed but deactivated are
 * deliberately *not* detected: WordPress doesn't autoload their
 * classes, so our probes return false, and the admin notice stays
 * quiet. That's the correct behaviour — a dormant builder can't
 * interfere with `the_content`.
 *
 * ### Priority for conflicting detections
 *
 * A site with both Divi and Elementor installed is rare but real
 * (migration sites, multi-site networks with varied themes). The
 * detector reports *all* builders it finds — ranking / "which one
 * is the active single-post renderer" is a question the admin
 * notice has to answer, not this class. We pick `atomic-meta` (the
 * builders `Builder_Compat` writes opt-outs for) vs `opt-in` as a
 * secondary classification so the notice surface can prioritise.
 *
 * @since 1.x.0
 */
final class Builder_Detector
{
    /**
     * Return the list of page builders detected on the current site.
     *
     * The return shape is a map of builder slug to builder metadata.
     * Consumers that only want a list of slugs should call
     * `array_keys(...)` on the return value; the map form is
     * preserved so a future caller needing the label or kind doesn't
     * have to re-run detection.
     *
     * @return array<string, array{
     *     label: string,
     *     kind: 'atomic-meta'|'opt-in',
     *     docs_slug: string,
     * }>
     */
    public static function detect(): array
    {
        $detected = [];
        foreach (self::probe_table() as $slug => $probe) {
            if (self::matches($probe['probes'])) {
                $detected[$slug] = [
                    'label'     => $probe['label'],
                    'kind'      => $probe['kind'],
                    'docs_slug' => $probe['docs_slug'],
                ];
            }
        }
        return $detected;
    }

    /**
     * True iff any supported builder is present.
     *
     * Convenience wrapper for admin-notice bootstrapping — avoids
     * having to build the full metadata map when the caller only
     * needs a yes/no signal (e.g. the activation hook that decides
     * whether to queue the notice at all).
     *
     * @return bool
     */
    public static function has_any(): bool
    {
        return self::detect() !== [];
    }

    /**
     * Probe table: the single source of truth for builder detection.
     *
     * Keep entries in the same order as `Builder_Compat`'s class-level
     * docblock so a reader auditing "which builders does the plugin
     * know about" sees both files tell the same story. `kind` is:
     *
     * - `atomic-meta` — `Builder_Compat::opt_out_meta()` writes a
     *   flag for this builder. Divi + WPBakery today.
     * - `opt-in` — the builder only claims a post when an editor
     *   explicitly opts it in. Elementor / Beaver / Brizy / Bricks.
     *
     * `docs_slug` is the filename under
     * `docs/content/troubleshooting/page-builders/` — used by the
     * REST endpoint to build locale-aware docs URLs without the SPA
     * having to hard-code the mapping.
     *
     * The `probes` array is evaluated in order; first match wins.
     * Mixing probe kinds (class + function + constant) means we keep
     * working when a builder changes its bootstrap file between
     * versions — a version-bump that drops the function but keeps
     * the constant (or vice versa) doesn't break detection.
     *
     * @return array<string, array{
     *     label: string,
     *     kind: 'atomic-meta'|'opt-in',
     *     docs_slug: string,
     *     probes: array<int, array{type: 'class'|'function'|'constant', name: string}>,
     * }>
     */
    private static function probe_table(): array
    {
        return [
            'divi' => [
                'label'     => 'Divi',
                'kind'      => 'atomic-meta',
                'docs_slug' => 'divi',
                'probes'    => [
                    ['type' => 'function', 'name' => 'et_setup_theme'],
                    ['type' => 'constant', 'name' => 'ET_BUILDER_PLUGIN_ACTIVE'],
                    ['type' => 'function', 'name' => 'et_divi_builder_init_plugin'],
                ],
            ],
            'elementor' => [
                'label'     => 'Elementor',
                'kind'      => 'opt-in',
                'docs_slug' => 'elementor',
                'probes'    => [
                    ['type' => 'class',    'name' => '\\Elementor\\Plugin'],
                    ['type' => 'constant', 'name' => 'ELEMENTOR_VERSION'],
                ],
            ],
            'beaver-builder' => [
                'label'     => 'Beaver Builder',
                'kind'      => 'opt-in',
                'docs_slug' => 'beaver-builder',
                'probes'    => [
                    ['type' => 'class',    'name' => 'FLBuilder'],
                    ['type' => 'constant', 'name' => 'FL_BUILDER_VERSION'],
                ],
            ],
            'brizy' => [
                'label'     => 'Brizy',
                'kind'      => 'opt-in',
                'docs_slug' => 'brizy',
                'probes'    => [
                    ['type' => 'class',    'name' => 'Brizy_Editor'],
                    ['type' => 'constant', 'name' => 'BRIZY_VERSION'],
                ],
            ],
            'wpbakery' => [
                'label'     => 'WPBakery Page Builder',
                'kind'      => 'atomic-meta',
                'docs_slug' => 'wpbakery',
                'probes'    => [
                    ['type' => 'class',    'name' => 'WPBMap'],
                    ['type' => 'function', 'name' => 'vc_map'],
                    ['type' => 'constant', 'name' => 'WPB_VC_VERSION'],
                ],
            ],
            'bricks' => [
                'label'     => 'Bricks',
                'kind'      => 'opt-in',
                'docs_slug' => 'bricks',
                'probes'    => [
                    ['type' => 'class',    'name' => '\\Bricks\\Plugin'],
                    ['type' => 'constant', 'name' => 'BRICKS_VERSION'],
                ],
            ],
        ];
    }

    /**
     * Evaluate a list of probes, returning true at the first match.
     *
     * Ordering inside the probes list is authoritative — the caller
     * decides priority (class before function before constant). We
     * stop at the first match because detection is binary and
     * evaluating a defined() after we've already matched on a
     * class_exists() burns cycles for no signal.
     *
     * @param array<int, array{type: 'class'|'function'|'constant', name: string}> $probes
     * @return bool
     */
    private static function matches(array $probes): bool
    {
        foreach ($probes as $probe) {
            switch ($probe['type']) {
                case 'class':
                    // Autoload-enabled: builders register their
                    // autoloader at `plugins_loaded`, so by the time
                    // detection runs the class is resolvable even if
                    // PHP hasn't touched it yet. The autoload cost is
                    // one file load per admin request and is
                    // subsequently cached in
                    // `structura_detected_page_builders` per spec §3.2.
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
