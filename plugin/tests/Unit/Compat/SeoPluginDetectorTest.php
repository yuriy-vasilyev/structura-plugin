<?php

namespace Structura\Tests\Unit\Compat;

use Structura\Compat\SEO_Plugin_Detector;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for SEO_Plugin_Detector.
 *
 * Same constraint as BuilderDetectorTest: we can't load real Yoast /
 * Rank Math in a Brain Monkey process, so we pin the probe contract by
 * defining stand-in markers and asserting detection + the defer signal.
 * Marker-defining tests run process-isolated because constants can't be
 * undefined once set and would otherwise leak across tests.
 *
 * @covers \Structura\Compat\SEO_Plugin_Detector
 */
class SeoPluginDetectorTest extends TestCase
{
    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function detect_is_empty_when_no_seo_plugin_is_present(): void
    {
        $this->assertSame([], SEO_Plugin_Detector::detect());
    }

    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function does_not_defer_when_no_seo_plugin_is_present(): void
    {
        $this->assertFalse(SEO_Plugin_Detector::seo_plugin_owns_llms_txt());
        $this->assertNull(SEO_Plugin_Detector::active_seo_plugin());
    }

    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function detects_yoast_via_version_constant(): void
    {
        if ( ! defined('WPSEO_VERSION')) {
            define('WPSEO_VERSION', '99.9-test');
        }

        $detected = SEO_Plugin_Detector::detect();
        $this->assertArrayHasKey('yoast', $detected);
        $this->assertSame('Yoast SEO', $detected['yoast']['label']);
        $this->assertTrue(SEO_Plugin_Detector::seo_plugin_owns_llms_txt());
        $this->assertSame('yoast', SEO_Plugin_Detector::active_seo_plugin());
        $this->assertSame('Yoast SEO', SEO_Plugin_Detector::active_seo_plugin_label());
    }

    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function detects_rank_math_via_marker_class(): void
    {
        if ( ! class_exists('RankMath')) {
            eval('class RankMath {}');
        }

        $detected = SEO_Plugin_Detector::detect();
        $this->assertArrayHasKey('rank-math', $detected);
        $this->assertSame('Rank Math', $detected['rank-math']['label']);
        $this->assertTrue(SEO_Plugin_Detector::seo_plugin_owns_llms_txt());
    }

    /** @test */
    public function every_entry_has_label_and_probes(): void
    {
        $reflection = new \ReflectionClass(SEO_Plugin_Detector::class);
        $method     = $reflection->getMethod('probe_table');
        $method->setAccessible(true);
        $table = $method->invoke(null);

        $this->assertNotEmpty($table);
        foreach ($table as $slug => $entry) {
            $this->assertArrayHasKey('label', $entry, "SEO plugin '$slug' is missing 'label'");
            $this->assertArrayHasKey('probes', $entry, "SEO plugin '$slug' is missing 'probes'");
            $this->assertNotEmpty($entry['probes'], "SEO plugin '$slug' has no probes");
            foreach ($entry['probes'] as $probe) {
                $this->assertContains(
                    $probe['type'],
                    ['class', 'function', 'constant'],
                    "SEO plugin '$slug' has unsupported probe type '{$probe['type']}'"
                );
            }
        }
    }
}
