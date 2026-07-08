<?php

namespace Structura\Tests\Unit\Api;

use Structura\Api\Resource_Fetcher;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Api\Resource_Fetcher
 *
 * Unit tests for the pure, static half of Resource_Fetcher: color extraction,
 * hex normalization, and content classification. These don't touch
 * wp_remote_get, so they run without a Brain Monkey HTTP stub.
 *
 * Regression: prior to 1.15.0, fetch_url_content() routed every resource
 * through wp_strip_all_tags, which silently flattened logo SVGs to an empty
 * string. Downstream, Gemini's visual-mode prompt got no brand-color cue
 * and invented a generic niche palette. These tests pin the SVG branch.
 */
class ResourceFetcherTest extends TestCase
{
    // ─────────────────────────────────────────────────────────────────────
    //  normalize_hex
    // ─────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_expands_shorthand_3_digit_hex_to_uppercase_6_digit(): void
    {
        $this->assertSame('#AABBCC', Resource_Fetcher::normalize_hex('#abc'));
        $this->assertSame('#FF0000', Resource_Fetcher::normalize_hex('#f00'));
    }

    /** @test */
    public function it_uppercases_6_digit_hex(): void
    {
        $this->assertSame('#E01A4F', Resource_Fetcher::normalize_hex('#e01a4f'));
    }

    /** @test */
    public function it_strips_alpha_channel_from_4_and_8_digit_hex(): void
    {
        // 4-digit RGBA → drop alpha, expand to 6-digit RGB
        $this->assertSame('#AABBCC', Resource_Fetcher::normalize_hex('#abcd'));
        // 8-digit RRGGBBAA → drop alpha
        $this->assertSame('#E01A4F', Resource_Fetcher::normalize_hex('#E01A4F80'));
    }

    /** @test */
    public function it_rejects_invalid_hex_lengths(): void
    {
        $this->assertNull(Resource_Fetcher::normalize_hex('#ab'));      // 2
        $this->assertNull(Resource_Fetcher::normalize_hex('#abcde'));   // 5
        $this->assertNull(Resource_Fetcher::normalize_hex('#abcdefg')); // 7
    }

    /** @test */
    public function it_rejects_non_hex_characters(): void
    {
        $this->assertNull(Resource_Fetcher::normalize_hex('#ZZZ'));
        $this->assertNull(Resource_Fetcher::normalize_hex('#1234ZZ'));
    }

    // ─────────────────────────────────────────────────────────────────────
    //  extract_svg_colors
    // ─────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_pulls_hex_colors_from_fill_and_stroke_attributes(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg">
            <path fill="#e31837" d="M0 0"/>
            <circle stroke="#ff8a00" r="5"/>
        </svg>';

        $colors = Resource_Fetcher::extract_svg_colors($svg);

        $this->assertSame(['#E31837', '#FF8A00'], $colors);
    }

    /** @test */
    public function it_pulls_hex_colors_from_inline_style_attributes(): void
    {
        $svg = '<svg><path style="fill:#E01A4F;stroke: #F39323"/></svg>';

        $colors = Resource_Fetcher::extract_svg_colors($svg);

        $this->assertSame(['#E01A4F', '#F39323'], $colors);
    }

    /** @test */
    public function it_pulls_hex_colors_from_style_block_rules(): void
    {
        $svg = '<svg>
            <style>
                .cls-1 { fill: #E01A4F; }
                .cls-2 { stroke: #FFFFFF; }
            </style>
            <path class="cls-1"/>
        </svg>';

        $colors = Resource_Fetcher::extract_svg_colors($svg);

        $this->assertContains('#E01A4F', $colors);
        $this->assertContains('#FFFFFF', $colors);
    }

    /** @test */
    public function it_deduplicates_while_preserving_first_occurrence_order(): void
    {
        // First occurrence of #e31837 is before #ff8a00 — the primary red is
        // the one the designer painted the big shapes with, and brand prompts
        // want that first. Repeated fills of the same color must NOT promote
        // a secondary into the primary slot.
        $svg = '<svg>
            <path fill="#e31837"/>
            <path fill="#ff8a00"/>
            <path fill="#e31837"/>
        </svg>';

        $this->assertSame(['#E31837', '#FF8A00'], Resource_Fetcher::extract_svg_colors($svg));
    }

    /** @test */
    public function it_ignores_non_color_keywords(): void
    {
        // `none`, `transparent`, `currentColor` are common SVG paint values
        // that we deliberately skip — they're not brand signals.
        $svg = '<svg>
            <path fill="none"/>
            <path stroke="transparent"/>
            <path fill="currentColor"/>
            <path fill="#abc"/>
        </svg>';

        $this->assertSame(['#AABBCC'], Resource_Fetcher::extract_svg_colors($svg));
    }

    /** @test */
    public function it_returns_an_empty_array_when_no_hex_colors_are_present(): void
    {
        $svg = '<svg><path d="M0 0"/></svg>';

        $this->assertSame([], Resource_Fetcher::extract_svg_colors($svg));
    }

    // ─────────────────────────────────────────────────────────────────────
    //  classify
    // ─────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_classifies_rasters_via_content_type(): void
    {
        $this->assertSame('raster', Resource_Fetcher::classify('https://e.com/x', 'image/png', ''));
        $this->assertSame('raster', Resource_Fetcher::classify('https://e.com/x', 'image/jpeg; charset=utf-8', ''));
        $this->assertSame('raster', Resource_Fetcher::classify('https://e.com/x', 'image/webp', ''));
        $this->assertSame('raster', Resource_Fetcher::classify('https://e.com/x', 'image/gif', ''));
    }

    /** @test */
    public function it_classifies_svg_via_content_type_with_charset_suffix(): void
    {
        // Common real-world case: nginx emits `image/svg+xml; charset=utf-8`.
        $this->assertSame(
            'svg',
            Resource_Fetcher::classify('https://e.com/logo.svg', 'image/svg+xml; charset=utf-8', '')
        );
    }

    /** @test */
    public function it_falls_back_to_extension_when_content_type_is_generic(): void
    {
        // Misconfigured host sends text/plain for an SVG — we should still
        // detect the SVG branch via the URL extension.
        $this->assertSame(
            'svg',
            Resource_Fetcher::classify('https://e.com/logo.svg', 'text/plain', '')
        );

        // Same for a PNG served as application/octet-stream.
        $this->assertSame(
            'raster',
            Resource_Fetcher::classify('https://e.com/logo.png', 'application/octet-stream', '')
        );
    }

    /** @test */
    public function it_sniffs_svg_body_when_content_type_and_extension_both_lie(): void
    {
        // The real-world WordPress host that motivated this branch: returns
        // `text/html` and the URL has no extension, but the body is SVG.
        $body = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path/></svg>';
        $this->assertSame(
            'svg',
            Resource_Fetcher::classify('https://e.com/logo', 'text/html', $body)
        );
    }

    /** @test */
    public function it_returns_text_for_plain_html_pages(): void
    {
        $this->assertSame(
            'text',
            Resource_Fetcher::classify('https://e.com/about', 'text/html', '<html><body>hi</body></html>')
        );
    }
}
