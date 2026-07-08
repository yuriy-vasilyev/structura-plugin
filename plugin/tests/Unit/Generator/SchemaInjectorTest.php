<?php

namespace Structura\Tests\Unit\Generator;

use Brain\Monkey\Functions;
use Structura\Generator\Schema_Injector;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Generator\Schema_Injector
 */
class SchemaInjectorTest extends TestCase
{
    private Schema_Injector $injector;

    protected function setUp(): void
    {
        parent::setUp();
        $this->injector = new Schema_Injector();

        // Sensible single-post defaults; individual tests override.
        Functions\when('is_single')->justReturn(true);
        // The base TestCase stubs home_url() to a path-less constant; the
        // injector calls home_url('/'), so honour the argument here to get
        // realistic absolute URLs (with the trailing slash) in assertions.
        Functions\when('home_url')->alias(
            static fn (string $path = '/'): string => 'https://example.test' . $path
        );
        Functions\when('get_post')->justReturn((object) ['ID' => 42, 'post_author' => 7]);
        Functions\when('metadata_exists')->justReturn(true);
        Functions\when('get_permalink')->justReturn('https://example.test/native-gutenberg/');
        Functions\when('get_the_excerpt')->justReturn('A short excerpt.');
        Functions\when('get_the_title')->justReturn('Native Gutenberg AI Content Generator');
        Functions\when('get_post_time')->justReturn('2026-06-17T10:58:50+00:00');
        Functions\when('get_post_modified_time')->justReturn('2026-06-17T10:58:53+00:00');
        Functions\when('get_the_author_meta')->justReturn('Yurii Vasyliev');
        Functions\when('get_author_posts_url')->justReturn('https://example.test/author/yurii/');
        Functions\when('has_post_thumbnail')->justReturn(false);
        Functions\when('get_the_post_thumbnail_url')->justReturn('');
        Functions\when('get_bloginfo')->justReturn('Example Site');
        Functions\when('get_site_icon_url')->justReturn('');
        Functions\when('get_the_category')->justReturn([]);
        Functions\when('get_category_link')->justReturn('');
    }

    /**
     * Run the injector and return every decoded JSON-LD node it printed.
     *
     * @return array<int, array<string, mixed>>
     */
    private function emitted(): array
    {
        ob_start();
        $this->injector->inject_schema_markup();
        $html = (string) ob_get_clean();

        preg_match_all(
            '#<script type="application/ld\+json">\s*(.+?)\s*</script>#s',
            $html,
            $matches
        );

        return array_map(
            static fn (string $json): array => json_decode($json, true),
            $matches[1]
        );
    }

    /**
     * @param array<int, array<string, mixed>> $nodes
     */
    private function nodeOfType(array $nodes, string $type): ?array
    {
        foreach ($nodes as $node) {
            if (($node['@type'] ?? null) === $type) {
                return $node;
            }
        }
        return null;
    }

    public function test_emits_blogposting_organization_and_breadcrumb_for_generated_post(): void
    {
        $nodes = $this->emitted();

        $this->assertNotNull($this->nodeOfType($nodes, 'BlogPosting'));
        $this->assertNotNull($this->nodeOfType($nodes, 'Organization'));
        $this->assertNotNull($this->nodeOfType($nodes, 'BreadcrumbList'));
    }

    public function test_dates_are_timezone_qualified(): void
    {
        $article = $this->nodeOfType($this->emitted(), 'BlogPosting');

        $this->assertSame('2026-06-17T10:58:50+00:00', $article['datePublished']);
        $this->assertSame('2026-06-17T10:58:53+00:00', $article['dateModified']);
    }

    public function test_author_carries_a_url(): void
    {
        $article = $this->nodeOfType($this->emitted(), 'BlogPosting');

        $this->assertSame('Person', $article['author']['@type']);
        $this->assertSame('Yurii Vasyliev', $article['author']['name']);
        $this->assertSame('https://example.test/author/yurii/', $article['author']['url']);
    }

    public function test_publisher_is_a_reference_to_the_single_organization_node(): void
    {
        $nodes = $this->emitted();

        // Exactly one Organization node — the publisher points at it by id
        // rather than inlining a duplicate (the "2 orgs" failure mode).
        $orgs = array_filter($nodes, static fn ($n) => ($n['@type'] ?? null) === 'Organization');
        $this->assertCount(1, $orgs);

        $article = $this->nodeOfType($nodes, 'BlogPosting');
        $org     = $this->nodeOfType($nodes, 'Organization');

        $this->assertSame(['@id' => $org['@id']], $article['publisher']);
        $this->assertSame('https://example.test/#organization', $org['@id']);
    }

    public function test_breadcrumb_includes_primary_category_when_present(): void
    {
        Functions\when('get_the_category')->justReturn([
            (object) ['term_id' => 3, 'name' => 'Guides'],
        ]);
        Functions\when('get_category_link')->justReturn('https://example.test/category/guides/');

        $crumbs = $this->nodeOfType($this->emitted(), 'BreadcrumbList');
        $names  = array_column($crumbs['itemListElement'], 'name');

        $this->assertSame(['Home', 'Guides', 'Native Gutenberg AI Content Generator'], $names);
        $this->assertSame([1, 2, 3], array_column($crumbs['itemListElement'], 'position'));
    }

    public function test_defers_entire_graph_when_seo_plugin_is_active(): void
    {
        // Presence of any supported SEO plugin ⇒ Structura stands down on
        // the article graph (Yoast/Rank Math emit their own). We override
        // the deferral seam rather than defining a real SEO-plugin
        // constant, which would leak across the whole test process.
        $this->injector = new class extends Schema_Injector {
            protected function seo_plugin_owns_article_schema(): bool
            {
                return true;
            }
        };

        $nodes = $this->emitted();

        $this->assertNull($this->nodeOfType($nodes, 'BlogPosting'));
        $this->assertNull($this->nodeOfType($nodes, 'Organization'));
        $this->assertNull($this->nodeOfType($nodes, 'BreadcrumbList'));
    }

    public function test_skips_graph_for_non_structura_posts(): void
    {
        Functions\when('metadata_exists')->justReturn(false);

        $nodes = $this->emitted();

        $this->assertNull($this->nodeOfType($nodes, 'BlogPosting'));
        $this->assertSame([], $nodes);
    }

    public function test_still_emits_stored_faq_and_howto_schema(): void
    {
        $faq = ['@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => []];
        Functions\when('get_post_meta')->justReturn([$faq]);

        $nodes = $this->emitted();

        // Stored FAQ is emitted alongside the page-level graph.
        $this->assertNotNull($this->nodeOfType($nodes, 'FAQPage'));
        $this->assertNotNull($this->nodeOfType($nodes, 'BlogPosting'));
    }

    public function test_bails_when_not_a_single_post(): void
    {
        Functions\when('is_single')->justReturn(false);

        $this->assertSame([], $this->emitted());
    }
}
