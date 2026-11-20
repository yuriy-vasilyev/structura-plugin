<?php

namespace Structura\Tests\Unit\Generator;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Generator\Block_Serializer;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Generator\Block_Serializer
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class BlockSerializerTest extends TestCase
{
    private Block_Serializer $serializer;

    /**
     * Mutable Pro-flag the alias mock reads at call time. Tests flip
     * it via `$this->isPro = false;` before exercising the Free-tier
     * strip path. Mockery alias mocks are process-scoped — once
     * created they can't be redefined — so we route through a per-
     * instance flag instead of trying to re-mock the alias per test.
     */
    private bool $isPro = true;

    protected function setUp(): void
    {
        parent::setUp();

        // serialize_post's tail now reads home_url() + License_Manager
        // for the Free-tier external-link strip. Stub both with sensible
        // defaults so the existing tests (which don't care about the
        // strip) keep passing without each one re-wiring the auth gate.
        Functions\stubs([
            'home_url'     => function () { return 'https://example.com'; },
            'wp_parse_url' => function ($url, $component = -1) {
                $parsed = parse_url($url);
                if ($component === -1 || $component === null) {
                    return $parsed;
                }
                $map = [
                    PHP_URL_SCHEME => 'scheme', PHP_URL_HOST => 'host',
                    PHP_URL_PORT   => 'port',   PHP_URL_USER => 'user',
                    PHP_URL_PASS   => 'pass',   PHP_URL_PATH => 'path',
                    PHP_URL_QUERY  => 'query',  PHP_URL_FRAGMENT => 'fragment',
                ];
                return $parsed[$map[$component] ?? ''] ?? null;
            },
            'wp_kses'      => function ($content) { return $content; },
        ]);

        // Default state: Pro license. Tests that exercise the strip
        // flip `$this->isPro = false;` before calling `serialize_post`.
        $this->isPro = true;
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('is_pro')
            ->andReturnUsing(function () { return $this->isPro; });

        $this->serializer = new Block_Serializer();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  INLINE MARKDOWN SANITIZATION
    //  These tests exercise sanitize_inline_markdown() indirectly through
    //  render_paragraph(), since the method is private.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_converts_backticks_to_code_tags(): void
    {
        $html = $this->render_paragraph('Use the `wp_query` function.');

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringContainsString('wp_query', $html);
        $this->assertStringContainsString('</code>', $html);
    }

    /** @test */
    public function it_converts_bold_markdown_to_strong(): void
    {
        $html = $this->render_paragraph('This is **important** text.');

        $this->assertStringContainsString('<strong>important</strong>', $html);
        $this->assertStringNotContainsString('**', $html);
    }

    /** @test */
    public function it_converts_italic_markdown_to_em(): void
    {
        $html = $this->render_paragraph('This is *emphasized* text.');

        $this->assertStringContainsString('<em>emphasized</em>', $html);
    }

    /** @test */
    public function it_converts_markdown_links_to_anchor_tags(): void
    {
        $html = $this->render_paragraph('Visit [our site](https://example.com) today.');

        $this->assertStringContainsString('<a href="https://example.com">our site</a>', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  AUTOLINK NAKED URLS (safety net for prompt drift)
    //
    //  The primary fix for this class of bug lives in the AI system prompt
    //  (functions/src/ai/instruction-builder.ts), which instructs providers
    //  to wrap every URL in an <a> tag. These tests pin the belt-and-braces
    //  fallback in sanitize_inline_markdown: if a naked URL still reaches
    //  the serializer — because a provider ignored the rule, or because a
    //  future prompt refactor drops the anchor-tag guidance — we must still
    //  render a clickable link instead of plain text.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_autolinks_naked_https_urls_in_paragraphs(): void
    {
        $html = $this->render_paragraph(
            'Check https://developers.google.com/maps/third-party-platforms/wordpress for details.'
        );

        $this->assertStringContainsString(
            '<a href="https://developers.google.com/maps/third-party-platforms/wordpress">'
            . 'https://developers.google.com/maps/third-party-platforms/wordpress</a>',
            $html,
            'Naked external URLs must be wrapped in an anchor tag'
        );
    }

    /** @test */
    public function it_autolinks_naked_http_urls(): void
    {
        $html = $this->render_paragraph('Legacy link: http://example.com still works.');

        $this->assertStringContainsString('<a href="http://example.com">http://example.com</a>', $html);
    }

    /** @test */
    public function it_does_not_double_wrap_urls_already_inside_anchor_tags(): void
    {
        // Simulate the AI correctly emitting an <a> tag — we must NOT
        // autolink the href value and nest anchors.
        $html = $this->render_paragraph(
            'See <a href="https://example.com">our guide</a> for details.'
        );

        // Exactly one anchor: the one the AI produced.
        $this->assertEquals(1, substr_count($html, '<a '), 'Existing <a> tags must not be double-wrapped');
        $this->assertStringContainsString('<a href="https://example.com">our guide</a>', $html);
    }

    /** @test */
    public function it_does_not_double_wrap_markdown_link_output(): void
    {
        // Markdown link → <a> conversion runs BEFORE the autolinker.
        // The autolinker must treat the resulting <a> as already-linked.
        $html = $this->render_paragraph('Visit [our site](https://example.com) today.');

        $this->assertEquals(1, substr_count($html, '<a '));
        $this->assertStringContainsString('<a href="https://example.com">our site</a>', $html);
    }

    /** @test */
    public function it_does_not_autolink_urls_inside_code_spans(): void
    {
        $html = $this->render_paragraph('Configure the `https://example.com` endpoint.');

        $this->assertStringContainsString('<code>', $html);
        // No <a> tag anywhere — the URL is inside <code> and must stay plain text.
        $this->assertStringNotContainsString('<a ', $html, 'URLs inside code spans must not be autolinked');
        $this->assertStringContainsString('https://example.com', $html);
    }

    /** @test */
    public function it_strips_trailing_sentence_punctuation_from_autolinked_urls(): void
    {
        $html = $this->render_paragraph('Read more at https://example.com/article. Thanks!');

        // The trailing period must not be inside the href or the anchor text.
        $this->assertStringContainsString(
            '<a href="https://example.com/article">https://example.com/article</a>',
            $html
        );
        // The period must still appear in the output, just outside the anchor.
        $this->assertMatchesRegularExpression('/<\/a>\.\s/', $html);
    }

    /** @test */
    public function it_strips_trailing_comma_from_autolinked_urls(): void
    {
        $html = $this->render_paragraph('See https://example.com, then continue.');

        $this->assertStringContainsString('<a href="https://example.com">https://example.com</a>', $html);
        $this->assertMatchesRegularExpression('/<\/a>,\s/', $html);
    }

    /** @test */
    public function it_preserves_balanced_parens_and_brackets_in_url_paths(): void
    {
        // Wikipedia-style URLs commonly include (parens) in the path.
        // We must not peel them off.
        $html = $this->render_paragraph(
            'Background at https://en.wikipedia.org/wiki/Foo_(bar) is relevant.'
        );

        $this->assertStringContainsString(
            '<a href="https://en.wikipedia.org/wiki/Foo_(bar)">'
            . 'https://en.wikipedia.org/wiki/Foo_(bar)</a>',
            $html
        );
    }

    /** @test */
    public function it_autolinks_multiple_naked_urls_in_one_paragraph(): void
    {
        $html = $this->render_paragraph(
            'Compare https://example.com and https://example.org for context.'
        );

        $this->assertEquals(2, substr_count($html, '<a href='));
        $this->assertStringContainsString('<a href="https://example.com">https://example.com</a>', $html);
        $this->assertStringContainsString('<a href="https://example.org">https://example.org</a>', $html);
    }

    /** @test */
    public function it_autolinks_naked_urls_in_list_items(): void
    {
        $html = $this->render_block('core/list', [
            'content'  => '',
            'children' => [
                'Reference: https://example.com/docs',
                'Source: https://other.example.org',
            ],
            'attrs'    => ['ordered' => false],
        ]);

        $this->assertStringContainsString('<a href="https://example.com/docs">', $html);
        $this->assertStringContainsString('<a href="https://other.example.org">', $html);
    }

    /** @test */
    public function it_autolinks_naked_urls_in_table_cells(): void
    {
        $html = $this->render_block('core/table', [
            'content'       => '',
            'table_content' => [
                'headers' => ['Source'],
                'rows'    => [['Data from https://example.com today.']],
            ],
        ]);

        $this->assertStringContainsString('<a href="https://example.com">https://example.com</a>', $html);
    }

    /** @test */
    public function headings_strip_autolinked_anchors_but_preserve_url_text(): void
    {
        // Headings explicitly strip <a> tags (anchor-wrapped headings break
        // Gutenberg validation). The URL text should still appear so the
        // heading remains readable.
        $html = $this->render_block('core/heading', [
            'content' => 'Read https://example.com for more',
            'attrs'   => ['level' => 2],
        ]);

        $this->assertStringContainsString('<h2', $html);
        $this->assertStringNotContainsString('<a ', $html);
        $this->assertStringContainsString('https://example.com', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  THE BUG REGRESSION: <a> inside <code>
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_does_not_render_links_inside_code_spans(): void
    {
        $html = $this->render_paragraph('Use `[click here](https://example.com)` in your template.');

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringNotContainsString('<a ', $html, 'Links must not appear inside <code> tags');
        // The markdown link text should be preserved as plain text
        $this->assertStringContainsString('[click here](https://example.com)', $html);
    }

    /** @test */
    public function it_does_not_render_bold_inside_code_spans(): void
    {
        $html = $this->render_paragraph('The `**important**` keyword is reserved.');

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringNotContainsString('<strong>', $html, 'Bold must not appear inside <code> tags');
        $this->assertStringContainsString('**important**', $html);
    }

    /** @test */
    public function it_does_not_render_italic_inside_code_spans(): void
    {
        $html = $this->render_paragraph('The `*args` parameter is variadic.');

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringNotContainsString('<em>', $html, 'Italic must not appear inside <code> tags');
    }

    /** @test */
    public function it_strips_preformed_html_inside_code_via_safety_net(): void
    {
        // Simulate AI sending pre-formed HTML with bad nesting
        $html = $this->render_paragraph('Run <code><a href="https://evil.com">this</a></code> now.');

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringContainsString('this', $html);
        // The <a> inside <code> must be stripped by clean_inline_html
        $this->assertDoesNotMatchRegularExpression('/<code>.*<a\s/s', $html);
    }

    /** @test */
    public function it_handles_multiple_code_spans_in_one_line(): void
    {
        $html = $this->render_paragraph('Use `foo()` and `bar()` functions.');

        $this->assertEquals(2, substr_count($html, '<code>'));
        $this->assertStringContainsString('foo()', $html);
        $this->assertStringContainsString('bar()', $html);
    }

    /** @test */
    public function it_handles_code_span_alongside_markdown_link(): void
    {
        $html = $this->render_paragraph('Use `wp_query` from [WordPress](https://wordpress.org).');

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringContainsString('<a href="https://wordpress.org">WordPress</a>', $html);
    }

    /** @test */
    public function it_handles_link_with_backtick_in_anchor_text(): void
    {
        // Edge case: link text contains a backtick-like word but is not inside code
        $html = $this->render_paragraph('Read about [the `query` method](https://example.com).');

        // The link should exist and the code inside it is acceptable
        $this->assertStringContainsString('<a href="https://example.com">', $html);
    }

    /** @test */
    public function it_passes_through_plain_text_unchanged(): void
    {
        $html = $this->render_paragraph('Just a normal sentence with no markdown.');

        $this->assertStringContainsString('Just a normal sentence with no markdown.', $html);
        $this->assertStringNotContainsString('<code>', $html);
        $this->assertStringNotContainsString('<strong>', $html);
        $this->assertStringNotContainsString('<em>', $html);
        $this->assertStringNotContainsString('<a ', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ACTION STEPS (2026-10-02: `name: text`, never an em-dash join)
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function action_steps_join_name_and_text_with_a_colon_outside_the_strong(): void
    {
        $html = $this->render_action_steps([
            ['name' => 'Measure your light', 'text' => 'Track sun hours for a week.'],
        ]);

        $this->assertStringContainsString('<li><strong>Measure your light</strong>: Track sun hours for a week.</li>', $html);
        $this->assertStringNotContainsString('—', $html);
    }

    /** @test */
    public function action_steps_whose_name_ends_in_punctuation_take_a_space_and_no_colon(): void
    {
        $html = $this->render_action_steps([
            ['name' => 'Why drainage?', 'text' => 'Roots rot in standing water.'],
            ['name' => 'Water daily!', 'text' => 'Containers dry out fast.'],
            ['name' => 'Step one:', 'text' => 'Pick a pot.'],
            ['name' => 'Done.', 'text' => 'Harvest.'],
        ]);

        $this->assertStringContainsString('<strong>Why drainage?</strong> Roots rot in standing water.', $html);
        $this->assertStringContainsString('<strong>Water daily!</strong> Containers dry out fast.', $html);
        $this->assertStringContainsString('<strong>Step one:</strong> Pick a pot.', $html);
        $this->assertStringContainsString('<strong>Done.</strong> Harvest.', $html);
        $this->assertStringNotContainsString('</strong>:', $html);
        $this->assertStringNotContainsString('—', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  HEADING RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function headings_strip_anchor_tags(): void
    {
        $html = $this->render_block('core/heading', [
            'content' => 'Check [this guide](https://example.com) for details',
            'attrs'   => ['level' => 2],
        ]);

        $this->assertStringContainsString('<h2', $html);
        $this->assertStringNotContainsString('<a ', $html, 'Anchor tags must not appear in headings');
        $this->assertStringContainsString('this guide', $html);
    }

    /** @test */
    public function headings_respect_level_attribute(): void
    {
        $html_h3 = $this->render_block('core/heading', [
            'content' => 'Sub-heading',
            'attrs'   => ['level' => 3],
        ]);

        $this->assertStringContainsString('<h3', $html_h3);
        $this->assertStringContainsString('"level":3', $html_h3);
    }

    /** @test */
    public function headings_default_to_h2(): void
    {
        $html = $this->render_block('core/heading', [
            'content' => 'Default heading',
            'attrs'   => [],
        ]);

        $this->assertStringContainsString('<h2', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  LIST RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_renders_unordered_lists(): void
    {
        $html = $this->render_block('core/list', [
            'content'  => '',
            'children' => ['First item', 'Second item'],
            'attrs'    => ['ordered' => false],
        ]);

        $this->assertStringContainsString('<ul', $html);
        $this->assertStringContainsString('<li>First item</li>', $html);
        $this->assertStringContainsString('<li>Second item</li>', $html);
    }

    /** @test */
    public function it_renders_ordered_lists(): void
    {
        $html = $this->render_block('core/list', [
            'content'  => '',
            'children' => ['Step one', 'Step two'],
            'attrs'    => ['ordered' => true],
        ]);

        $this->assertStringContainsString('<ol', $html);
        $this->assertStringContainsString('"ordered":true', $html);
    }

    /** @test */
    public function lists_strip_bullet_prefixes(): void
    {
        $html = $this->render_block('core/list', [
            'content' => "- First\n- Second\n• Third\n1. Fourth",
            'attrs'   => ['ordered' => false],
        ]);

        $this->assertStringContainsString('<li>First</li>', $html);
        $this->assertStringContainsString('<li>Second</li>', $html);
        $this->assertStringContainsString('<li>Third</li>', $html);
        $this->assertStringContainsString('<li>Fourth</li>', $html);
    }

    /** @test */
    public function lists_skip_empty_items(): void
    {
        $html = $this->render_block('core/list', [
            'content' => "- First\n\n- Third",
            'attrs'   => ['ordered' => false],
        ]);

        $this->assertEquals(2, substr_count($html, '<li>'));
    }

    /** @test */
    public function lists_apply_inline_markdown_to_items(): void
    {
        $html = $this->render_block('core/list', [
            'content'  => '',
            'children' => ['Use **bold** here', 'And a [link](https://example.com)'],
            'attrs'    => ['ordered' => false],
        ]);

        $this->assertStringContainsString('<strong>bold</strong>', $html);
        $this->assertStringContainsString('<a href="https://example.com">link</a>', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CODE BLOCK RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function code_blocks_escape_html(): void
    {
        $html = $this->render_block('core/code', [
            'content' => '<script>alert("xss")</script>',
        ]);

        $this->assertStringContainsString('&lt;script&gt;', $html);
        $this->assertStringNotContainsString('<script>', $html);
    }

    /** @test */
    public function code_blocks_have_correct_markup(): void
    {
        $html = $this->render_block('core/code', [
            'content' => 'echo "hello";',
        ]);

        $this->assertStringContainsString('<pre class="wp-block-code"><code>', $html);
        $this->assertStringContainsString('<!-- wp:code -->', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  QUOTE / PULLQUOTE RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function quotes_wrap_in_blockquote(): void
    {
        $html = $this->render_block('core/quote', [
            'content' => 'To be or not to be.',
        ]);

        $this->assertStringContainsString('<blockquote class="wp-block-quote">', $html);
        $this->assertStringContainsString('To be or not to be.', $html);
    }

    /**
     * Pullquote attribution was removed because LLMs reliably hallucinate
     * quote authors. Renderer must not emit a <cite> element even if a
     * legacy payload happens to carry attrs.citation.
     *
     * @test
     */
    public function pullquotes_render_without_citation(): void
    {
        $html = $this->render_block('core/pullquote', [
            'content' => 'Knowledge is power.',
            'attrs'   => ['citation' => 'Francis Bacon'],
        ]);

        $this->assertStringContainsString('wp-block-pullquote', $html);
        $this->assertStringContainsString('Knowledge is power.', $html);
        $this->assertStringNotContainsString('<cite>', $html);
        $this->assertStringNotContainsString('Francis Bacon', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  TABLE RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function tables_render_headers_and_rows(): void
    {
        $html = $this->render_block('core/table', [
            'content'       => '',
            'table_content' => [
                'headers' => ['Name', 'Value'],
                'rows'    => [
                    ['Alpha', '100'],
                    ['Beta', '200'],
                ],
            ],
        ]);

        $this->assertStringContainsString('<th>Name</th>', $html);
        $this->assertStringContainsString('<td>Alpha</td>', $html);
        $this->assertStringContainsString('<td>200</td>', $html);
        $this->assertStringContainsString('has-fixed-layout', $html);
    }

    /** @test */
    public function table_cells_sanitize_inline_markdown(): void
    {
        $html = $this->render_block('core/table', [
            'content'       => '',
            'table_content' => [
                'headers' => ['Tool'],
                'rows'    => [['Use `grep` for search']],
            ],
        ]);

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringContainsString('grep', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  DETAILS RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function details_block_renders_summary_and_content(): void
    {
        $html = $this->render_block('core/details', [
            'content' => 'The answer is 42.',
            'attrs'   => ['summary' => 'What is the meaning?'],
        ]);

        $this->assertStringContainsString('<summary>What is the meaning?</summary>', $html);
        $this->assertStringContainsString('The answer is 42.', $html);
        $this->assertStringContainsString('wp-block-details', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  PARAGRAPH GLUING
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function short_consecutive_paragraphs_are_glued(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Short one.'],
                ['type' => 'core/paragraph', 'content' => 'Short two.'],
            ],
        ]);

        // Two short paragraphs should merge into one <p> block
        $this->assertEquals(1, substr_count($html, '<!-- wp:paragraph -->'));
        $this->assertStringContainsString('Short one. Short two.', $html);
    }

    /** @test */
    public function long_paragraphs_are_not_glued(): void
    {
        $long = str_repeat('word ', 50); // > 150 chars

        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => $long],
                ['type' => 'core/paragraph', 'content' => 'Short.'],
            ],
        ]);

        $this->assertEquals(2, substr_count($html, '<!-- wp:paragraph -->'));
    }

    /** @test */
    public function paragraph_followed_by_non_paragraph_is_not_glued(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Short.'],
                ['type' => 'core/heading',   'content' => 'Title', 'attrs' => ['level' => 2]],
            ],
        ]);

        $this->assertEquals(1, substr_count($html, '<!-- wp:paragraph -->'));
        $this->assertEquals(1, substr_count($html, '<!-- wp:heading'));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  LIST MERGING
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function consecutive_lists_are_merged(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/list', 'content' => "- A\n- B", 'attrs' => ['ordered' => false]],
                ['type' => 'core/list', 'content' => "- C\n- D", 'attrs' => ['ordered' => false]],
            ],
        ]);

        // Should be merged into a single list block
        $this->assertEquals(1, substr_count($html, '<!-- wp:list '));
        $this->assertStringContainsString('A', $html);
        $this->assertStringContainsString('D', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  FULL SERIALIZE_POST
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function serialize_post_returns_empty_string_for_empty_blocks(): void
    {
        $this->assertSame('', $this->serializer->serialize_post([]));
        $this->assertSame('', $this->serializer->serialize_post(['blocks' => []]));
    }

    /** @test */
    public function serialize_post_skips_malformed_blocks(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph'], // missing 'content'
                ['content' => 'orphan'],       // missing 'type'
                ['type' => 'core/paragraph', 'content' => 'Valid block.'],
            ],
        ]);

        $this->assertEquals(1, substr_count($html, '<!-- wp:paragraph -->'));
    }

    /** @test */
    public function serialize_post_renders_disclosure_when_enabled(): void
    {
        $campaign = [
            'structure' => [
                'disclosure' => [
                    'enabled' => true,
                    'text'    => 'AI-generated content.',
                ],
            ],
        ];

        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Hello.'],
            ],
        ], $campaign);

        $this->assertStringContainsString('AI-generated content.', $html);
        $this->assertStringContainsString('has-small-font-size', $html);
    }

    /** @test */
    public function serialize_post_omits_disclosure_when_disabled(): void
    {
        $campaign = [
            'structure' => [
                'disclosure' => [
                    'enabled' => false,
                    'text'    => 'Should not appear.',
                ],
            ],
        ];

        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Hello.'],
            ],
        ], $campaign);

        $this->assertStringNotContainsString('Should not appear.', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  FAQ RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function faq_section_renders_questions_and_answers(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'faq' => [
                'section_title' => 'FAQ',
                'items' => [
                    ['question' => 'What is AI?', 'answer' => 'Artificial Intelligence.'],
                    ['question' => 'Is it safe?', 'answer' => 'Generally yes.'],
                ],
            ],
        ]);

        $this->assertStringContainsString('FAQ', $html);
        $this->assertStringContainsString('What is AI?', $html);
        $this->assertStringContainsString('Artificial Intelligence.', $html);
    }

    /** @test */
    public function faq_skips_items_with_empty_question_or_answer(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'faq' => [
                'items' => [
                    ['question' => '', 'answer' => 'Orphan answer.'],
                    ['question' => 'Valid?', 'answer' => 'Yes.'],
                ],
            ],
        ]);

        $this->assertStringNotContainsString('Orphan answer.', $html);
        $this->assertStringContainsString('Valid?', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ACTION STEPS RENDERER
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function action_steps_render_as_ordered_list(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'action_steps' => [
                'section_title' => 'How To Do It',
                'steps' => [
                    ['name' => 'Step 1', 'text' => 'Do this first.'],
                    ['name' => 'Step 2', 'text' => 'Then do this.'],
                ],
            ],
        ]);

        $this->assertStringContainsString('<ol', $html);
        $this->assertStringContainsString('Step 1', $html);
        $this->assertStringContainsString('Do this first.', $html);
    }

    /** @test */
    public function action_steps_sanitize_markdown_in_text(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'action_steps' => [
                'steps' => [
                    ['name' => 'Install', 'text' => 'Run `npm install` to begin.'],
                ],
            ],
        ]);

        $this->assertStringContainsString('<code>', $html);
        $this->assertStringContainsString('npm install', $html);
    }

    /**
     * The `structura-howto` marker on the <ol> is the contract that headless
     * renderers (www/ marketing site) rely on to re-derive the HowTo
     * JSON-LD from `content.rendered`. If this test ever goes red, every
     * downstream consumer's FAQ/HowTo extraction silently breaks.
     *
     * @test
     */
    public function action_steps_emit_structura_howto_marker_on_ol(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'action_steps' => [
                'section_title' => 'Getting started',
                'steps' => [
                    ['name' => 'One', 'text' => 'First.'],
                    ['name' => 'Two', 'text' => 'Second.'],
                ],
            ],
        ]);

        // Class is on the rendered <ol> tag so HTML-only consumers see it.
        $this->assertMatchesRegularExpression(
            '/<ol[^>]*\bclass="[^"]*\bstructura-howto\b[^"]*"/',
            $html,
            'Action-step <ol> must carry the structura-howto marker class'
        );
        // className is also in the block attrs so the editor round-trip
        // preserves the marker if someone re-opens the post.
        $this->assertStringContainsString('"className":"structura-howto"', $html);
        // The section title is rendered as an <h2> immediately above the
        // list. HowTo.name falls back to the post title on headless
        // consumers — see www/lib/how-to.ts.
        $this->assertStringContainsString('Getting started', $html);
    }

    /**
     * Gutenberg validates core-block output HTML against what the block's
     * `save()` function would produce. The core/list block's save does not
     * emit arbitrary `data-*` attributes, so including one triggers a
     * "Block validation failed" warning the moment an editor opens the
     * post, and Gutenberg's autofix strips it. We therefore refuse to
     * emit `data-howto-name` on the <ol> — the marker class is sufficient
     * for headless extraction, and the HowTo name falls back to the post
     * title on the www side.
     *
     * @test
     */
    public function action_steps_do_not_emit_custom_data_attrs_on_ol(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'action_steps' => [
                'section_title' => 'Getting started',
                'steps' => [
                    ['name' => 'One', 'text' => 'First.'],
                    ['name' => 'Two', 'text' => 'Second.'],
                ],
            ],
        ]);

        // No data-* attributes anywhere on the <ol> — Gutenberg's block
        // validator would strip them and trigger the autofix warning.
        $this->assertDoesNotMatchRegularExpression(
            '/<ol\b[^>]*\bdata-[a-z-]+=/i',
            $html,
            'Action-step <ol> must not carry custom data-* attributes'
        );
    }

    /**
     * The FAQ section must land inside a `wp:group` with the
     * `structura-faq` marker — this is what lets the www/ site and other
     * headless consumers pick up the FAQ content without our post-meta
     * schema payload.
     *
     * @test
     */
    public function faq_section_emits_structura_faq_wrapper(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'faq' => [
                'section_title' => 'Common questions',
                'items' => [
                    ['question' => 'What is it?', 'answer' => 'A plugin.'],
                    ['question' => 'Why?',        'answer' => 'To help you.'],
                ],
            ],
        ]);

        $this->assertStringContainsString('<!-- wp:group {"className":"structura-faq"} -->', $html);
        $this->assertMatchesRegularExpression(
            '/<div\s+class="wp-block-group structura-faq">/',
            $html
        );
        // The h2 section title renders OUTSIDE the group so it's treated
        // as a page-level heading, not part of the FAQPage entity list.
        $title_pos = strpos($html, 'Common questions');
        $group_pos = strpos($html, 'structura-faq');
        $this->assertNotFalse($title_pos);
        $this->assertNotFalse($group_pos);
        $this->assertLessThan($group_pos, $title_pos,
            'FAQ section title must render before the structura-faq wrapper');
    }

    /** @test */
    public function faq_emits_no_wrapper_when_all_items_are_invalid(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
            ],
            'faq' => [
                'items' => [
                    ['question' => '',  'answer' => 'Orphan.'],
                    ['question' => 'Q', 'answer' => ''],
                ],
            ],
        ]);

        $this->assertStringNotContainsString('structura-faq', $html);
        $this->assertStringNotContainsString('<!-- wp:group', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  REFERENCES LIST (specs/study-lookup.md §12.7)
    //
    //  The cloud builds each entry from the study lookup as inline HTML:
    //  escaped text, the journal in <em>, one doi.org link. The post shows
    //  it after the FAQ and before the disclosure as an ordinary heading and
    //  list the customer can edit in the block editor.
    // ──────────────────────────────────────────────────────────────────────

    private const ENTRY_JOHNSON = 'Johnson, S. M., &amp; Lee, K. (2021). Sleep and shift work. <em>Sleep Health</em>, 7(3), 45–67. <a href="https://doi.org/10.1016/j.sleh.2021.01.002">https://doi.org/10.1016/j.sleh.2021.01.002</a>';

    /** A title-first entry: the study has no authors and its title starts with a year. */
    private const ENTRY_TITLE_FIRST = '2019 survey of sleep habits in shift workers. (2020). <em>Occupational Medicine</em>, 70(1), 12–19. <a href="https://doi.org/10.1093/occmed/kqz001">https://doi.org/10.1093/occmed/kqz001</a>';

    /** @test */
    public function references_render_as_a_core_heading_and_list_after_the_faq_and_before_the_disclosure(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks'       => [['type' => 'core/paragraph', 'content' => 'Intro.']],
            'action_steps' => ['section_title' => 'How to start', 'steps' => [['name' => 'One', 'text' => 'First.']]],
            'faq'          => ['section_title' => 'FAQ', 'items' => [['question' => 'Why?', 'answer' => 'Because.']]],
            'references'   => ['heading' => 'References', 'items' => [self::ENTRY_JOHNSON, self::ENTRY_TITLE_FIRST]],
        ], ['structure' => ['disclosure' => ['enabled' => true, 'text' => 'AI-assisted.']]]);

        $this->assertStringContainsString(
            "<!-- wp:heading {\"level\":2} -->\n<h2 class=\"wp-block-heading\">References</h2>\n<!-- /wp:heading -->\n"
            . "<!-- wp:list {\"ordered\":false} -->\n<ul class=\"wp-block-list\">"
            . "<!-- wp:list-item -->\n<li>" . self::ENTRY_JOHNSON . "</li>\n<!-- /wp:list-item -->\n"
            . "<!-- wp:list-item -->\n<li>" . self::ENTRY_TITLE_FIRST . "</li>\n<!-- /wp:list-item -->\n"
            . "</ul>\n<!-- /wp:list -->\n",
            $html
        );
        $this->assertLessThan(strpos($html, '>References</h2>'), strpos($html, 'Because.'),
            'The references list comes after the FAQ');
        $this->assertLessThan(strpos($html, 'AI-assisted.'), strpos($html, self::ENTRY_TITLE_FIRST),
            'The disclosure comes after the references list');
    }

    /**
     * The body list renderer strips leading digits as list markers. A
     * title-first entry must keep its year.
     *
     * @test
     */
    public function a_reference_that_starts_with_digits_keeps_them(): void
    {
        $html = $this->render_references(['heading' => 'References', 'items' => [self::ENTRY_TITLE_FIRST]]);

        $this->assertStringContainsString('<li>2019 survey of sleep habits in shift workers.', $html);
    }

    /** @test */
    public function references_stay_a_separate_list_after_a_body_that_ends_with_a_list(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks'     => [
                ['type' => 'core/paragraph', 'content' => 'Intro.'],
                ['type' => 'core/list', 'content' => "- Keep a fixed bedtime\n- Dim the lights", 'attrs' => ['ordered' => false]],
            ],
            'references' => ['heading' => 'References', 'items' => [self::ENTRY_JOHNSON]],
        ]);

        $this->assertSame(2, substr_count($html, '<!-- wp:list {'));
        $heading = strpos($html, '>References</h2>');
        $this->assertLessThan($heading, strpos($html, '</ul>'), 'The body list closes before the references heading');
        $this->assertLessThan(strpos($html, 'Johnson, S. M.'), $heading);
    }

    /**
     * Entries are finished HTML. The inline-markdown pass body text gets
     * would turn the asterisk pair in allele names into emphasis.
     *
     * @test
     */
    public function reference_entries_are_not_read_as_markdown(): void
    {
        $entry = 'Okafor, N. (2022). HLA-B*57:01 and HLA-B*58:01 carriage in a regional cohort. <em>Pharmacogenomics</em>, 23(4), 201–210. <a href="https://doi.org/10.2217/pgs-2022-0001">https://doi.org/10.2217/pgs-2022-0001</a>';

        $html = $this->render_references(['heading' => 'References', 'items' => [$entry]]);

        $this->assertStringContainsString('<li>' . $entry . '</li>', $html);
        $this->assertSame(1, substr_count($html, '<a '));
    }

    /**
     * Free installs strip every external link (strip_external_links), the
     * entry's doi.org link included. Its text, DOI address and all, stays.
     *
     * @test
     */
    public function non_pro_installs_keep_the_reference_text_without_the_link(): void
    {
        $this->isPro = false;

        $html = $this->render_references(['heading' => 'References', 'items' => [self::ENTRY_JOHNSON]]);

        $this->assertStringContainsString('>References</h2>', $html);
        $this->assertStringContainsString(
            '<li>Johnson, S. M., &amp; Lee, K. (2021). Sleep and shift work. <em>Sleep Health</em>, 7(3), 45–67. https://doi.org/10.1016/j.sleh.2021.01.002</li>',
            $html
        );
        $this->assertStringNotContainsString('href=', $html);
    }

    /** @test */
    public function the_references_heading_is_rendered_as_plain_text(): void
    {
        $html = $this->render_references(['heading' => '<b>Quellen</b> & *Literatur*', 'items' => [self::ENTRY_JOHNSON]]);

        $this->assertStringContainsString('<h2 class="wp-block-heading">Quellen &amp; *Literatur*</h2>', $html);
    }

    /** @test */
    public function reference_entries_go_through_wp_kses_post_and_an_entry_left_empty_is_dropped(): void
    {
        // The unit TestCase passes wp_kses_post through untouched; a strict
        // stand-in shows what the real filter removes.
        Functions\when('wp_kses_post')->alias(function ($text) {
            return strip_tags((string) $text, '<em><a>');
        });

        $html = $this->render_references(['heading' => 'References', 'items' => [
            self::ENTRY_JOHNSON . '<script></script>',
            '<img src="x" onerror="alert(1)">',
        ]]);

        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringNotContainsString('<img', $html);
        $this->assertStringContainsString('<em>Sleep Health</em>', $html);
        $this->assertSame(1, substr_count($html, '<li>'));
    }

    /** @test */
    public function blank_and_non_string_reference_items_are_skipped(): void
    {
        $html = $this->render_references(['heading' => 'References', 'items' => ['', self::ENTRY_JOHNSON, 42, '   ']]);

        $this->assertSame(1, substr_count($html, '<li>'));
    }

    /**
     * @test
     * @dataProvider malformed_references
     *
     * @param mixed $references
     */
    public function absent_empty_or_malformed_references_render_nothing($references): void
    {
        $post = ['blocks' => [['type' => 'core/paragraph', 'content' => 'Intro.']]];

        $this->assertSame(
            $this->serializer->serialize_post($post),
            $this->serializer->serialize_post($post + ['references' => $references])
        );
    }

    public function malformed_references(): array
    {
        return [
            'null'                           => [null],
            'a string'                       => ['References'],
            'an empty array'                 => [[]],
            'no items'                       => [['heading' => 'References']],
            'empty items'                    => [['heading' => 'References', 'items' => []]],
            'items not a list'               => [['heading' => 'References', 'items' => 'Johnson (2021)']],
            'only blank or non-string items' => [['heading' => 'References', 'items' => ['', '   ', 42, null, ['Johnson']]]],
            'no heading'                     => [['items' => [self::ENTRY_JOHNSON]]],
            'blank heading'                  => [['heading' => '  ', 'items' => [self::ENTRY_JOHNSON]]],
            'heading that is only markup'    => [['heading' => '<b></b>', 'items' => [self::ENTRY_JOHNSON]]],
            'heading not a string'           => [['heading' => ['References'], 'items' => [self::ENTRY_JOHNSON]]],
        ];
    }

    // ──────────────────────────────────────────────────────────────────────
    //  IMAGE BLOCK (static helper)
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function generate_image_block_produces_valid_markup(): void
    {
        $html = Block_Serializer::generate_image_block(
            42,
            'https://example.com/image.jpg',
            'Alt text',
            'A caption'
        );

        $this->assertStringContainsString('wp-image-42', $html);
        $this->assertStringContainsString('src="https://example.com/image.jpg"', $html);
        $this->assertStringContainsString('alt="Alt text"', $html);
        $this->assertStringContainsString('wp-element-caption', $html);
        $this->assertStringContainsString('<!-- wp:image', $html);
    }

    /** @test */
    public function generate_image_block_omits_caption_when_empty(): void
    {
        $html = Block_Serializer::generate_image_block(1, 'https://example.com/img.jpg', 'alt');

        $this->assertStringNotContainsString('wp-element-caption', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SCHEMA DATA (JSON-LD)
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function get_schema_data_builds_how_to_schema(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'action_steps' => [
                'section_title' => 'How To Bake',
                'steps' => [
                    ['name' => 'Preheat', 'text' => 'Set oven to 350°F.'],
                    ['name' => 'Mix',     'text' => 'Combine ingredients.'],
                ],
            ],
        ]);

        $this->assertCount(1, $schemas);
        $this->assertSame('HowTo', $schemas[0]['@type']);
        $this->assertSame('How To Bake', $schemas[0]['name']);
        $this->assertCount(2, $schemas[0]['step']);
        $this->assertSame('HowToStep', $schemas[0]['step'][0]['@type']);
    }

    /** @test */
    public function get_schema_data_builds_faq_schema(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'faq' => [
                'items' => [
                    ['question' => 'What?', 'answer' => 'This.'],
                ],
            ],
        ]);

        $this->assertCount(1, $schemas);
        $this->assertSame('FAQPage', $schemas[0]['@type']);
        $this->assertCount(1, $schemas[0]['mainEntity']);
    }

    /** @test */
    public function get_schema_data_returns_empty_for_no_structured_data(): void
    {
        $schemas = $this->serializer->get_schema_data([]);

        $this->assertSame([], $schemas);
    }

    /** @test */
    public function get_schema_data_skips_empty_steps_and_questions(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'action_steps' => [
                'steps' => [
                    ['name' => '', 'text' => 'Orphan text.'],
                    ['name' => 'Valid', 'text' => ''],
                ],
            ],
            'faq' => [
                'items' => [
                    ['question' => '', 'answer' => 'Orphan.'],
                ],
            ],
        ]);

        // Both should be empty/null since all items are invalid
        $this->assertSame([], $schemas);
    }

    /**
     * Customer portal section edits (2026-11-16) store what a member typed
     * with `&`, `<`, `*`, backtick and `[` as entities so the post body
     * cannot turn them into markup. The JSON-LD showed those entities
     * (`Q&amp;A`) instead of the text. The cloud leaves `>` as typed; both
     * forms are covered.
     *
     * @test
     */
    public function get_schema_data_turns_typed_text_stored_as_entities_back_into_plain_text(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'action_steps' => [
                'section_title' => 'Q&amp;A &lt;b>',
                'steps' => [
                    ['name' => 'Q&amp;A &lt;b>', 'text' => 'Q&amp;A &lt;b&gt;'],
                ],
            ],
            'faq' => [
                'section_title' => 'FAQ',
                'items' => [
                    ['question' => 'Q&amp;A &lt;b>', 'answer' => 'Q&amp;A &lt;b&gt;'],
                ],
            ],
        ]);

        [$how_to, $faq] = $schemas;
        $this->assertSame('Q&A <b>', $how_to['name']);
        $this->assertSame('Q&A <b>', $how_to['step'][0]['name']);
        $this->assertSame('Q&A <b>', $how_to['step'][0]['text']);
        $this->assertSame('Q&A <b>', $faq['mainEntity'][0]['name']);
        $this->assertSame('Q&A <b>', $faq['mainEntity'][0]['acceptedAnswer']['text']);

        $json = json_encode($schemas);
        $this->assertIsString($json);
        $this->assertSame($schemas, json_decode($json, true), 'The schema must survive a JSON round-trip.');
    }

    /** @test */
    public function get_schema_data_decodes_numeric_and_named_entities(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'faq' => [
                'items' => [
                    [
                        'question' => 'Why &#42;stars&#42;, &#96;ticks&#96; and &#91;brackets]?',
                        'answer'   => 'Hex &#x2A; works&nbsp;too, as do &apos;quotes&quot;.',
                    ],
                ],
            ],
        ]);

        $item = $schemas[0]['mainEntity'][0];
        $this->assertSame('Why *stars*, `ticks` and [brackets]?', $item['name']);
        $this->assertSame("Hex * works\u{00A0}too, as do 'quotes\".", $item['acceptedAnswer']['text']);
    }

    /**
     * A member who typed an entity on purpose (`&lt;` as text) is stored
     * double-encoded. One decode gives back what they typed; a second would
     * turn it into a `<`.
     *
     * @test
     */
    public function get_schema_data_decodes_double_encoded_text_only_once(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'faq' => [
                'items' => [
                    ['question' => 'What is &amp;amp;?', 'answer' => 'Write &amp;lt;b&amp;gt; for a literal tag.'],
                ],
            ],
        ]);

        $item = $schemas[0]['mainEntity'][0];
        $this->assertSame('What is &amp;?', $item['name']);
        $this->assertSame('Write &lt;b&gt; for a literal tag.', $item['acceptedAnswer']['text']);
    }

    /**
     * Writer output carries no entities, so its schema must not change by a
     * byte. The expected JSON was captured from the builders before the
     * entity decoding was added. Markup is still stripped from text fields;
     * markdown was never converted in the schema and still is not.
     *
     * @test
     */
    public function get_schema_data_leaves_writer_output_byte_identical(): void
    {
        $schemas = $this->serializer->get_schema_data([
            'action_steps' => [
                'section_title' => 'How to brew pour-over coffee',
                'steps' => [
                    ['name' => 'Heat the water', 'text' => 'Bring water to **96°C**, just off the boil.'],
                    ['name' => 'Grind the beans', 'text' => 'Use a <strong>medium-fine</strong> grind, like table salt.'],
                    ['name' => 'Bloom', 'text' => 'Pour 50 g of water & wait 30 seconds. See [our guide](https://example.com/guide).'],
                    ['name' => 'Why rinse the filter?', 'text' => 'It removes paper taste; "trust me" it\'s worth it. Keep it > 90 °C.'],
                ],
            ],
            'faq' => [
                'section_title' => 'Coffee FAQ',
                'items' => [
                    ['question' => 'Can I use tap water?', 'answer' => 'Yes, if it tastes good. Use `filtered` water otherwise.'],
                    ['question' => 'How long does it take?', 'answer' => '<p>About <em>4 minutes</em> in total.</p>'],
                    ['question' => 'Café or cafe?', 'answer' => 'Both spellings work: «café» is common in Europe.'],
                ],
            ],
        ]);

        $this->assertSame(
            '[{"@context":"https:\/\/schema.org","@type":"HowTo","name":"How to brew pour-over coffee","step":['
            . '{"@type":"HowToStep","name":"Heat the water","text":"Bring water to **96°C**, just off the boil."},'
            . '{"@type":"HowToStep","name":"Grind the beans","text":"Use a medium-fine grind, like table salt."},'
            . '{"@type":"HowToStep","name":"Bloom","text":"Pour 50 g of water & wait 30 seconds. See [our guide](https:\/\/example.com\/guide)."},'
            . '{"@type":"HowToStep","name":"Why rinse the filter?","text":"It removes paper taste; \"trust me\" it\'s worth it. Keep it > 90 °C."}]},'
            . '{"@context":"https:\/\/schema.org","@type":"FAQPage","mainEntity":['
            . '{"@type":"Question","name":"Can I use tap water?","acceptedAnswer":{"@type":"Answer","text":"Yes, if it tastes good. Use `filtered` water otherwise."}},'
            . '{"@type":"Question","name":"How long does it take?","acceptedAnswer":{"@type":"Answer","text":"About 4 minutes in total."}},'
            . '{"@type":"Question","name":"Café or cafe?","acceptedAnswer":{"@type":"Answer","text":"Both spellings work: «café» is common in Europe."}}]}]',
            json_encode($schemas, JSON_UNESCAPED_UNICODE)
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    //  FREE-TIER EXTERNAL-LINK STRIPPER
    //
    //  Belt-and-suspenders for the cloud's "no outbound links" Free-tier
    //  prompt. The cloud already tells the model not to emit external
    //  anchors, but the LLM training prior for long-form content is
    //  "cite your sources" — the model occasionally disobeys. These
    //  tests pin the WP-side hard strip that guarantees the published
    //  post matches the tier story regardless of what the AI shipped.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function strips_external_anchors_for_non_pro_tier(): void
    {
        $this->isPro = false;

        $html = $this->serializer->serialize_post([
            'blocks' => [[
                'type'    => 'core/paragraph',
                'content' => 'See <a href="https://other.com/post">their guide</a> for more.',
            ]],
        ]);

        // External anchor is gone, inner text preserved.
        $this->assertStringNotContainsString('<a ', $html);
        $this->assertStringNotContainsString('href=', $html);
        $this->assertStringContainsString('their guide', $html);
    }

    /** @test */
    public function preserves_internal_anchors_for_non_pro_tier(): void
    {
        $this->isPro = false;

        // Same host as the stubbed home_url (https://example.com).
        $html = $this->serializer->serialize_post([
            'blocks' => [[
                'type'    => 'core/paragraph',
                'content' => 'See <a href="https://example.com/other-post">our other post</a>.',
            ]],
        ]);

        // Internal link survives even on Free — the strip only targets
        // external hosts. Free tier separately has the cloud's INTERNAL
        // LINKS bullet suppressed so it shouldn't have any internal
        // links to begin with, but this guard avoids breaking paid-tier
        // edge cases that share the same code path.
        $this->assertStringContainsString('<a href="https://example.com/other-post">our other post</a>', $html);
    }

    /** @test */
    public function leaves_external_anchors_alone_for_pro_tier(): void
    {
        // Default setUp mock returns is_pro: true → strip is a no-op.
        $html = $this->serializer->serialize_post([
            'blocks' => [[
                'type'    => 'core/paragraph',
                'content' => 'See <a href="https://other.com/post">their guide</a> for more.',
            ]],
        ]);

        $this->assertStringContainsString('<a href="https://other.com/post">their guide</a>', $html);
    }

    /** @test */
    public function strips_multiple_external_anchors_in_one_paragraph(): void
    {
        $this->isPro = false;

        $html = $this->serializer->serialize_post([
            'blocks' => [[
                'type'    => 'core/paragraph',
                'content' => 'Read <a href="https://a.com">one</a> and also <a href="https://b.org">two</a>.',
            ]],
        ]);

        $this->assertStringNotContainsString('href=', $html);
        $this->assertStringContainsString('one', $html);
        $this->assertStringContainsString('two', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  KEYPHRASE-EMPHASIS STRIPPER
    //
    //  Models trained on SEO copy compulsively bold the focus keyphrase on
    //  every mention. The cloud prompt forbids it, but the model disobeys, so
    //  serialize_post hard-strips it. Mirrors the cloud's headless
    //  stripKeyphraseEmphasis.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function unwraps_bolded_keyphrase_but_keeps_text(): void
    {
        $html = $this->serializer->serialize_post([
            'keyphrase' => 'Strategic AI Sales Tool Implementation',
            'blocks'    => [[
                'type'    => 'core/paragraph',
                'content' => 'A **strategic ai sales tool implementation** wins.',
            ]],
        ]);

        $this->assertStringNotContainsString('<strong>strategic ai sales tool implementation</strong>', $html);
        $this->assertStringContainsString('strategic ai sales tool implementation', $html);
    }

    /** @test */
    public function unwraps_keyphrase_across_punctuation_and_case(): void
    {
        $html = $this->serializer->serialize_post([
            'keyphrase' => 'ai sales tools',
            'blocks'    => [[
                'type'    => 'core/paragraph',
                'content' => 'Try <strong>AI Sales-Tools</strong> today.',
            ]],
        ]);

        $this->assertStringNotContainsString('<strong>', $html);
        $this->assertStringContainsString('AI Sales-Tools', $html);
    }

    /** @test */
    public function keeps_unrelated_emphasis_when_keyphrase_set(): void
    {
        $html = $this->serializer->serialize_post([
            'keyphrase' => 'ai sales tools',
            'blocks'    => [[
                'type'    => 'core/paragraph',
                'content' => 'An **important** caveat about pricing.',
            ]],
        ]);

        $this->assertStringContainsString('<strong>important</strong>', $html);
    }

    /** @test */
    public function single_word_keyphrase_requires_exact_match(): void
    {
        $html = $this->serializer->serialize_post([
            'keyphrase' => 'sales',
            'blocks'    => [[
                'type'    => 'core/paragraph',
                'content' => 'The **quarterly sales report** is out.',
            ]],
        ]);

        // 'sales' is only part of the bold run → genuine emphasis survives.
        $this->assertStringContainsString('<strong>quarterly sales report</strong>', $html);
    }

    /** @test */
    public function no_keyphrase_leaves_all_bold_intact(): void
    {
        $html = $this->serializer->serialize_post([
            'blocks' => [[
                'type'    => 'core/paragraph',
                'content' => 'A **strategic ai sales tool implementation** wins.',
            ]],
        ]);

        $this->assertStringContainsString('<strong>strategic ai sales tool implementation</strong>', $html);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  HELPERS
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Shorthand: serialize a single paragraph block.
     */
    private function render_paragraph(string $content): string
    {
        return $this->serializer->serialize_post([
            'blocks' => [
                ['type' => 'core/paragraph', 'content' => $content],
            ],
        ]);
    }

    /**
     * Shorthand: serialize a post whose only extra is an Action Steps section.
     *
     * @param array<int, array{name: string, text: string}> $steps
     */
    private function render_action_steps(array $steps): string
    {
        return $this->serializer->serialize_post([
            'blocks'       => [['type' => 'core/paragraph', 'content' => 'Intro.']],
            'action_steps' => ['section_title' => 'How to start', 'steps' => $steps],
        ]);
    }

    /**
     * Shorthand: serialize a post whose only extra is a references list.
     */
    private function render_references(array $references): string
    {
        return $this->serializer->serialize_post([
            'blocks'     => [['type' => 'core/paragraph', 'content' => 'Intro.']],
            'references' => $references,
        ]);
    }

    /**
     * Shorthand: serialize a single block of any type.
     */
    private function render_block(string $type, array $block): string
    {
        $block['type'] = $type;
        if ( ! isset($block['content'])) {
            $block['content'] = $block['content'] ?? '';
        }

        return $this->serializer->serialize_post([
            'blocks' => [$block],
        ]);
    }
}
