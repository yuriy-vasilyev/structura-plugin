<?php

namespace Structura\Tests\Unit\Channels;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Channels\Channel_Event_Forwarder;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the Channel_Event_Forwarder.
 *
 * Verifies the gating and payload assembly of the forwarder without
 * standing up WordPress, the cloud, or the dispatcher.
 *
 * Static helper classes (License_Manager, Key_Manager, Cloud_Client,
 * Log_Service) are stubbed via Mockery alias mocks so we can assert *what*
 * the forwarder would send to the cloud, not just that it didn't crash.
 *
 * @covers \Structura\Channels\Channel_Event_Forwarder
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ChannelEventForwarderTest extends TestCase
{
    /** @test */
    public function it_never_delivers_password_protected_published_content(): void
    {
        Functions\when('get_post_field')->alias(function ($field) {
            return ['post_status' => 'publish', 'post_password' => 'private', 'post_content' => '<p>Protected</p>'][$field] ?? '';
        });
        $method = new \ReflectionMethod(Channel_Event_Forwarder::class, 'published_article');
        $method->setAccessible(true);
        $this->assertNull($method->invoke(new Channel_Event_Forwarder(), self::POST_ID, []));
    }

    /** @test */
    public function it_delivers_the_final_article_with_content_language_and_rank_math_title(): void
    {
        Functions\when('get_post_field')->alias(function ($field) {
            return ['post_status' => 'publish', 'post_name' => 'hallo', 'post_content' => '<p>Hallo Welt</p>'][$field] ?? '';
        });
        Functions\when('get_post_meta')->alias(function ($id, $key) {
            return ['_structura_content_language' => 'de', 'rank_math_title' => 'Hallo SEO', 'rank_math_description' => 'Beschreibung', 'rank_math_focus_keyword' => 'Hallo'][$key] ?? '';
        });
        Functions\stubs([
            'sanitize_title' => function ($v) { return $v; },
            'sanitize_textarea_field' => function ($v) { return strip_tags($v); },
            'wp_kses_post' => function ($v) { return $v; },
            'get_post_modified_time' => '2026-09-28T10:00:00Z',
        ]);
        $method = new \ReflectionMethod(Channel_Event_Forwarder::class, 'published_article');
        $method->setAccessible(true);
        $article = $method->invoke(new Channel_Event_Forwarder(), self::POST_ID, [
            'post_title' => 'Hallo', 'excerpt' => 'Kurz', 'locale' => 'en_US',
            'published_at' => '2026-09-28T09:00:00Z', 'post_url' => 'https://example.com/hallo', 'featured_image_url' => '',
        ]);
        $this->assertSame('de', $article['locale']);
        $this->assertSame('Hallo SEO', $article['metaTitle']);
        $this->assertSame('Beschreibung', $article['metaDescription']);
        $this->assertSame('<p>Hallo Welt</p>', $article['html']);
        $this->assertSame('https://example.com/hallo', $article['canonicalUrl']);
        $this->assertNull($article['author']);
    }

    /** @test */
    public function approval_queues_one_unique_article_job_without_calling_the_cloud(): void
    {
        if (!defined('STRUCTURA_AS_GROUP')) define('STRUCTURA_AS_GROUP', 'structura');
        Mockery::mock('alias:Structura\Core\Cloud_Client')->shouldNotReceive('post');
        Functions\expect('as_enqueue_async_action')->once()
            ->with('structura/channels/article_delivery_queued', [self::POST_ID], STRUCTURA_AS_GROUP, true)
            ->andReturn(123);
        (new Channel_Event_Forwarder())->on_structura_post_published(['post_id' => self::POST_ID]);
    }

    /** @test */
    public function approval_uses_wordpress_cron_when_action_scheduler_is_unavailable(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')->shouldNotReceive('post');
        Functions\expect('wp_schedule_single_event')->once()
            ->with(Mockery::type('int'), 'structura/channels/article_delivery_queued', [self::POST_ID])->andReturn(true);
        (new Channel_Event_Forwarder())->on_structura_post_published(['post_id' => self::POST_ID]);
    }

    /** @test */
    public function queued_approval_does_not_deliver_a_post_reverted_to_draft(): void
    {
        Functions\when('get_post_field')->justReturn('draft');
        Mockery::mock('alias:Structura\Core\Cloud_Client')->shouldNotReceive('post');
        (new Channel_Event_Forwarder())->deliver_approved_article(self::POST_ID);
        $this->assertTrue(true);
    }

    /** @test */
    public function expands_rank_math_templates_with_rank_math_even_when_yoast_is_present(): void
    {
        $post = (object)['ID' => self::POST_ID];
        Functions\when('get_post')->justReturn($post);
        Functions\when('get_post_meta')->alias(function ($id, $key) {
            return strpos($key, 'rank_math_') === 0 ? '%title% %sitename%' : '';
        });
        Functions\expect('wpseo_replace_vars')->never();
        Mockery::mock('alias:RankMath\Helper')->shouldReceive('replace_vars')->twice()
            ->with('%title% %sitename%', $post)->andReturn('Expanded title Site');
        Functions\when('get_post_field')->alias(function ($field) {
            return ['post_status' => 'publish', 'post_name' => 'hello', 'post_content' => '<p>Body</p>'][$field] ?? '';
        });
        Functions\stubs([
            'sanitize_title' => function ($v) { return $v; },
            'sanitize_textarea_field' => function ($v) { return strip_tags($v); },
            'wp_kses_post' => function ($v) { return $v; },
            'get_post_modified_time' => '2026-09-29T10:00:00Z',
        ]);
        Mockery::mock('alias:Structura\Core\License_Manager')->shouldReceive('is_licensed')->andReturn(true);
        Mockery::mock('alias:Structura\Core\Key_Manager')->shouldReceive('get_license_payload')->andReturn(['key' => 'test', 'secret' => 'test']);
        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');
        Mockery::mock('alias:Structura\Core\Cloud_Client')->shouldReceive('post')->once()
            ->with('/channelsPostPublished', Mockery::on(function ($payload) {
                return $payload['article']['metaTitle'] === 'Expanded title Site'
                    && $payload['article']['metaDescription'] === 'Expanded title Site';
            }), Mockery::any())->andReturn(['code' => 200]);
        (new Channel_Event_Forwarder())->on_structura_post_inserted([
            'post_id' => self::POST_ID, 'campaign_id' => self::CAMPAIGN_ID,
            'status' => 'publish', 'post_title' => 'Hello', 'locale' => 'en',
            'post_url' => 'https://example.com/hello', 'published_at' => '2026-09-29T10:00:00Z',
        ]);
    }

    /** Returns initial-publication and draft-approval entry points. */
    public static function publicationEntryPoints(): array
    {
        return ['initial publication' => [false], 'approved draft' => [true]];
    }

    private const POST_ID     = 42;
    private const CAMPAIGN_ID = 7;

    protected function setUp(): void
    {
        parent::setUp();

        // ── WP-side stubs the forwarder reaches for ──────────────────────────
        // The back-compat `forward_post_published()` entry rebuilds the hook
        // context from post meta + WP APIs, so every WP function on that path
        // must be stubbed here or PHPUnit sees an "undefined function" fatal.
        Functions\stubs([
            'home_url'                    => function () { return 'https://example.com'; },
            'get_permalink'               => function ($post_id) { return "https://example.com/p/$post_id"; },
            'get_the_title'               => function () { return 'Hello World'; },
            'get_post_time'               => function () { return '2026-04-14T12:00:00+00:00'; },
            'get_post_field'              => function ($field) {
                // `build_payload` reads two fields off the post: status (for
                // the publish/draft mapping) and excerpt (for the
                // social-adapt context). The base test fixture doesn't care
                // about the excerpt content; returning an empty string
                // keeps the wire payload deterministic.
                if ($field === 'post_status') return 'publish';
                if ($field === 'post_excerpt') return '';
                return '';
            },
            'get_edit_post_link'          => function ($post_id) { return "https://example.com/wp-admin/post.php?post=$post_id&action=edit"; },
            'get_locale'                  => function () { return 'en_US'; },
            // Featured-image plumbing — empty stubs are fine because no
            // current test pins a non-empty featured-image URL on the wire.
            // The shape returned by both functions matches WP core: an int
            // attachment id (0 = none) and a string URL (empty = none).
            'get_post_thumbnail_id'       => function () { return 0; },
            'wp_get_attachment_image_url' => function () { return ''; },
            // Public_Site_Profile::load() reaches for these via the back-compat
            // `forward_post_published()` path. Stubbed to neutral values so the
            // permalink helper resolves to home_url() without touching the DB.
            'get_theme_mod'               => function () { return 0; },
            'wp_get_attachment_image_url' => function () { return ''; },
            'get_site_icon_url'           => function () { return ''; },
            'get_option'                  => function () { return []; },
            'get_bloginfo'                => function () { return ''; },
        ]);
    }

    protected function tearDown(): void
    {
        // Mockery alias mocks pollute the autoloader between tests, so a
        // hard reset on Mockery's container is required.
        Mockery::close();
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  GATING — the forwarder must short-circuit before doing any work
    //  whenever any prerequisite is missing.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_skips_when_post_has_no_campaign_meta(): void
    {
        // No campaign meta → not a Structura-generated post. We re-stub
        // via `when()` rather than `expect()` because the base Unit\TestCase
        // already registered a `get_post_meta` stub in Brain Monkey's
        // FunctionStubFactory; `expect()` then skips its own Patchwork
        // redefinition (see the `$factory->has($name)` guard in
        // Brain\Monkey\Functions\expect), so the Mockery-side expectation
        // is never actually consulted. `when()->justReturn()` calls
        // `Patchwork\redefine()` directly, which DOES override the base
        // stub — and that is the only thing that matters for these tests.
        Functions\when('get_post_meta')->justReturn('');

        // License_Manager and friends should NEVER be touched once the gate
        // fails. We assert that by leaving them unmocked — any static call
        // would fatal because the underlying classes still resolve.
        $forwarder = new Channel_Event_Forwarder();
        $forwarder->forward_post_published(self::POST_ID);

        $this->assertTrue(true); // No exception thrown == pass.
    }

    /** @test */
    public function it_skips_when_site_is_unlicensed(): void
    {
        // See `it_skips_when_post_has_no_campaign_meta` for why this must
        // use `when()` rather than `expect()`.
        Functions\when('get_post_meta')->justReturn(self::CAMPAIGN_ID);

        $license_manager = Mockery::mock('alias:Structura\Core\License_Manager');
        $license_manager->shouldReceive('is_licensed')->once()->andReturn(false);

        $forwarder = new Channel_Event_Forwarder();
        $forwarder->forward_post_published(self::POST_ID);

        $this->assertTrue(true);
    }

    /** @test */
    public function it_skips_silently_when_no_activation_secret_on_file(): void
    {
        Functions\when('get_post_meta')->justReturn(self::CAMPAIGN_ID);

        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('is_licensed')->once()->andReturn(true);

        // No payload yet (e.g. license key registered but activation handshake
        // hasn't completed). Should not crash, should not call Cloud_Client.
        //
        // `get_license_payload` is called twice on this path now: once by
        // `build_payload()` and once by the warning-level diagnostic log
        // that surfaces *which* envelope field went missing (added
        // 2026-05-21 to make the silent early-return observable). Loosening
        // the count to "at least once" keeps the assertion meaningful
        // without baking in the diagnostic's exact call count.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->atLeast()
            ->once()
            ->andReturn(['key' => '', 'secret' => '']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldNotReceive('post');

        $forwarder = new Channel_Event_Forwarder();
        $forwarder->forward_post_published(self::POST_ID);

        $this->assertTrue(true);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  DISPATCH — once every gate passes, we POST a well-formed payload at
    //  the cloud endpoint and write an info-level breadcrumb to the admin
    //  Logs page.
    // ──────────────────────────────────────────────────────────────────────

    /**
     * @test
     * @dataProvider publicationEntryPoints
     */
    public function it_posts_to_the_cloud_endpoint(bool $approved_draft): void
    {
        Functions\when('get_post_meta')->justReturn(self::CAMPAIGN_ID);

        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('is_licensed')->once()->andReturn(true);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->once()
            ->andReturn([
                'key'    => 'live_xxx',
                'secret' => 'sek_yyy',
            ]);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) use ($approved_draft) {
                return $endpoint === '/channelsPostPublished'
                    && is_array($payload)
                    && ($payload['allowed_integration_ids'] ?? null) === ($approved_draft ? ['webhook-deliver'] : null)
                    && $payload['event'] === ($approved_draft ? 'article_delivery_requested' : 'post_published')
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['post_id'] === self::POST_ID
                    && $payload['campaign_id'] === self::CAMPAIGN_ID
                    && $payload['post_url'] === 'https://example.com/p/' . self::POST_ID
                    && $payload['post_title'] === 'Hello World'
                    && $payload['published_at'] === '2026-04-14T12:00:00+00:00'
                    // Forwarder is now BLOCKING with a tight timeout —
                    // `wp_remote_post` with `blocking => false` was being
                    // silently dropped on hosts whose PHP-FPM tore the
                    // worker down before the background socket flushed
                    // (cms.xerx.io 2026-05-20: zero cloud-side invocations
                    // on a hook the SPA confirmed fired). The 5s ceiling
                    // keeps us safely inside the cloud→plugin webhook's
                    // own 30s budget.
                    && ($args['blocking'] ?? null) === true
                    && ($args['timeout'] ?? null) === 25;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'eventId' => 'evt-1', 'resolvedCount' => 0],
                'raw'  => null,
            ]);

        // The forwarder writes a breadcrumb log entry before firing,
        // then a follow-up entry with the HTTP code/resolvedCount so
        // future "channels didn't fan out" triage has a verdict.
        $log = Mockery::mock('alias:Structura\Core\Log_Service');
        $log->shouldReceive('add')
            ->with(
                'info',
                Mockery::pattern('/Forwarded post event/'),
                self::CAMPAIGN_ID,
                'channels.forward',
                Mockery::on(function ($context) {
                    return is_array($context)
                        && ($context['post_id'] ?? null) === self::POST_ID;
                })
            )
            ->once();
        // Post-call verdict line — same level (`info` on 2xx) with the
        // resolved-connection count parsed out of the response body so
        // operators can spot fan-out drift without opening cloud logs.
        $log->shouldReceive('add')
            ->with(
                'info',
                Mockery::pattern('/Channels dispatcher responded/'),
                self::CAMPAIGN_ID,
                'channels.forward',
                Mockery::on(function ($context) {
                    return is_array($context)
                        && ($context['http_code'] ?? null) === 200
                        && array_key_exists('resolved_count', $context);
                })
            )
            ->once();

        $forwarder = new Channel_Event_Forwarder();
        if ($approved_draft) {
            $forwarder->deliver_approved_article(self::POST_ID);
        } else {
            $forwarder->forward_post_published(self::POST_ID);
        }

        $this->assertTrue(true);
    }

    /** @test */
    public function it_forwards_uuid_campaign_ids_verbatim_without_zeroing_them(): void
    {
        // Regression for the 2026-05-20 LinkedIn-didn't-post symptom:
        // cloud-authoritative campaigns use nanoid / UUID strings for
        // `_structura_campaign_id`, but the forwarder used to cast to
        // int — `(int)"abc-uuid"` is 0, which presents on the cloud as
        // `resolvedCount: 0` and an event the dispatcher records but
        // can never match against any `boundCampaignIds` filter.
        $uuid = 'c4f3b00d-1234-5678-9abc-def012345678';

        Functions\when('get_post_meta')->justReturn($uuid);

        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('is_licensed')->once()->andReturn(true);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->once()
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) use ($uuid) {
                return $endpoint === '/channelsPostPublished'
                    && is_array($payload)
                    && $payload['campaign_id'] === $uuid;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'eventId' => 'evt-1'],
                'raw'  => null,
            ]);

        // Two log entries land per dispatch: the pre-call breadcrumb
        // and the post-call verdict (status code + resolvedCount).
        $log = Mockery::mock('alias:Structura\Core\Log_Service');
        $log->shouldReceive('add')->twice();

        $forwarder = new Channel_Event_Forwarder();
        $forwarder->forward_post_published(self::POST_ID);

        $this->assertTrue(true);
    }
}
