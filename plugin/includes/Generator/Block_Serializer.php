<?php

namespace Structura\Generator;

use Structura\Core\License_Manager;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Class Block_Serializer
 * * Responsible for converting structured AI data into valid Gutenberg block markup.
 */
class Block_Serializer
{
    /**
     * Public Helper: Generates a standard WP Image Block.
     * Can be called independently for sideloaded images.
     */
    public static function generate_image_block(
        int $attachment_id,
        string $url,
        string $alt = '',
        string $caption = ''
    ): string {
        $attrs = [
            'id'              => $attachment_id,
            'sizeSlug'        => 'large',
            'linkDestination' => 'none',
        ];

        $inner_html = sprintf(
            '<figure class="wp-block-image size-large"><img class="wp-image-%d" src="%s" alt="%s"/>%s</figure>',
            $attachment_id,
            esc_url($url),
            esc_attr($alt),
            ! empty($caption) ? '<figcaption class="wp-element-caption">' . esc_html($caption) . '</figcaption>' : '',
        );

        return self::wrap_block('image', $inner_html, $attrs);
    }

    /**
     * Standard Gutenberg Comment Wrapper
     */
    private static function wrap_block(string $block_type, string $inner_html, array $attrs = []): string
    {
        $attrs_json = ! empty($attrs) ? ' ' . wp_json_encode($attrs) : '';

        return "<!-- wp:{$block_type}{$attrs_json} -->\n" .
               $inner_html . "\n" .
               "<!-- /wp:{$block_type} -->\n";
    }

    /**
     * Entry point: Converts raw AI block data into a single HTML string.
     */
    public function serialize_post(array $ai_data, array $campaign = []): string
    {
        if (empty($ai_data['blocks']) || ! is_array($ai_data['blocks'])) {
            return '';
        }

        $html   = '';
        $blocks = $this->merge_consecutive_lists($ai_data['blocks']);
        $blocks = $this->glue_paragraphs($blocks);

        foreach ($blocks as $block) {
            // Safety: Skip malformed blocks
            if ( ! isset($block['type']) || ! isset($block['content'])) {
                continue;
            }

            $html .= $this->convert_to_html($block, $campaign);
        }

        // Render structured Action Steps section (with HowTo JSON-LD schema markup)
        if ( ! empty($ai_data['action_steps']) && is_array($ai_data['action_steps'])) {
            $html .= $this->render_action_steps($ai_data['action_steps']);
        }

        // Render structured FAQ section (with JSON-LD schema markup)
        if ( ! empty($ai_data['faq']) && is_array($ai_data['faq'])) {
            $html .= $this->render_faq($ai_data['faq']);
        }

        // Add Campaign-specific or Global Disclosure
        $html .= $this->get_disclosure_markup($campaign);

        // Belt-and-suspenders: strip outbound (external) `<a href>` tags
        // for Free / None / wp.org-anonymous installs. The cloud prompt
        // for those tiers already tells the model not to emit external
        // links, but the model occasionally disobeys (LLM training prior
        // for long-form is "cite your sources"). Hard-stripping here
        // guarantees the published post matches the tier story we sell
        // — paid posts get linkable authority, free posts stay plain
        // body content. Internal links (same hostname) are left alone
        // so the WP-side internal-link engine on Pro keeps working.
        if ( ! License_Manager::is_pro()) {
            $html = $this->strip_external_links($html);
        }

        // Strip keyphrase-bolding. Models trained on SEO copy compulsively wrap
        // the focus keyphrase in <strong> on every mention — an outdated tactic
        // that reads as spam and harms readability. The cloud generation prompt
        // already forbids it (instruction-builder.ts, FORMATTING: "Do NOT bold
        // or wrap the target keyphrase/keyword in <strong> tags"), but the
        // model's long-form training prior is strong enough to disobey — the
        // same reason we hard-strip external links above. This is the
        // deterministic backstop: keep the text, drop the wrapping emphasis.
        // Mirrors the cloud's headless `stripKeyphraseEmphasis`.
        $html = $this->strip_keyphrase_emphasis($html, (string)($ai_data['keyphrase'] ?? ''));

        $this->update_block_stats(count($blocks));

        return $html;
    }

    /**
     * List-merging logic (Preserved)
     */
    private function merge_consecutive_lists(array $blocks): array
    {
        $merged       = [];
        $current_list = null;

        foreach ($blocks as $block) {
            if (($block['type'] ?? '') === 'core/list') {
                if ($current_list) {
                    $current_list['content'] .= "\n" . ($block['content'] ?? '');
                } else {
                    $current_list = $block;
                }
            } else {
                if ($current_list) {
                    $merged[]     = $current_list;
                    $current_list = null;
                }
                $merged[] = $block;
            }
        }
        if ($current_list) {
            $merged[] = $current_list;
        }

        return $merged;
    }

    /* --- SPECIFIC RENDERERS (Logic preserved exactly from your reference) --- */

    /**
     * Merges consecutive short paragraphs to prevent "choppy" layouts.
     * Only glues if the current block and the next block are BOTH paragraphs.
     */
    private function glue_paragraphs(array $blocks): array
    {
        $glued = [];
        $count = count($blocks);

        for ($i = 0; $i < $count; $i++) {
            $block = $blocks[$i];

            // 1. Check if the current block is a "short" paragraph
            $is_short_p = (
                ($block['type'] ?? '') === 'core/paragraph' &&
                mb_strlen($block['content'] ?? '') < 150
            );

            // 2. Look ahead: Is there a next block? Is it also a paragraph?
            $has_paragraph_neighbor = (
                isset($blocks[$i + 1]) &&
                ($blocks[$i + 1]['type'] ?? '') === 'core/paragraph'
            );

            if ($is_short_p && $has_paragraph_neighbor) {
                // "Glue" the current content into the NEXT block in the array
                // We use trim to ensure we don't end up with triple-spaces
                $blocks[$i + 1]['content'] = trim($block['content']) . ' ' . ltrim($blocks[$i + 1]['content']);

                // Do NOT add the current block to $glued, we've moved its soul into the next one.
                continue;
            }

            // If it's a long paragraph, or the next block isn't a paragraph, push as-is
            $glued[] = $block;
        }

        return $glued;
    }

    /**
     * Core Router: Dispatches block types to their specific handlers.
     */
    private function convert_to_html(array $block, array $campaign): string
    {
        $type = $block['type'] ?? '';
        $html = '';

        switch ($type) {
            case 'core/paragraph':
                $html = $this->render_paragraph($block);
                break;
            case 'core/heading':
                $html = $this->render_heading($block);
                break;
            case 'core/list':
                $html = $this->render_list($block);
                break;
            case 'core/quote':
                $html = $this->render_quote($block);
                break;
            case 'core/table':
                $html = $this->render_table($block);
                break;
            case 'core/image':
                $html = $block['content'] ?? ''; // Pre-serialized by Task_Runner
                break;
            case 'core/code':
                $html = $this->render_code($block);
                break;
            case 'core/pullquote':
                $html = $this->render_pullquote($block);
                break;
            case 'core/details':
                $html = $this->render_details($block);
                break;
        }

        /**
         * Filter: structura_render_block
         * Allows themes/plugins to modify the HTML output of a specific block.
         *
         * @param string $html    The generated block HTML.
         * @param array $block    The raw block data from AI.
         * @param string $type    The block type (e.g., 'core/paragraph').
         * @param array $campaign The campaign data, useful for context-aware modifications.
         */
        $html = apply_filters('structura_render_block', $html, $block, $type, $campaign);

        $hook_suffix = str_replace('/', '_', $type);

        /**
         * Filter: structura_render_block_{type}
         * More specific filter for individual block types.
         * Example: structura_render_block_core_paragraph for 'core/paragraph' blocks.
         *
         * @param string $html    The generated block HTML.
         * @param array $block    The raw block data from AI.
         * @param array $campaign The campaign data, useful for context-aware modifications.
         */
        return apply_filters("structura_render_block_{$hook_suffix}", $html, $block, $campaign);
    }

    private function render_paragraph($block): string
    {
        $content = $this->sanitize_inline_markdown($block['content'] ?? '');

        return self::wrap_block('paragraph', '<p>' . wp_kses_post($content) . '</p>');
    }

    /**
     * Catch-all for AI markdown habits.
     * Swaps stray backticks with <code> tags, removes stray **bold** if they
     * slip in, and autolinks naked URLs that the model emits as plain text.
     *
     * Code spans are extracted into placeholders FIRST so that bold, italic,
     * link, and autolink conversions never touch content inside backticks.
     *
     * The autolinker (step 4.5) is a belt-and-braces safety net for the
     * prompt-side guidance in functions/src/ai/instruction-builder.ts that
     * tells the model to wrap every URL in an <a> tag. Newer models follow
     * that rule reliably, but a missed prompt update — or a provider that
     * ignores formatting hints — would otherwise drop raw URLs into the
     * paragraph body, where wp_kses_post renders them as plain text. Keeping
     * the safety net here means a single provider regression does not ship
     * broken hyperlinks to production posts.
     */
    private function sanitize_inline_markdown(string $content): string
    {
        // ── 1. Extract code spans into placeholders ──────────────────────
        // This prevents any further markdown processing inside `code`.
        $code_spans  = [];
        $placeholder = "\x00CODE_%d\x00";
        $content     = preg_replace_callback('/`(.*?)`/', function ($m) use (&$code_spans, $placeholder) {
            $index              = count($code_spans);
            $code_spans[$index] = '<code>' . esc_html($m[1]) . '</code>';

            return sprintf($placeholder, $index);
        }, $content);

        // ── 2. Replace double-asterisks: **bold** -> <strong>bold</strong>
        $content = preg_replace('/\*\*(.*?)\*\*/', '<strong>$1</strong>', $content);

        // ── 3. Replace single-asterisks: *italic* -> <em>italic</em>
        $content = preg_replace('/\*(.*?)\*/', '<em>$1</em>', $content);

        // ── 4. Replace Markdown links: [text](url) -> <a href="url">text</a>
        // Vital for maintaining SEO and internal link integrity.
        $content = preg_replace('/\[([^]]+)]\(([^)]+)\)/', '<a href="$2">$1</a>', $content);

        // ── 4.5. Autolink naked URLs: https?://… -> <a href="URL">URL</a>
        // Existing <a> tags (from step 4 or pre-formed HTML) are extracted
        // into placeholders first so we never nest anchors. URLs inside
        // <code>…</code> are already in code placeholders from step 1, so
        // they're not touched either.
        $anchor_tags = [];
        $anchor_ph   = "\x00ANCHOR_%d\x00";
        $content     = preg_replace_callback(
            '/<a\b[^>]*>.*?<\/a>/is',
            function ($m) use (&$anchor_tags, $anchor_ph) {
                $index               = count($anchor_tags);
                $anchor_tags[$index] = $m[0];

                return sprintf($anchor_ph, $index);
            },
            $content
        );

        // Match naked http(s) URLs. The (?<![\w/]) lookbehind prevents us
        // from picking up URLs already mid-attribute (e.g. href=https://…)
        // that somehow survived extraction above.
        $content = preg_replace_callback(
            '~(?<![\w/"\'=])(https?://[^\s<>"\']+)~i',
            function ($m) {
                $url   = $m[1];
                $trail = '';

                // Peel common sentence-ending punctuation off the tail.
                // Intentionally conservative: we do NOT peel `)` or `]`,
                // because legitimate URLs (Wikipedia, MDN, Jira, etc.)
                // frequently include balanced brackets in the path.
                while ($url !== '' && preg_match('/[.,;:!?]$/', $url)) {
                    $trail = substr($url, -1) . $trail;
                    $url   = substr($url, 0, -1);
                }

                if ($url === '') {
                    return $m[0];
                }

                return '<a href="' . esc_url($url) . '">' . esc_html($url) . '</a>' . $trail;
            },
            $content
        );

        // Restore anchor placeholders.
        foreach ($anchor_tags as $index => $html) {
            $content = str_replace(sprintf($anchor_ph, $index), $html, $content);
        }

        // ── 5. Restore code span placeholders ────────────────────────────
        foreach ($code_spans as $index => $html) {
            $content = str_replace(sprintf($placeholder, $index), $html, $content);
        }

        // ── 6. Safety net: strip any remaining forbidden nesting ─────────
        $content = $this->clean_inline_html($content);

        return $content;
    }

    /**
     * Post-processing safety net that removes HTML tags from contexts
     * where they are semantically invalid or produce broken Gutenberg output.
     *
     * Handles cases where the AI sends pre-formed HTML (not markdown)
     * that still contains bad nesting, e.g. <code><a href="…">…</a></code>.
     */
    private function clean_inline_html(string $content): string
    {
        // Strip any HTML tags inside <code>…</code> (links, bold, italic, etc.)
        $content = preg_replace_callback(
            '/<code>(.*?)<\/code>/s',
            function ($m) {
                return '<code>' . wp_strip_all_tags($m[1]) . '</code>';
            },
            $content
        );

        // Strip <a> tags inside headings that may have leaked through
        // (headings use this method too; anchor-wrapped headings break WP block validation).
        // Note: this only matters when called from render_heading context —
        // the regex is harmless for paragraph content.

        return $content;
    }

    private function render_heading($block): string
    {
        $level   = (int)($block['attrs']['level'] ?? 2);
        $content = $this->sanitize_inline_markdown($block['content'] ?? '');

        // Strip <a> tags from headings — anchor-wrapped headings break
        // Gutenberg block validation and are poor for accessibility.
        // The link text is preserved; only the wrapping tag is removed.
        $content = preg_replace('/<a\b[^>]*>(.*?)<\/a>/s', '$1', $content);

        $inner = "<h$level class=\"wp-block-heading\">" . wp_kses_post($content) . "</h$level>";

        return self::wrap_block('heading', $inner, ['level' => $level]);
    }

    private function render_list($block): string
    {
        $ordered    = ! empty($block['attrs']['ordered']);
        $tag        = $ordered ? 'ol' : 'ul';
        $items_html = '';

        $items = $block['children'] ?? (is_array($block['content'] ?? []) ? $block['content'] : explode("\n",
            $block['content'] ?? ''));

        foreach ($items as $item) {
            $clean = preg_replace('/^[-*•\d.]+\s+/', '', trim($item));
            if (empty($clean)) {
                continue;
            }
            $items_html .= self::wrap_block('list-item',
                '<li>' . wp_kses_post($this->sanitize_inline_markdown($clean)) . '</li>');
        }

        return self::wrap_block('list', "<$tag class=\"wp-block-list\">$items_html</$tag>", ['ordered' => $ordered]);
    }

    private function render_quote($block): string
    {
        $content = $this->sanitize_inline_markdown($block['content'] ?? '');
        $inner   = self::wrap_block('paragraph', '<p>' . wp_kses_post($content) . '</p>');

        return self::wrap_block('quote', '<blockquote class="wp-block-quote">' . $inner . '</blockquote>');
    }

    private function render_code($block): string
    {
        // esc_html rather than wp_kses_post — code must not be parsed as HTML
        $content = esc_html($block['content'] ?? '');

        return self::wrap_block('code', '<pre class="wp-block-code"><code>' . $content . '</code></pre>');
    }

    private function render_pullquote($block): string
    {
        // Attribution was intentionally removed from the AI schema: LLMs
        // reliably hallucinate quote authors, and on our stock themes a
        // pullquote renders identically whether or not a <cite> is present.
        // Pullquotes here are visual emphasis only, not attributed quotes.
        $content = wp_kses_post($this->sanitize_inline_markdown($block['content'] ?? ''));
        $inner   = '<blockquote><p>' . $content . '</p></blockquote>';

        return self::wrap_block('pullquote', '<figure class="wp-block-pullquote">' . $inner . '</figure>');
    }

    private function render_details($block): string
    {
        $summary = esc_html($block['attrs']['summary'] ?? '');
        $content = $this->sanitize_inline_markdown($block['content'] ?? '');

        $inner_paragraph = self::wrap_block('paragraph', '<p>' . wp_kses_post($content) . '</p>');

        return self::wrap_block(
            'details',
            '<details class="wp-block-details"><summary>' . $summary . '</summary>' . $inner_paragraph . '</details>'
        );
    }

    /**
     * Renders the "Action Steps" section at the end of a generated post.
     *
     * The output is an ordered list stamped with a `structura-howto` marker
     * class on the `<ol>` tag. That marker is the contract consumed by
     * headless renderers such as the www/ marketing site: they grep the
     * rendered post HTML for `structura-howto` and lift the list back into
     * a schema.org `HowTo` JSON-LD object. The monolithic (native WP)
     * install also emits a JSON-LD `HowTo` via `get_schema_data()` → post
     * meta, so the marker is additive — it lets a headless consumer
     * reproduce the schema without having access to our post-meta schema
     * payload.
     *
     * We intentionally bypass `render_list()` here (rather than threading
     * the marker class through a generic list renderer) so that regular
     * ordered lists elsewhere in the post stay untouched. False-positive
     * HowTo schema can deindex a page in Search Console, so "only the lists
     * we explicitly mark" is the safer invariant.
     *
     * Gutenberg validates core blocks' saved HTML against what the block's
     * `save()` function would produce. The `className` attr is supported
     * and round-trips cleanly; arbitrary `data-*` attributes are NOT —
     * Gutenberg strips them on load and triggers a "Block validation
     * failed" warning in the editor. That ruled out the earlier
     * `data-howto-name` attribute on the <ol>. Instead, when a section
     * title is supplied we emit an <h2> right above the list; the www
     * extractor falls back to the post title when no explicit name marker
     * is present, which is the more idiomatic HowTo.name anyway.
     */
    private function render_action_steps(array $action_steps): string
    {
        $html  = '';
        $steps = $action_steps['steps'] ?? [];

        if (empty($steps)) {
            return '';
        }

        $section_title = trim((string)($action_steps['section_title'] ?? ''));

        if ($section_title !== '') {
            $html .= $this->render_heading(['content' => $section_title, 'attrs' => ['level' => 2]]);
        }

        $items_html = '';
        foreach ($steps as $step) {
            $name = trim($step['name'] ?? '');
            $text = trim($step['text'] ?? '');
            if (empty($name) || empty($text)) {
                continue;
            }

            $li_body = '<strong>' . esc_html($name) . '</strong> — ' . $this->sanitize_inline_markdown($text);
            $items_html .= self::wrap_block('list-item', '<li>' . wp_kses_post($li_body) . '</li>');
        }

        if ($items_html === '') {
            return $html;
        }

        // `className` goes into the Gutenberg block attrs so the editor
        // round-trip preserves the marker if an editor re-opens the post.
        // It is also rendered inline on the <ol> for consumers that only
        // see the final HTML (headless REST → www, RSS readers, AMP).
        //
        // Do NOT add custom `data-*` attributes here — Gutenberg's block
        // validator strips them on load and the post opens with a "Block
        // validation failed" warning. If a future contract needs more
        // metadata, encode it via class tokens (e.g. `structura-howto--foo`)
        // or emit it in a sibling block, not as a data-attr on the <ol>.
        $html .= self::wrap_block(
            'list',
            '<ol class="wp-block-list structura-howto">' . $items_html . '</ol>',
            ['ordered' => true, 'className' => 'structura-howto']
        );

        return $html;
    }

    /**
     * Renders the "FAQ" section at the end of a generated post.
     *
     * Q/A pairs are emitted as alternating <h3>/<p> blocks (the same
     * visual contract we've always shipped) wrapped in a `wp:group` block
     * stamped with the marker class `structura-faq`. The wrapper is the
     * contract consumed by headless renderers (www/ marketing site) that
     * re-derive the `FAQPage` JSON-LD from `content.rendered` — they
     * don't have access to the `_structura_schema` post meta we stash for
     * the native WP install, so the HTML marker is how they find the FAQ.
     *
     * We use `wp:group` rather than raw HTML because it round-trips
     * cleanly through the block editor: an editor opening the post sees
     * a normal group with the h3/p children inside, not a "Custom HTML"
     * blob. The trade-off is that themes may apply default `.wp-block-
     * group` spacing; in practice group blocks without a `layout` attr
     * render as plain divs, so the visual drift is minimal.
     *
     * The section title (if any) stays OUTSIDE the group — it's the
     * human-visible "FAQ" heading, not part of the question list.
     */
    private function render_faq(array $faq): string
    {
        $html = '';

        if ( ! empty($faq['section_title'])) {
            $html .= $this->render_heading(['content' => $faq['section_title'], 'attrs' => ['level' => 2]]);
        }

        $inner = '';
        foreach ($faq['items'] ?? [] as $item) {
            $question = trim($item['question'] ?? '');
            $answer   = trim($item['answer'] ?? '');

            if (empty($question) || empty($answer)) {
                continue;
            }

            $inner .= $this->render_heading(['content' => $question, 'attrs' => ['level' => 3]]);
            $inner .= $this->render_paragraph(['content' => $answer]);
        }

        if ($inner === '') {
            return $html;
        }

        // Wrap the Q/A run in a marked `wp:group`. The inner div carries
        // `structura-faq` alongside Gutenberg's `wp-block-group` so both
        // a headless HTML-regex extractor and a human reader's browser
        // see the same marker.
        $html .= self::wrap_block(
            'group',
            '<div class="wp-block-group structura-faq">' . $inner . '</div>',
            ['className' => 'structura-faq']
        );

        return $html;
    }

    /**
     * Builds structured schema.org data from AI output for injection into <head>.
     * Called by Task_Runner after post insertion — data is stored as post meta.
     */
    public function get_schema_data(array $ai_data): array
    {
        $schemas = [];

        if ( ! empty($ai_data['action_steps']) && is_array($ai_data['action_steps'])) {
            $schema = $this->build_how_to_schema($ai_data['action_steps']);
            if ($schema) {
                $schemas[] = $schema;
            }
        }

        if ( ! empty($ai_data['faq']) && is_array($ai_data['faq'])) {
            $schema = $this->build_faq_schema($ai_data['faq']);
            if ($schema) {
                $schemas[] = $schema;
            }
        }

        return $schemas;
    }

    private function build_how_to_schema(array $action_steps): ?array
    {
        $schema_steps = [];

        foreach ($action_steps['steps'] ?? [] as $step) {
            $name = trim($step['name'] ?? '');
            $text = trim($step['text'] ?? '');
            if (empty($name) || empty($text)) {
                continue;
            }
            $schema_steps[] = [
                '@type' => 'HowToStep',
                'name'  => $name,
                'text'  => wp_strip_all_tags($text),
            ];
        }

        if (empty($schema_steps)) {
            return null;
        }

        return [
            '@context' => 'https://schema.org',
            '@type'    => 'HowTo',
            'name'     => $action_steps['section_title'] ?? '',
            'step'     => $schema_steps,
        ];
    }

    private function build_faq_schema(array $faq): ?array
    {
        $questions = [];

        foreach ($faq['items'] ?? [] as $item) {
            $question = trim($item['question'] ?? '');
            $answer   = trim($item['answer'] ?? '');
            if (empty($question) || empty($answer)) {
                continue;
            }
            $questions[] = [
                '@type'          => 'Question',
                'name'           => $question,
                'acceptedAnswer' => [
                    '@type' => 'Answer',
                    'text'  => wp_strip_all_tags($answer),
                ],
            ];
        }

        if (empty($questions)) {
            return null;
        }

        return [
            '@context'   => 'https://schema.org',
            '@type'      => 'FAQPage',
            'mainEntity' => $questions,
        ];
    }

    private function render_table($block): string
    {
        $data = $block['table_content'] ?? [];
        $html = '<figure class="wp-block-table"><table class="has-fixed-layout">';

        if ( ! empty($data['headers'])) {
            $html .= '<thead><tr>' . implode('',
                    array_map(fn($h) => '<th>' . wp_kses_post($h) . '</th>', $data['headers'])) . '</tr></thead>';
        }

        if ( ! empty($data['rows'])) {
            $html .= '<tbody>';
            foreach ($data['rows'] as $row) {
                $html .= '<tr>' . implode('',
                        array_map(fn($c) => '<td>' . wp_kses_post($this->sanitize_inline_markdown($c)) . '</td>',
                            $row)) . '</tr>';
            }
            $html .= '</tbody>';
        }

        $html .= '</table></figure>';

        return self::wrap_block('table', $html);
    }

    /**
     * Logic for AI Disclosure with Campaign-level awareness.
     */
    private function get_disclosure_markup(array $campaign): string
    {
        $cluster = $campaign['structure']['disclosure'] ?? null;
        if ($cluster && $cluster['enabled']) {
            return $this->format_disclosure($cluster['text']);
        }

        return '';
    }

    private function format_disclosure(string $text): string
    {
        return self::wrap_block('paragraph',
            '<p class="has-small-font-size"><em>' . esc_html($text) . '</em></p>',
            ['className' => 'has-small-font-size', 'fontSize' => 'small'],
        );
    }

    private function update_block_stats(int $count): void
    {
        $total = (int)get_option('structura_stat_generated_blocks', 0);
        update_option('structura_stat_generated_blocks', $total + $count);
    }

    /**
     * Replace external `<a href="…">text</a>` anchors with their inner
     * text. Same-host links (rare for Free since Site DNA's INTERNAL
     * LINKS bullet is suppressed for those tiers in the cloud prompt)
     * are preserved.
     *
     * "External" = the URL's host doesn't match this WP install's host.
     * Relative URLs (no host) are treated as internal and kept. Hash-
     * only / mailto / tel / javascript URLs fall through to the
     * keep-as-anchor branch because the regex requires `http(s)://` —
     * but they're rare enough that the asymmetry is fine.
     *
     * Why post-process instead of trusting the prompt: the cloud already
     * tells Free / None tiers "no outbound links" via
     * `instruction-builder.ts`, but the model's training prior for
     * long-form content is "cite your sources", so it occasionally
     * sneaks in references anyway. This is the hard guarantee — the
     * published post will never contain an external anchor on a
     * non-paid tier, regardless of what the AI produced.
     */
    /**
     * Normalize a string for keyphrase comparison: lowercase, collapse every
     * run of non-alphanumeric characters to a single space, trim. So
     * "Strategic AI Sales-Tool Implementation!" and
     * "strategic ai sales tool implementation" compare equal. Accented letters
     * fall to separators, which is imperfect but symmetric (both sides are
     * normalized identically), so equality still holds.
     */
    private function normalize_for_match(string $value): string
    {
        $value = function_exists('mb_strtolower') ? mb_strtolower($value) : strtolower($value);
        $value = preg_replace('/[^a-z0-9]+/i', ' ', $value);

        return trim((string)$value);
    }

    /**
     * Unwrap `<strong>` / `<b>` emphasis whose visible text is — or, for a
     * multi-word phrase, contains — the focus keyphrase, keeping the inner text.
     *
     * Matching is conservative: exact normalized equality always unwraps; a
     * substring match only fires for multi-word keyphrases, so a single common
     * word (e.g. a keyphrase of "sales") still requires an exact bold run and
     * genuine emphasis survives. Mirrors the cloud's headless
     * `stripKeyphraseEmphasis` so both surfaces ship identical body copy.
     */
    private function strip_keyphrase_emphasis(string $html, string $keyphrase): string
    {
        $target = $this->normalize_for_match($keyphrase);
        if ($html === '' || $target === '') {
            return $html;
        }
        $multi_word = strpos($target, ' ') !== false;

        return preg_replace_callback(
            '#<(strong|b)\b[^>]*>(.*?)</\1>#is',
            function ($m) use ($target, $multi_word) {
                $inner = $m[2];
                // Compare on the visible text, ignoring any nested inline tags.
                $text = $this->normalize_for_match(wp_strip_all_tags($inner));
                if ($text === '') {
                    return $m[0];
                }
                $matches = ($text === $target) || ($multi_word && strpos($text, $target) !== false);

                return $matches ? $inner : $m[0];
            },
            $html
        ) ?? $html;
    }

    private function strip_external_links(string $html): string
    {
        $home_host = wp_parse_url(home_url(), PHP_URL_HOST);
        // No home host means a weird / broken install — skip the strip
        // rather than guess. The cloud-side prompt is the primary gate;
        // this is a fallback that we'd rather no-op than misbehave.
        if (empty($home_host)) {
            return $html;
        }

        return preg_replace_callback(
            // Match `<a ... href="http(s)://...">inner</a>`. `[^"]*` for
            // the href keeps us off the inner anchor text, which we
            // capture in group 2. Non-greedy `.*?` on the inner so
            // adjacent anchors don't collapse. Case-insensitive for
            // `HREF` variants the model sometimes emits.
            '#<a\b[^>]*\bhref\s*=\s*"(https?://[^"]+)"[^>]*>(.*?)</a>#is',
            function ($m) use ($home_host) {
                $href_host = wp_parse_url($m[1], PHP_URL_HOST);
                // Same host as the WP install → internal link, keep the
                // original anchor (paid-only path; Free shouldn't have
                // any of these emitted in the first place).
                if ($href_host && strcasecmp($href_host, $home_host) === 0) {
                    return $m[0];
                }
                // Different host → external. Replace the whole anchor
                // with just the inner text. `wp_kses` keeps inline
                // markup the inner text may have picked up (e.g.
                // `<strong>`) but strips anything weird the regex
                // captured along with it.
                return wp_kses($m[2], [
                    'strong' => [],
                    'em'     => [],
                    'code'   => [],
                ]);
            },
            $html
        ) ?? $html;
    }
}