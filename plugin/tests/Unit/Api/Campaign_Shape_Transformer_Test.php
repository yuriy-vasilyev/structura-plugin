<?php

namespace Structura\Tests\Unit\Api;

use Structura\Api\Campaign_Shape_Transformer;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Campaign_Shape_Transformer.
 *
 * Tests round-trip conversions between WP cluster shape and cloud
 * flat shape. Ensures data integrity during cloud proxy migration
 * (Phase 1.0b). Pure data transformations — no WP fixtures needed,
 * so the suite extends the Brain Monkey base `TestCase` like the
 * rest of the Unit directory rather than `WP_UnitTestCase` (which
 * only resolves under the Integration suite's `wp-bootstrap.php`).
 */
class Campaign_Shape_Transformer_Test extends TestCase
{
    /**
     * Test: cloud_to_wp transforms all cloud fields correctly
     */
    public function test_cloud_to_wp_identity()
    {
        $cloud = [
            'campaignId'            => '4r9TBGo0Pj_RDioJQGyib',
            'name'                  => 'SEO Tutorial Series',
            'objective'             => 'Rank for WordPress tutorials',
            'campaignMode'          => 'traffic_magnet',
            'textProvider'          => 'gemini',
            'textModel'             => 'gemini-2.0-flash',
            'imageProvider'         => 'anthropic',
            'imageModel'            => 'claude-image-v1',
            'fallbackTextProvider'  => 'openai',
            'fallbackImageProvider' => null,
            'personaId'             => 5,
            'language'              => 'en',
            'replaceLongDashes'     => true,
            'disableEmojis'         => false,
            'postLength'            => 2000,
            'seoRules'              => ['target_keyword_density', 'readability_score'],
            'enabledBlocks'         => ['core/paragraph', 'core/heading', 'core/image'],
            'featuredImage'         => true,
            'bodyImages'            => true,
            'disclosureEnabled'     => true,
            'disclosureText'        => 'Some links are affiliate links.',
            'postStatus'            => 'draft',
            'categoryMode'          => 'manual',
            'allowedCategories'     => [1, 2, 3],
            'tagMode'               => 'auto',
            'allowedTags'           => [],
            'cronSchedule'          => '0 9 * * 1',
            'endMode'               => 'quota',
            'endValue'              => 50,
            'authorityDomains'      => ['example.com', 'authority.io'],
            'authorityDiscoveredAt' => '2026-04-25T10:00:00Z',
            'keywordBank'           => ['seo', 'wordpress', 'tutorial'],
            'keywordsDiscoveredAt'  => '2026-04-24T10:00:00Z',
            'keywordQueueIndex'     => 0,
            'pregenerationEnabled'  => true,
            'status'                => 'active',
            'postsPublished'        => 15,
            'lastRunTimestamp'      => null,
        ];

        $wp = Campaign_Shape_Transformer::cloud_to_wp($cloud);

        // Check identity
        $this->assertSame('4r9TBGo0Pj_RDioJQGyib', $wp['id']);
        $this->assertSame('SEO Tutorial Series', $wp['identity']['name']);
        $this->assertSame('Rank for WordPress tutorials', $wp['identity']['objective']);
        $this->assertSame('traffic_magnet', $wp['identity']['campaignMode']);

        // Check intelligence
        $this->assertSame('gemini', $wp['intelligence']['textProvider']);
        $this->assertSame('gemini-2.0-flash', $wp['intelligence']['textModel']);
        $this->assertSame('anthropic', $wp['intelligence']['imageProvider']);
        $this->assertSame(5, $wp['intelligence']['personaId']);
        $this->assertTrue($wp['intelligence']['replaceLongDashes']);
        $this->assertFalse($wp['intelligence']['disableEmojis']);

        // Check structure
        $this->assertTrue($wp['structure']['featuredImage']);
        $this->assertTrue($wp['structure']['bodyImages']);
        $this->assertTrue($wp['structure']['disclosure']['enabled']);
        $this->assertSame('Some links are affiliate links.', $wp['structure']['disclosure']['text']);

        // Check taxonomy
        $this->assertSame('manual', $wp['taxonomy']['categories']['mode']);
        $this->assertSame([1, 2, 3], $wp['taxonomy']['categories']['list']);
        $this->assertSame('auto', $wp['taxonomy']['tags']['mode']);

        // Check schedule
        $this->assertSame('0 9 * * 1', $wp['schedule']['cron']);
        $this->assertSame('quota', $wp['schedule']['endCondition']['type']);
        $this->assertSame(50, $wp['schedule']['endCondition']['value']);

        // Check authority
        $this->assertContains('example.com', $wp['authority']['domains']);

        // Check stats
        $this->assertSame(15, $wp['stats']['postsPublished']);
    }

    /**
     * Test: wp_input_to_cloud handles flat SPA input correctly
     */
    public function test_wp_input_to_cloud_from_spa_flat()
    {
        $wp_input = [
            'name'                      => 'New Campaign',
            'objective'                 => 'Rank for WordPress',
            'topic'                     => 'Rank for WordPress',
            'campaign_mode'             => 'traffic_magnet',
            'text_provider'             => 'openai',
            'text_model'                => 'gpt-4o',
            'image_provider'            => 'openai',
            'image_model'               => 'dall-e-3',
            'fallback_text_provider'    => 'gemini',
            'fallback_image_provider'   => null,
            'persona_id'                => 3,
            'language'                  => 'en',
            'replace_long_dashes'       => '1',
            'disable_emojis'            => '0',
            'post_length'               => '1500',
            'seo_optimization_rules'    => ['keyword_density', 'readability'],
            'enabled_blocks'            => ['core/paragraph', 'core/heading'],
            'featured_image'            => '1',
            'body_images'               => '1',
            'enable_disclosure'         => '1',
            'disclosure_text'           => 'Affiliate disclaimer here',
            'post_status'               => 'publish',
            'category_mode'             => 'manual',
            'allowed_categories'        => [1, 2],
            'tag_mode'                  => 'auto',
            'allowed_tags'              => [],
            'cron_schedule'             => '0 14 * * *',
            'end_mode'                  => 'infinite',
            'end_posts'                 => '0',
            'end_date'                  => '',
            'status'                    => 'active',
            'posts_published'           => '0',
        ];

        $cloud = Campaign_Shape_Transformer::wp_input_to_cloud($wp_input);

        // Check camelCase conversion
        $this->assertSame('New Campaign', $cloud['name']);
        $this->assertSame('Rank for WordPress', $cloud['objective']);
        $this->assertSame('traffic_magnet', $cloud['campaignMode']);
        $this->assertSame('openai', $cloud['textProvider']);
        $this->assertSame('gpt-4o', $cloud['textModel']);
        $this->assertSame('openai', $cloud['imageProvider']);
        $this->assertSame('dall-e-3', $cloud['imageModel']);
        $this->assertSame('gemini', $cloud['fallbackTextProvider']);
        $this->assertNull($cloud['fallbackImageProvider']);
        $this->assertSame(3, $cloud['personaId']);
        $this->assertTrue($cloud['replaceLongDashes']);
        $this->assertFalse($cloud['disableEmojis']);
        $this->assertSame(1500, $cloud['postLength']);
        $this->assertSame(['keyword_density', 'readability'], $cloud['seoRules']);
        $this->assertTrue($cloud['featuredImage']);
        $this->assertTrue($cloud['bodyImages']);
        $this->assertTrue($cloud['disclosureEnabled']);
        $this->assertSame('Affiliate disclaimer here', $cloud['disclosureText']);
        $this->assertSame('0 14 * * *', $cloud['cronSchedule']);
        $this->assertSame('infinite', $cloud['endMode']);
        $this->assertNull($cloud['endValue']);
    }

    /**
     * Test: wp_cluster_to_cloud preserves migrated campaign data
     */
    public function test_wp_cluster_to_cloud_preserves_migration()
    {
        $wp_cluster = [
            'id'           => '123', // Migrated WP post ID as string
            'status'       => 'active',
            'identity'     => [
                'name'         => 'Existing Campaign',
                'objective'    => 'Existing objective',
                'campaignMode' => 'quick_wins',
            ],
            'intelligence' => [
                'textProvider'          => 'gemini',
                'textModel'             => 'gemini-2.0-flash',
                'imageProvider'         => null,
                'imageModel'            => '',
                'fallbackTextProvider'  => null,
                'fallbackImageProvider' => null,
                'personaId'             => 1,
                'language'              => 'de',
                'replaceLongDashes'     => false,
                'disableEmojis'         => true,
                'postLength'            => 800,
                'seoRules'              => [],
            ],
            'structure'    => [
                'enabledBlocks' => ['core/paragraph'],
                'featuredImage' => false,
                'bodyImages'    => false,
                'disclosure'    => ['enabled' => false, 'text' => ''],
                'postStatus'    => 'publish',
            ],
            'taxonomy'     => [
                'categories' => ['mode' => 'auto', 'list' => []],
                'tags'       => ['mode' => 'auto', 'list' => []],
            ],
            'schedule'     => [
                'cron'         => '0 8 * * 1-5',
                'endCondition' => ['type' => 'date', 'value' => '2026-12-31'],
            ],
            'authority'    => [
                'domains'         => ['site1.com', 'site2.com'],
                'discoveredAt'    => '2026-04-20T10:00:00Z',
            ],
            'keywords'     => [
                'bank'         => ['kw1', 'kw2'],
                'discoveredAt' => '2026-04-20T10:00:00Z',
            ],
            'stats'        => [
                'postsPublished' => 10,
            ],
        ];

        $cloud = Campaign_Shape_Transformer::wp_cluster_to_cloud($wp_cluster);

        // Verify the ID is preserved as string (crucial for migration)
        $this->assertSame('123', $cloud['campaignId']);
        $this->assertIsString($cloud['campaignId']);

        // Verify all cluster data is flattened correctly
        $this->assertSame('Existing Campaign', $cloud['name']);
        $this->assertSame('Existing objective', $cloud['objective']);
        $this->assertSame('quick_wins', $cloud['campaignMode']);
        $this->assertSame('gemini', $cloud['textProvider']);
        $this->assertNull($cloud['imageProvider']);
        $this->assertSame('de', $cloud['language']);
        $this->assertFalse($cloud['replaceLongDashes']);
        $this->assertTrue($cloud['disableEmojis']);
        $this->assertSame(800, $cloud['postLength']);
        $this->assertFalse($cloud['featuredImage']);
        $this->assertFalse($cloud['bodyImages']);
        $this->assertFalse($cloud['disclosureEnabled']);
        $this->assertSame('0 8 * * 1-5', $cloud['cronSchedule']);
        $this->assertSame('date', $cloud['endMode']);
        $this->assertSame('2026-12-31', $cloud['endValue']);
        $this->assertContains('site1.com', $cloud['authorityDomains']);
        $this->assertContains('kw1', $cloud['keywordBank']);
        $this->assertSame(10, $cloud['postsPublished']);
        $this->assertTrue($cloud['pregenerationEnabled']); // Default for migration
        $this->assertSame(0, $cloud['keywordQueueIndex']); // Default for migration
    }

    /**
     * Test: Round-trip cloud → wp → cloud preserves all fields
     */
    public function test_round_trip_cloud_to_wp_to_cloud()
    {
        $original_cloud = [
            'campaignId'            => 'test-campaign-id',
            'name'                  => 'Round Trip Campaign',
            'objective'             => 'Test objective',
            'campaignMode'          => 'authority',
            'textProvider'          => 'anthropic',
            'textModel'             => 'claude-opus-4.6',
            'imageProvider'         => 'gemini',
            'imageModel'            => 'imagen-3',
            'fallbackTextProvider'  => 'openai',
            'fallbackImageProvider' => 'anthropic',
            'personaId'             => 'random',
            'language'              => 'fr',
            'replaceLongDashes'     => false,
            'disableEmojis'         => true,
            'postLength'            => 1200,
            'seoRules'              => ['rule1', 'rule2'],
            'enabledBlocks'         => ['core/paragraph', 'core/list'],
            'featuredImage'         => false,
            'bodyImages'            => true,
            'disclosureEnabled'     => false,
            'disclosureText'        => '',
            'postStatus'            => 'pending',
            'categoryMode'          => 'auto',
            'allowedCategories'     => [5],
            'tagMode'               => 'manual',
            'allowedTags'           => [10, 11],
            'cronSchedule'          => '30 6 * * 0',
            'endMode'               => 'quota',
            'endValue'              => 25,
            'authorityDomains'      => ['a.com'],
            'authorityDiscoveredAt' => '2026-04-15T00:00:00Z',
            'keywordBank'           => ['kw'],
            'keywordsDiscoveredAt'  => '2026-04-14T00:00:00Z',
            'keywordQueueIndex'     => 0,
            'pregenerationEnabled'  => true,
            'status'                => 'paused',
            'postsPublished'        => 5,
            'lastRunTimestamp'      => null,
        ];

        // Cloud → WP
        $wp = Campaign_Shape_Transformer::cloud_to_wp($original_cloud);

        // Verify all fields are present in WP shape
        $this->assertSame('test-campaign-id', $wp['id']);
        $this->assertSame('Round Trip Campaign', $wp['identity']['name']);
        $this->assertSame('random', $wp['intelligence']['personaId']);
        $this->assertSame('paused', $wp['status']);

        // WP cluster → Cloud (to reverse transform)
        // Note: This simulates what would happen if we were to transform the cluster back
        $wp_cluster_like = [
            'id'           => $wp['id'],
            'status'       => $wp['status'],
            'identity'     => $wp['identity'],
            'intelligence' => $wp['intelligence'],
            'structure'    => $wp['structure'],
            'taxonomy'     => $wp['taxonomy'],
            'schedule'     => $wp['schedule'],
            'authority'    => $wp['authority'],
            'keywords'     => $wp['keywords'],
            'stats'        => $wp['stats'],
        ];

        $recovered_cloud = Campaign_Shape_Transformer::wp_cluster_to_cloud($wp_cluster_like);

        // Verify critical fields survive round-trip
        $this->assertSame($original_cloud['campaignId'], $recovered_cloud['campaignId']);
        $this->assertSame($original_cloud['name'], $recovered_cloud['name']);
        $this->assertSame($original_cloud['objective'], $recovered_cloud['objective']);
        $this->assertSame($original_cloud['campaignMode'], $recovered_cloud['campaignMode']);
        $this->assertSame($original_cloud['textProvider'], $recovered_cloud['textProvider']);
        $this->assertSame($original_cloud['textModel'], $recovered_cloud['textModel']);
        $this->assertSame($original_cloud['imageProvider'], $recovered_cloud['imageProvider']);
        $this->assertSame($original_cloud['personaId'], $recovered_cloud['personaId']);
        $this->assertSame($original_cloud['language'], $recovered_cloud['language']);
        $this->assertSame($original_cloud['postLength'], $recovered_cloud['postLength']);
        $this->assertSame($original_cloud['postStatus'], $recovered_cloud['postStatus']);
        $this->assertSame($original_cloud['cronSchedule'], $recovered_cloud['cronSchedule']);
        $this->assertSame($original_cloud['endMode'], $recovered_cloud['endMode']);
        $this->assertSame($original_cloud['endValue'], $recovered_cloud['endValue']);
        $this->assertSame($original_cloud['status'], $recovered_cloud['status']);
    }

    /**
     * Test: Nullable fields are handled correctly (empty string → null)
     */
    public function test_nullable_fields_normalize_correctly()
    {
        $wp_input = [
            'image_provider'          => '',
            'fallback_text_provider'  => '',
            'fallback_image_provider' => null,
        ];

        $cloud = Campaign_Shape_Transformer::wp_input_to_cloud($wp_input);

        $this->assertNull($cloud['imageProvider']);
        $this->assertNull($cloud['fallbackTextProvider']);
        $this->assertNull($cloud['fallbackImageProvider']);
    }

    /**
     * Test: Persona ID 'random' is preserved, numeric stays numeric
     */
    public function test_persona_id_types()
    {
        $wp_input_random = ['persona_id' => 'random'];
        $wp_input_numeric = ['persona_id' => '5'];

        $cloud_random = Campaign_Shape_Transformer::wp_input_to_cloud($wp_input_random);
        $cloud_numeric = Campaign_Shape_Transformer::wp_input_to_cloud($wp_input_numeric);

        $this->assertSame('random', $cloud_random['personaId']);
        $this->assertSame(5, $cloud_numeric['personaId']);
    }

    /**
     * Test: createdAt is normalized to ISO 8601 across every plausible
     * Firestore Timestamp wire shape, and omitted when absent/unparseable.
     *
     * The cloud returns `createdAt` as a Firestore Timestamp whose JSON
     * form differs by firebase-admin version, so the transformer has to
     * accept all of them rather than break when the SDK shape shifts.
     */
    public function test_cloud_to_wp_normalizes_created_at()
    {
        // firebase-admin's underscore-prefixed Timestamp JSON shape.
        // 1748785862 == 2025-06-01T13:51:02+00:00
        $underscore = Campaign_Shape_Transformer::cloud_to_wp([
            'campaignId' => 'c1',
            'createdAt'  => ['_seconds' => 1748785862, '_nanoseconds' => 0],
        ]);
        $this->assertSame('2025-06-01T13:51:02+00:00', $underscore['createdAt']);

        // Bare-key shape some SDK versions emit.
        $bare = Campaign_Shape_Transformer::cloud_to_wp([
            'campaignId' => 'c2',
            'createdAt'  => ['seconds' => 1748785862, 'nanoseconds' => 0],
        ]);
        $this->assertSame('2025-06-01T13:51:02+00:00', $bare['createdAt']);

        // Already-formatted ISO string passes through untouched.
        $iso = Campaign_Shape_Transformer::cloud_to_wp([
            'campaignId' => 'c3',
            'createdAt'  => '2026-06-01T13:51:02Z',
        ]);
        $this->assertSame('2026-06-01T13:51:02Z', $iso['createdAt']);

        // Numeric epoch in milliseconds is detected and divided down.
        $millis = Campaign_Shape_Transformer::cloud_to_wp([
            'campaignId' => 'c4',
            'createdAt'  => 1748785862000,
        ]);
        $this->assertSame('2025-06-01T13:51:02+00:00', $millis['createdAt']);

        // Missing timestamp → null so the SPA skips the "Created" row
        // rather than rendering an "Invalid Date".
        $absent = Campaign_Shape_Transformer::cloud_to_wp(['campaignId' => 'c5']);
        $this->assertNull($absent['createdAt']);
    }

    /**
     * Test: End value interpretation based on endMode
     */
    public function test_end_value_respects_end_mode()
    {
        // Mode: quota
        $wp_quota = [
            'end_mode'  => 'quota',
            'end_posts' => '50',
            'end_date'  => '',
        ];
        $cloud_quota = Campaign_Shape_Transformer::wp_input_to_cloud($wp_quota);
        $this->assertSame(50, $cloud_quota['endValue']);

        // Mode: date
        $wp_date = [
            'end_mode'  => 'date',
            'end_posts' => '0',
            'end_date'  => '2026-12-31',
        ];
        $cloud_date = Campaign_Shape_Transformer::wp_input_to_cloud($wp_date);
        $this->assertSame('2026-12-31', $cloud_date['endValue']);

        // Mode: infinite
        $wp_infinite = [
            'end_mode'  => 'infinite',
            'end_posts' => '0',
            'end_date'  => '',
        ];
        $cloud_infinite = Campaign_Shape_Transformer::wp_input_to_cloud($wp_infinite);
        $this->assertNull($cloud_infinite['endValue']);
    }

    /**
     * Test: referral links survive SPA → cloud with tracking params intact.
     */
    public function test_wp_input_to_cloud_maps_referral_links()
    {
        $wp_input = [
            'name'           => 'Affiliate campaign',
            'referral_links' => [
                [
                    'url'                => 'https://acme.example/go?ref=abc123&utm_source=structura',
                    'label'              => 'Acme Boards',
                    'relevanceKeywords'  => ['project management', 'kanban'],
                    'anchorText'         => 'the Acme Boards tool',
                ],
                // A row with no URL is meaningless and must be dropped.
                ['label' => 'Ghost', 'url' => ''],
            ],
        ];

        $cloud = Campaign_Shape_Transformer::wp_input_to_cloud($wp_input);

        $this->assertCount(1, $cloud['referralLinks']);
        $link = $cloud['referralLinks'][0];
        // Tracking params preserved verbatim.
        $this->assertSame(
            'https://acme.example/go?ref=abc123&utm_source=structura',
            $link['url']
        );
        $this->assertSame('Acme Boards', $link['label']);
        $this->assertSame(['project management', 'kanban'], $link['relevanceKeywords']);
        $this->assertSame('the Acme Boards tool', $link['anchorText']);
    }

    /**
     * Test: referral links survive cloud → SPA (cloud_to_wp) under structure,
     * and the optional anchorText is omitted when empty.
     */
    public function test_cloud_to_wp_exposes_referral_links()
    {
        $cloud = [
            'campaignId'    => 'abc',
            'referralLinks' => [
                [
                    'url'               => 'https://acme.example/go?ref=xyz',
                    'label'             => 'Acme',
                    'relevanceKeywords' => ['seo'],
                    // no anchorText
                ],
            ],
        ];

        $wp = Campaign_Shape_Transformer::cloud_to_wp($cloud);

        $this->assertCount(1, $wp['structure']['referralLinks']);
        $link = $wp['structure']['referralLinks'][0];
        $this->assertSame('https://acme.example/go?ref=xyz', $link['url']);
        $this->assertSame('Acme', $link['label']);
        $this->assertSame(['seo'], $link['relevanceKeywords']);
        $this->assertArrayNotHasKey('anchorText', $link);
    }

    /**
     * Test: wp_cluster_to_cloud reads referral links from the structure cluster.
     */
    public function test_wp_cluster_to_cloud_maps_referral_links()
    {
        $wp_cluster = [
            'id'        => 'abc',
            'structure' => [
                'referralLinks' => [
                    ['url' => 'https://acme.example/go?ref=1', 'label' => 'Acme'],
                ],
            ],
        ];

        $cloud = Campaign_Shape_Transformer::wp_cluster_to_cloud($wp_cluster);

        $this->assertCount(1, $cloud['referralLinks']);
        $this->assertSame('https://acme.example/go?ref=1', $cloud['referralLinks'][0]['url']);
    }
}
