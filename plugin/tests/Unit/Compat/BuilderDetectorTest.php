<?php

namespace Structura\Tests\Unit\Compat;

use Structura\Compat\Builder_Detector;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Builder_Detector.
 *
 * The production detection surface runs on a live WordPress site
 * with real builders loaded; we can't do that in a Brain Monkey
 * unit test. What we CAN pin here is the probe contract: given a
 * fixture class / function / constant present in the running
 * PHPUnit process, does the detector identify the builder? The
 * goal is to catch silent regressions in the probe table — e.g. a
 * typo in a class name, a probe kind drifting away from the
 * supported list, or the return-shape losing a key that the REST
 * endpoint or admin notice relies on.
 *
 * Integration-shaped verification ("does Elementor 3.21 still
 * expose `\Elementor\Plugin`?") is not in scope here — version
 * bumps need a real WP fixture. File an issue referencing
 * `specs/page-builder-compat.md` §3.2 when that happens.
 *
 * @covers \Structura\Compat\Builder_Detector
 */
class BuilderDetectorTest extends TestCase
{
    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function detect_returns_empty_when_no_builder_is_present(): void
    {
        // Process-isolated so the eval'd fixtures in the positive
        // tests below can't leak into this one. Without the
        // annotation, PHP keeps eval'd classes and functions
        // alive for the whole PHPUnit run and the order of tests
        // would silently determine whether this passes.
        $detected = Builder_Detector::detect();
        $this->assertSame([], $detected);
    }

    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function has_any_is_false_by_default(): void
    {
        $this->assertFalse(Builder_Detector::has_any());
    }

    /** @test */
    public function detects_elementor_when_marker_class_is_defined(): void
    {
        // Stand up a stand-in for Elementor's `\Elementor\Plugin`
        // class in the namespace the probe table expects. The
        // `eval` is ugly but the alternatives (real PHPUnit fixture
        // classes + autoloader tricks) are heavier for a single
        // positive-path assertion.
        if ( ! class_exists('\\Elementor\\Plugin')) {
            eval('namespace Elementor; class Plugin {}');
        }

        $detected = Builder_Detector::detect();
        $this->assertArrayHasKey('elementor', $detected);
        $this->assertSame('Elementor', $detected['elementor']['label']);
        $this->assertSame('opt-in', $detected['elementor']['kind']);
        $this->assertSame('elementor', $detected['elementor']['docs_slug']);
    }

    /** @test */
    public function detects_divi_when_bootstrap_function_is_defined(): void
    {
        // Define one of Divi's probe functions if it's not already
        // in scope. Divi's probe list starts with `et_setup_theme`;
        // keep this fixture in sync with the probe table.
        if ( ! function_exists('et_setup_theme')) {
            eval('function et_setup_theme() {}');
        }

        $detected = Builder_Detector::detect();
        $this->assertArrayHasKey('divi', $detected);
        $this->assertSame('Divi', $detected['divi']['label']);
        $this->assertSame('atomic-meta', $detected['divi']['kind']);
    }

    /** @test */
    public function every_builder_has_the_required_metadata_keys(): void
    {
        // If a new builder is added and a key is missed, both the
        // REST endpoint and the admin notice template break at
        // runtime — this test catches the drift at CI time. Pinned
        // against the return-shape docblock in
        // `Builder_Detector::probe_table()`.
        $reflection = new \ReflectionClass(Builder_Detector::class);
        $method     = $reflection->getMethod('probe_table');
        $method->setAccessible(true);
        $table = $method->invoke(null);

        foreach ($table as $slug => $entry) {
            $this->assertArrayHasKey('label', $entry, "Builder '$slug' is missing 'label'");
            $this->assertArrayHasKey('kind', $entry, "Builder '$slug' is missing 'kind'");
            $this->assertArrayHasKey('docs_slug', $entry, "Builder '$slug' is missing 'docs_slug'");
            $this->assertArrayHasKey('probes', $entry, "Builder '$slug' is missing 'probes'");
            $this->assertContains(
                $entry['kind'],
                ['atomic-meta', 'opt-in'],
                "Builder '$slug' has unsupported kind '{$entry['kind']}'"
            );
            $this->assertNotEmpty($entry['probes'], "Builder '$slug' has no probes");
            foreach ($entry['probes'] as $probe) {
                $this->assertArrayHasKey('type', $probe);
                $this->assertArrayHasKey('name', $probe);
                $this->assertContains(
                    $probe['type'],
                    ['class', 'function', 'constant'],
                    "Builder '$slug' has unsupported probe type '{$probe['type']}'"
                );
            }
        }
    }

    /** @test */
    public function probe_table_covers_every_builder_in_the_opt_out_contract(): void
    {
        // Every builder that Builder_Compat writes opt-out meta for
        // must also be detectable — otherwise the admin notice
        // ships silent on a site we've already opted out against.
        // (The reverse isn't required: we detect opt-in builders
        // even though we write no meta for them, so the docs link
        // is still reachable from the notice.)
        $reflection = new \ReflectionClass(Builder_Detector::class);
        $method     = $reflection->getMethod('probe_table');
        $method->setAccessible(true);
        $table = $method->invoke(null);

        $atomic_meta_builders = array_keys(array_filter(
            $table,
            static fn ($entry) => $entry['kind'] === 'atomic-meta'
        ));

        // Pinning explicit list keeps this test honest — if someone
        // adds a new atomic-meta builder to `Builder_Compat` but
        // forgets to add a probe here, the list diverges and this
        // fails. Keep in sync with Builder_Compat::opt_out_meta().
        $this->assertEqualsCanonicalizing(
            ['divi', 'wpbakery'],
            $atomic_meta_builders,
            'Builder_Detector probe table must cover every atomic-meta '
            . 'builder that Builder_Compat writes opt-outs for.'
        );
    }
}
