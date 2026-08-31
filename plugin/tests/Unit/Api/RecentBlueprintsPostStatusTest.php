<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Regression tests for `Rest_Api::get_recent_blueprints` — the handler
 * behind the campaign Posts tab and the Overview "Recent Posts" widget.
 *
 * 2026-07-15 agency report: a campaign whose runs insert posts as
 * `draft` (the default until direct publishing is enabled) showed
 * "0 posts" in the Posts tab even though drafts existed. Root cause:
 * neither the count query nor the list query passed `post_status`, and
 * WP_Query's default is publish-only — every draft was invisible to
 * both the total and the rows.
 *
 * These tests pin the wire contract at the WP_Query boundary: both
 * queries must enumerate every status a campaign post can occupy,
 * `draft` included.
 *
 * @covers \Structura\Api\Rest_Api::get_recent_blueprints
 */
class RecentBlueprintsPostStatusTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // The unit bootstrap ships no \WP_Query; alias the recording
        // fixture in once per process so the handler's `new \WP_Query`
        // lands here.
        if ( ! class_exists('WP_Query')) {
            class_alias(Fixtures\Recorded_WP_Query::class, 'WP_Query');
        }
        \Structura\Tests\Unit\Api\Fixtures\Recorded_WP_Query::$instances = [];

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            // Public_Site_Profile::load() surface — brand reads only.
            'get_theme_mod'        => false,
            'get_site_icon_url'    => '',
            'home_url'             => 'https://example.test/',
            'get_option'           => [],
            'get_bloginfo'         => '',
        ]);
    }

    /** @test */
    public function both_queries_include_drafts_in_their_post_status(): void
    {
        $request = new \WP_REST_Request();
        $request->set_param('campaign_id', 'nanoid-campaign-1');

        (new Rest_Api())->get_recent_blueprints($request);

        $queries = Fixtures\Recorded_WP_Query::$instances;
        $this->assertCount(2, $queries, 'Expected a count query and a list query.');

        foreach ($queries as $i => $args) {
            $label = $i === 0 ? 'count query' : 'list query';
            $this->assertArrayHasKey(
                'post_status',
                $args,
                "The {$label} must set post_status explicitly — WP_Query defaults to publish-only and hides campaign drafts."
            );
            foreach (['publish', 'draft', 'pending', 'future'] as $status) {
                $this->assertContains($status, (array)$args['post_status'], "The {$label} must include {$status} posts.");
            }
        }
    }

    /** @test */
    public function the_reported_total_counts_drafts(): void
    {
        // Two drafts + one published post live behind the count query.
        Fixtures\Recorded_WP_Query::$next_found_posts = 3;

        $request = new \WP_REST_Request();
        $request->set_param('campaign_id', 'nanoid-campaign-1');

        $response = (new Rest_Api())->get_recent_blueprints($request);

        $this->assertSame(3, $response['pagination']['total_items']);

        Fixtures\Recorded_WP_Query::$next_found_posts = 0;
    }
}

namespace Structura\Tests\Unit\Api\Fixtures;

/**
 * Recording stand-in for the global \WP_Query used by the handler.
 * Captures constructor args so tests can assert on the exact query the
 * plugin sends to WordPress; returns no rows so the handler's per-post
 * hydration (campaign reader, thumbnails, authors) never runs.
 */
class Recorded_WP_Query
{
    /** @var array<int, array> constructor args, in construction order */
    public static $instances = [];
    /** @var int what the next count query should report */
    public static $next_found_posts = 0;

    public $posts = [];
    public $found_posts = 0;

    public function __construct(array $args = [])
    {
        self::$instances[] = $args;
        $this->found_posts = self::$next_found_posts;
    }
}
