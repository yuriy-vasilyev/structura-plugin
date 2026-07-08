<?php

namespace Structura\Tests\Unit\Generator;

use Brain\Monkey\Functions;
use Structura\Generator\Llms_Txt_Service;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Llms_Txt_Service.
 *
 * We pin the three pure-ish surfaces — path matching, the serve gate,
 * and the markdown format — without driving the `exit`-ing `init` hook
 * (which can't run inside PHPUnit) and without a real WP fixture for
 * the post query (that glue is intentionally thin).
 *
 * @covers \Structura\Generator\Llms_Txt_Service
 */
class LlmsTxtServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // wp_parse_url isn't stubbed by the base TestCase; alias it to
        // PHP's parse_url (identical signature) for matches_path().
        Functions\when('wp_parse_url')->alias('parse_url');
    }

    /** @test */
    public function matches_only_the_llms_txt_path(): void
    {
        $this->assertTrue(Llms_Txt_Service::matches_path('/llms.txt'));
        $this->assertTrue(Llms_Txt_Service::matches_path('/llms.txt/'));
        $this->assertTrue(Llms_Txt_Service::matches_path('/llms.txt?foo=bar'));

        $this->assertFalse(Llms_Txt_Service::matches_path(''));
        $this->assertFalse(Llms_Txt_Service::matches_path('/'));
        $this->assertFalse(Llms_Txt_Service::matches_path('/robots.txt'));
        $this->assertFalse(Llms_Txt_Service::matches_path('/llms.txt/extra'));
        $this->assertFalse(Llms_Txt_Service::matches_path('/blog/llms.txt'));
    }

    /** @test */
    public function should_serve_when_enabled_and_no_seo_plugin_present(): void
    {
        // Base TestCase apply_filters stub returns the value (true);
        // no SEO plugin classes/constants defined in this process.
        $this->assertTrue(Llms_Txt_Service::should_serve());
    }

    /** @test */
    public function does_not_serve_when_disabled_by_filter(): void
    {
        Functions\when('apply_filters')->justReturn(false);
        $this->assertFalse(Llms_Txt_Service::should_serve());
    }

    /**
     * @test
     * @runInSeparateProcess
     * @preserveGlobalState disabled
     */
    public function does_not_serve_when_an_seo_plugin_owns_llms_txt(): void
    {
        // Isolated process so the marker doesn't leak. Yoast present →
        // defer regardless of the enabled filter.
        if ( ! defined('WPSEO_VERSION')) {
            define('WPSEO_VERSION', '99.9-test');
        }
        $this->assertFalse(Llms_Txt_Service::should_serve());
    }

    /** @test */
    public function build_markdown_renders_title_tagline_and_entries(): void
    {
        $out = Llms_Txt_Service::build_markdown(
            'Demo Site',
            'WordPress for AI builders',
            [
                ['title' => 'First post', 'url' => 'https://demo.test/first', 'description' => 'About the first thing.'],
                ['title' => 'Second post', 'url' => 'https://demo.test/second', 'description' => ''],
            ],
        );

        $this->assertStringContainsString('# Demo Site', $out);
        $this->assertStringContainsString('> WordPress for AI builders', $out);
        $this->assertStringContainsString('## Content', $out);
        $this->assertStringContainsString('- [First post](https://demo.test/first): About the first thing.', $out);
        // No description → no trailing colon.
        $this->assertStringContainsString('- [Second post](https://demo.test/second)', $out);
        $this->assertStringNotContainsString('second): ', $out);
    }

    /** @test */
    public function build_markdown_skips_entries_missing_title_or_url(): void
    {
        $out = Llms_Txt_Service::build_markdown('Demo', '', [
            ['title' => '', 'url' => 'https://demo.test/x', 'description' => 'no title'],
            ['title' => 'No URL', 'url' => '', 'description' => 'no url'],
            ['title' => 'Good', 'url' => 'https://demo.test/good', 'description' => ''],
        ]);

        $this->assertStringNotContainsString('no title', $out);
        $this->assertStringNotContainsString('No URL', $out);
        $this->assertStringContainsString('- [Good](https://demo.test/good)', $out);
    }

    /** @test */
    public function build_markdown_omits_tagline_line_when_empty(): void
    {
        $out = Llms_Txt_Service::build_markdown('Demo', '', []);
        $this->assertStringContainsString('# Demo', $out);
        $this->assertStringNotContainsString('>', $out);
    }
}
