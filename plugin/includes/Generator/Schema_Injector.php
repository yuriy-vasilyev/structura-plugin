<?php

namespace Structura\Generator;

use Structura\Compat\SEO_Plugin_Detector;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Outputs structured schema.org JSON-LD markup into <head> for single posts.
 *
 * Two kinds of schema are emitted, from two sources:
 *
 *  1. **Content-derived** — FAQPage and HowTo, built at generation time
 *     from our marked blocks and stashed in `_structura_schema` post meta
 *     (see {@see Block_Serializer::get_schema_data}). Emitted on every
 *     Structura post that has them, regardless of any SEO plugin: those
 *     plugins don't parse our custom blocks, so there's no duplication.
 *
 *  2. **Page-level graph** — BlogPosting + Organization + BreadcrumbList +
 *     author Person + timezone-qualified dates, built here at render time
 *     (it needs the permalink, author, and dates that only exist once the
 *     post is published). This is the "first-class AI SEO" baseline for
 *     sites running *no* SEO plugin. When Yoast / Rank Math / SEOPress /
 *     AIOSEO is active we DEFER the whole graph to them — see
 *     {@see SEO_Plugin_Detector::seo_plugin_owns_article_schema}.
 *
 * The graph is only attached to posts Structura generated (those carry a
 * `_structura_generation_meta` marker); we never decorate a hand-written
 * post whose author may rely on the theme's or another plugin's schema.
 */
class Schema_Injector
{
    public function init(): void
    {
        add_action('wp_head', [$this, 'inject_schema_markup']);
    }

    public function inject_schema_markup(): void
    {
        if ( ! is_single()) {
            return;
        }

        $post = get_post();
        if ( ! $post || ! isset($post->ID)) {
            return;
        }
        $post_id = (int) $post->ID;

        // (1) Content-derived FAQ / HowTo — emitted whenever present.
        $stored = get_post_meta($post_id, '_structura_schema', true);
        if ( ! empty($stored) && is_array($stored)) {
            foreach ($stored as $schema) {
                $this->print_schema($schema);
            }
        }

        // (2) Page-level graph — only for our own posts, and only when no
        // SEO plugin already owns the article schema.
        if ( ! metadata_exists('post', $post_id, '_structura_generation_meta')) {
            return;
        }
        if ($this->seo_plugin_owns_article_schema()) {
            return;
        }

        foreach ($this->build_article_graph($post) as $schema) {
            $this->print_schema($schema);
        }
    }

    /**
     * Whether an active SEO plugin already owns the page-level article
     * graph, so we must defer. Thin seam over
     * {@see SEO_Plugin_Detector::seo_plugin_owns_article_schema} so unit
     * tests can exercise the defer branch without mutating global SEO-
     * plugin constants (which would leak across the whole test process).
     */
    protected function seo_plugin_owns_article_schema(): bool
    {
        return SEO_Plugin_Detector::seo_plugin_owns_article_schema();
    }

    /**
     * Echo one schema node as a pretty-printed JSON-LD <script>.
     *
     * @param array<string, mixed> $schema
     */
    private function print_schema(array $schema): void
    {
        echo '<script type="application/ld+json">' . "\n"
             . wp_json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)
             . "\n</script>\n";
    }

    /**
     * Build the BlogPosting + Organization + BreadcrumbList graph for a
     * Structura-generated post.
     *
     * @param \WP_Post $post
     *
     * @return array<int, array<string, mixed>>
     */
    private function build_article_graph(object $post): array
    {
        $permalink = (string) get_permalink($post);
        $org_id    = home_url('/') . '#organization';

        $description = wp_strip_all_tags((string) get_the_excerpt($post));

        $blog_posting = [
            '@context'         => 'https://schema.org',
            '@type'            => 'BlogPosting',
            '@id'              => $permalink . '#article',
            'headline'         => wp_strip_all_tags((string) get_the_title($post)),
            'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $permalink],
            // 'c' + GMT yields an ISO-8601 string WITH a +00:00 offset, so
            // the datetime is timezone-qualified (Rich Results warns when
            // it isn't). GMT (not site-local) keeps it unambiguous.
            'datePublished'    => get_post_time('c', true, $post),
            'dateModified'     => get_post_modified_time('c', true, $post),
            'author'           => $this->build_author((int) $post->post_author),
            'publisher'        => ['@id' => $org_id],
        ];

        if ($description !== '') {
            $blog_posting['description'] = $description;
        }

        if (has_post_thumbnail($post)) {
            $image = get_the_post_thumbnail_url($post, 'full');
            if ($image) {
                $blog_posting['image'] = (string) $image;
            }
        }

        $graph = [
            $blog_posting,
            $this->build_organization($org_id),
        ];

        $breadcrumb = $this->build_breadcrumb($post, $permalink);
        if ($breadcrumb !== null) {
            $graph[] = $breadcrumb;
        }

        return $graph;
    }

    /**
     * Author as a Person node, including the `url` (author archive) that
     * Google flags as a recommended-but-missing field when absent.
     *
     * @return array<string, mixed>
     */
    private function build_author(int $author_id): array
    {
        $author = [
            '@type' => 'Person',
            'name'  => (string) get_the_author_meta('display_name', $author_id),
        ];

        $url = $author_id > 0 ? get_author_posts_url($author_id) : '';
        if ($url) {
            $author['url'] = (string) $url;
        }

        return $author;
    }

    /**
     * The site as a single canonical Organization node. Everything that
     * needs a publisher points at this `@id` rather than inlining a second
     * copy — otherwise the page reports two Organization items.
     *
     * @return array<string, mixed>
     */
    private function build_organization(string $org_id): array
    {
        $org = [
            '@context' => 'https://schema.org',
            '@type'    => 'Organization',
            '@id'      => $org_id,
            'name'     => (string) get_bloginfo('name'),
            'url'      => home_url('/'),
        ];

        $logo = get_site_icon_url();
        if ($logo) {
            $org['logo'] = ['@type' => 'ImageObject', 'url' => (string) $logo];
        }

        return $org;
    }

    /**
     * Home → [primary category] → post BreadcrumbList. Returns null only
     * if the permalink is unusable (defensive — should never happen for a
     * published post).
     *
     * @param \WP_Post $post
     *
     * @return array<string, mixed>|null
     */
    private function build_breadcrumb(object $post, string $permalink): ?array
    {
        if ($permalink === '') {
            return null;
        }

        $items   = [];
        $items[] = [
            'name' => __('Home', 'structura'),
            'item' => home_url('/'),
        ];

        $categories = get_the_category($post->ID);
        if ( ! empty($categories) && is_array($categories)) {
            $primary  = $categories[0];
            $cat_link = get_category_link($primary->term_id);
            if ($cat_link) {
                $items[] = [
                    'name' => (string) $primary->name,
                    'item' => (string) $cat_link,
                ];
            }
        }

        $items[] = [
            'name' => wp_strip_all_tags((string) get_the_title($post)),
            'item' => $permalink,
        ];

        $list = [];
        foreach ($items as $i => $item) {
            $list[] = [
                '@type'    => 'ListItem',
                'position' => $i + 1,
                'name'     => $item['name'],
                'item'     => $item['item'],
            ];
        }

        return [
            '@context'        => 'https://schema.org',
            '@type'           => 'BreadcrumbList',
            'itemListElement' => $list,
        ];
    }
}
