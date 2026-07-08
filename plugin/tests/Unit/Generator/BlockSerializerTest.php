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
