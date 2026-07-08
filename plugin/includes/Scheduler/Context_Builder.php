<?php

namespace Structura\Scheduler;

use Structura\Core\Public_Site_Profile;

class Context_Builder
{
    /**
     * For Free Tier: Returns a pre-formatted string for local adapters.
     * @throws \Exception
     */
    public function build_local_string_context(array $campaign): string
    {
        try {
            $cloud_data = $this->build_cloud_context($campaign);

            $sections = [];

            // Add Recent Titles
            if ( ! empty($cloud_data['recent_titles'])) {
                $sections[] = "RECENT TOPICS (Avoid Duplicates): " . implode(', ', $cloud_data['recent_titles']);
            }

            // Add Taxonomy Instructions
            foreach ($cloud_data['taxonomies'] as $tax => $list) {
                $label = $tax === 'categories' ? 'CATEGORY' : 'TAG';
                $mode  = $tax === 'categories' ? $campaign['taxonomy']['categories']['mode'] : $campaign['taxonomy']['tags']['mode'];

                $terms = array_map(fn($t) => "{$t['name']} ({$t['count']})", $list);

                if ($mode === 'restricted') {
                    $sections[] = "STRICT $label LIMIT: Use ONLY: [" . implode(', ',
                            $terms) . "]. DO NOT create new ones.";
                } elseif (empty($terms)) {
                    // No existing terms — be explicit so the model creates
                    // its own rather than leaving the post uncategorized.
                    $sections[] = "No {$label}S exist yet — create new relevant {$label}S for this post.";
                } else {
                    // With only one or two existing terms, nudge the model to
                    // create a better-fitting one instead of forcing the post
                    // into the lone existing term.
                    $hint = count($terms) <= 2
                        ? "Feel free to create a new, more relevant one rather than forcing a poor fit."
                        : "Use these or create new relevant ones.";
                    $sections[] = "EXISTING {$label}S: [" . implode(', ',
                            $terms) . "]. {$hint}";
                }
            }

            // Add Linking context
            $links      = array_map(fn($l) => "{$l['title']} ({$l['url']})", $cloud_data['internal_links']);
            $sections[] = "INTERNAL LINK SAMPLES:\n" . implode("\n", $links);

            return implode("\n\n", $sections);
        } catch (\Exception $e) {
            if (defined('WP_DEBUG') && WP_DEBUG) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- WP_DEBUG-gated; helpful when the exception's stack is needed alongside the message.
                error_log("Error building local context: " . $e->getMessage());
            }
            throw $e;
        }
    }

    /**
     * For Cloud Tier: Returns raw structured data for the JSON payload.
     */
    public function build_cloud_context(array $campaign): array
    {
        $campaign_id = $campaign['id'];

        return [
            'site_identity'  => [
                'title'   => get_bloginfo('name'),
                'tagline' => get_bloginfo('description'),
            ],
            'recent_titles'  => $this->get_recent_titles($campaign['post_type'] ?? 'post'),
            'taxonomies'     => [
                'categories' => $this->get_taxonomy_details('category', $campaign_id),
                'tags'       => $this->get_taxonomy_details('post_tag', $campaign_id),
            ],
            'internal_links' => $this->get_internal_links_context($campaign['post_type'] ?? 'post'),
        ];
    }

    /**
     * Returns a deduplicated list of recent post titles and their SEO keyphrases
     * (Yoast: _yoast_wpseo_focuskw, RankMath: rank_math_focus_keyword).
     * Both are combined so the LLM can avoid duplicating covered topics.
     */
    private function get_recent_titles(string $post_type): array
    {
        $query = new \WP_Query([
            'post_type'      => $post_type,
            'posts_per_page' => 50,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'post_status'    => 'publish',
        ]);

        $topics = [];
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $post_id = get_the_ID();

                $topics[] = get_the_title();

                // Yoast SEO focus keyphrase
                $yoast = get_post_meta($post_id, '_yoast_wpseo_focuskw', true);
                if ( ! empty($yoast)) {
                    $topics[] = $yoast;
                }

                // RankMath focus keyword (may contain comma-separated keywords)
                $rankmath = get_post_meta($post_id, 'rank_math_focus_keyword', true);
                if ( ! empty($rankmath)) {
                    foreach (array_map('trim', explode(',', $rankmath)) as $kw) {
                        if ($kw !== '') {
                            $topics[] = $kw;
                        }
                    }
                }
            }
            wp_reset_postdata();
        }

        return array_values(array_unique($topics));
    }

    /**
     * Gathers terms with their usage count to help AI "balance" the site.
     *
     * `$campaign_id` accepts int (legacy WP post id) or string (cloud nanoid,
     * post-Phase-1.0c). Cloud campaigns don't have WP post-meta entries, so
     * `get_post_meta(nanoid_string, ...)` returns the empty default and the
     * function emits "auto" mode + 40 sample terms — same behaviour as a
     * brand-new campaign that hasn't customised taxonomy mode yet. Cloud-side
     * synthesis still gets a usable site signal; the per-campaign override
     * moves to the cloud doc as part of Phase 1.0e site-identity sync.
     */
    private function get_taxonomy_details(string $taxonomy, $campaign_id): array
    {
        $meta_id  = is_numeric($campaign_id) ? (int) $campaign_id : 0;
        $cat_mode = $meta_id > 0
            ? (get_post_meta($meta_id, "_{$taxonomy}_mode", true) ?: 'auto')
            : 'auto';

        $args = [
            'taxonomy'   => $taxonomy,
            'hide_empty' => false,
        ];

        if ($cat_mode === 'restricted') {
            $args['include'] = $meta_id > 0
                ? (get_post_meta($meta_id, "_allowed_{$taxonomy}", true) ?: [])
                : [];
        } else {
            $args['number'] = 40;
        }

        $terms = get_terms($args);
        if (is_wp_error($terms)) {
            return [];
        }

        $details = [];
        foreach ($terms as $term) {
            if ($this->is_default_category($term, $taxonomy)) {
                continue;
            }
            $details[] = [
                'name'  => $term->name,
                'count' => $term->count,
            ];
        }

        return $details;
    }

    /**
     * True for WordPress's default "Uncategorized" category — the term WP
     * auto-assigns to a post saved with no category, which is why we never
     * feed it to the model (it just invites the post back into a non-choice).
     *
     * Matched by the configured default-category id FIRST, which is locale-
     * AND rename-proof: on a localized install BOTH the display name and the
     * slug are translated (German: name "Allgemein", slug "allgemein"), so a
     * hard-coded "uncategorized" name or slug misses it — that was the
     * "Allgemein" leak. The slug check remains only as a fallback for a site
     * whose default was repointed but still has a literal `uncategorized`
     * term lingering.
     *
     * Scoped to the `category` taxonomy (tags have no default). WP-only by
     * construction — this builder runs only inside the plugin, so other
     * surfaces' (Shopify/Webflow) "uncategorized"-style terms are untouched.
     */
    private function is_default_category(\WP_Term $term, string $taxonomy): bool
    {
        if ($taxonomy !== 'category') {
            return false;
        }
        if ((int) $term->term_id === (int) get_option('default_category')) {
            return true;
        }
        return $term->slug === 'uncategorized';
    }

    private function get_internal_links_context(string $post_type): array
    {
        $query = new \WP_Query([
            'post_type'      => $post_type,
            'posts_per_page' => 5,
            'orderby'        => 'rand',
            'post_status'    => 'publish',
        ]);

        $links = [];
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $links[] = [
                    'title'   => get_the_title(),
                    'url'     => self::public_permalink_for_post((int)get_the_ID()),
                    'excerpt' => get_the_excerpt(),
                ];
            }
            wp_reset_postdata();
        }

        return $links;
    }

    /**
     * Resolve the public-facing URL for a post. The URL is seeded into the
     * LLM's system prompt as an "INTERNAL LINK SAMPLE" so generated copy
     * can link back to existing posts — which means whatever string we
     * return here ends up embedded, verbatim, inside future published
     * articles.
     *
     * Why this isn't just `get_permalink()`
     * -------------------------------------
     * On Structura's own headless setup the blog is authored at
     * `cms.structurawp.com` and served at `www.structurawp.com/en/blog/…`
     * by the Next.js app in `www/`. WP's `get_permalink()` returns the
     * authoring origin (it only knows about `WP_HOME`), so un-rewritten
     * samples leaked the CMS hostname into live blog posts — e.g. a post
     * on `/en/blog/best-wordpress-ai-content-automation-for-agencies`
     * pointed at `https://cms.structurawp.com/<slug>/`, which 404s for
     * real readers.
     *
     * The rewrite logic now lives on {@see Public_Site_Profile} so the
     * whole plugin reads one source of truth for "the public URL of a
     * post" — Channel_Event_Forwarder, Task_Runner, and Rest_Api all go
     * through the same helper. This static method stays as a thin
     * delegate for back-compat with existing call sites and tests.
     *
     * Customer sites (the common case) leave the profile in `inherit`
     * mode — `permalink_for_post()` returns `get_permalink($post_id)`
     * unchanged, so customer-side behaviour is identical to pre-headless
     * builds.
     *
     * Spec: specs/site-identity-headless.md §5.
     */
    public static function public_permalink_for_post(int $post_id): string
    {
        return Public_Site_Profile::load()->permalink_for_post($post_id);
    }

    /**
     * Gathers brand-specific data for enhanced AI suggestions.
     * Used by handle_unified_suggestion to ground the AI in the site's
     * look and feel.
     *
     * The PRIMARY signal for suggestion grounding is `homepage_url` and
     * `landing_urls` — the cloud Jina-scrapes those pages to learn what
     * the brand actually offers (value proposition, products, audience).
     * Recent topics are the SECONDARY signal and exist only as an
     * "avoid duplicating" hint; they're capped at 8 here for that reason.
     *
     * Pre-2026-04-28 we shipped the entire 50-post recent-topics list as
     * the primary signal. That dragged reasoning-model suggestion calls
     * to 140s+ and produced topic suggestions skewed toward whatever
     * adjacent niches the site had drifted into, not its core value
     * proposition. The redesign moves grounding to the source of truth
     * (the homepage copy) and demotes recent posts to a duplication
     * filter.
     */
    public function build_brand_context(): array
    {
        $profile = Public_Site_Profile::load();

        // `homepage_url` is the URL the cloud Jina-scrapes for brand
        // grounding, so it MUST be the public face — `publicUrl`, not
        // `homeUrl`. In non-headless mode they're equal; in headless
        // mode `publicUrl` is the front-end origin (xerx.io) where the
        // marketing copy actually lives. Scraping `cms.xerx.io/` on a
        // headless install would return an empty WP theme front page
        // and produce useless brand grounding.
        $homepage_url = $profile->publicUrl !== ''
            ? $profile->publicUrl . '/'
            : (string)home_url('/');

        // Landing URLs: prefer the operator-curated `keyPages` list when
        // present (always the case in headless mode where Structura
        // can't see the public site's nav from inside WP). Fall back
        // to walking the WP nav menu — the legacy heuristic — for
        // non-headless installs that haven't filled in keyPages yet.
        $landing_urls = $profile->landing_urls_from_key_pages();
        if (empty($landing_urls)) {
            $landing_urls = $this->detect_landing_urls();
        }

        return [
            'identity'          => [
                'name'    => $profile->name,
                'tagline' => $profile->tagline,
            ],
            'homepage_url'      => $homepage_url,
            'landing_urls'      => $landing_urls,
            'content_footprint' => [
                // Recent topics demoted to "avoid duplicating" hint only.
                // The cloud uses scraped homepage + landing pages as the
                // primary grounding signal now (see docblock).
                'recent_topics' => array_slice($this->get_recent_titles('post'), 0, 8),
                'categories'    => $this->get_term_names('category'),
                'tags'          => $this->get_term_names('post_tag'),
            ],
            'language'          => $profile->language,
            'logo_url'          => $profile->logoUrl,
        ];
    }

    /**
     * Auto-detect up to 3 key landing-page URLs from the site's primary
     * navigation menu.
     *
     * Heuristic: walk the primary nav menu (whichever location WP returns
     * first), match item slugs/URLs against a curated list of common
     * value-prop slugs, and return the first 3 hits in slug-priority
     * order. Sites with non-English nav, weird IA, or no menu set up at
     * the "primary" location degrade to an empty list — the cloud
     * falls back to homepage-only scraping in that case.
     *
     * Why slug priority rather than menu order: a "Pricing" link may
     * appear last in nav but it's a higher-signal landing page for AI
     * grounding than the third blog category in the same menu. The
     * curated list is roughly ordered by value-prop density.
     *
     * Why only 3: each landing page costs one Jina scrape on the cloud
     * side. Three is enough for value prop, product surface, and
     * positioning without burning the per-suggestion token budget.
     *
     * @return string[] Up to 3 absolute URLs, possibly empty.
     */
    private function detect_landing_urls(): array
    {
        // Curated slug match list, ordered by value-prop signal density.
        // Match against the URL path's last segment, case-insensitive.
        $priority_slugs = [
            'features', 'product', 'products', 'services',
            'solutions', 'pricing', 'plans', 'about',
            'what-we-do', 'company', 'overview',
        ];

        // Pull the menu attached to the "primary" theme location, with
        // fallback to whatever the first registered location is. Many
        // themes don't use the literal "primary" name.
        $locations = get_nav_menu_locations();
        $menu_id = $locations['primary'] ?? reset($locations) ?: 0;
        if (!$menu_id) {
            return [];
        }

        $items = wp_get_nav_menu_items($menu_id);
        if (!is_array($items) || empty($items)) {
            return [];
        }

        $home_host = wp_parse_url(home_url('/'), PHP_URL_HOST);

        // Bucket matched URLs by their priority slug so we can return in
        // priority order rather than menu-order.
        $by_slug = [];
        foreach ($items as $item) {
            $url = is_object($item) ? ($item->url ?? '') : '';
            if (!$url) continue;

            // Skip external links — only own-site pages contribute to
            // brand-grounding context.
            $host = wp_parse_url($url, PHP_URL_HOST);
            if ($host && $host !== $home_host) continue;

            $path = wp_parse_url($url, PHP_URL_PATH);
            if (!$path) continue;

            $segment = strtolower(trim(basename(rtrim($path, '/')), '/'));
            if (!$segment) continue;

            foreach ($priority_slugs as $slug) {
                if ($segment === $slug || strpos($segment, $slug) !== false) {
                    if (!isset($by_slug[$slug])) {
                        $by_slug[$slug] = $url;
                    }
                    break;
                }
            }
        }

        $ordered = [];
        foreach ($priority_slugs as $slug) {
            if (isset($by_slug[$slug])) {
                $ordered[] = $by_slug[$slug];
                if (count($ordered) >= 3) break;
            }
        }
        return $ordered;
    }

    private function get_term_names(string $taxonomy): array
    {
        $args = ['taxonomy' => $taxonomy, 'hide_empty' => false, 'number' => 50];

        $terms = get_terms($args);
        if (is_wp_error($terms)) {
            return [];
        }

        // Drop WP's default category by id, not name — the prior
        // `!== 'Uncategorized'` name filter let the localized default
        // ("Allgemein" on a German install) leak into the model's context.
        $names = [];
        foreach ($terms as $term) {
            if ($this->is_default_category($term, $taxonomy)) {
                continue;
            }
            $names[] = $term->name;
        }

        return array_values($names);
    }
}