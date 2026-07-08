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

    /** @test */
    public function it_posts_to_the_cloud_endpoint(): void
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
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsPostPublished'
                    && is_array($payload)
                    && $payload['event'] === 'post_published'
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
        $forwarder->forward_post_published(self::POST_ID);

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
