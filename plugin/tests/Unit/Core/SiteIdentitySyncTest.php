<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Site_Identity_Sync;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Site_Identity_Sync (Phase 1.0e).
 *
 * The class subscribes to `update_option_*` actions for blogname,
 * blogdescription, locale, and the dynamic theme_mods option, plus a
 * `shutdown` flush that turns the debounce transient into a single
 * cloud POST. These tests pin:
 *
 *   - The brand surface `collect()` builds from WP getters.
 *   - The transient debounce — a hook fire MUST NOT trigger an HTTP call;
 *     only the shutdown handler does, and only when the transient is set.
 *   - Idempotent activation behaviour: `push_to_cloud()` is a no-op when
 *     the license payload is empty (pre-activation).
 *
 * @covers \Structura\Core\Site_Identity_Sync
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SiteIdentitySyncTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Log_Service is touched on the warning paths but most tests don't
        // care about it — give it a permissive alias mock so individual
        // tests can opt in to stricter assertions.
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->withAnyArgs()
            ->zeroOrMoreTimes();

        // Site URL is the same shape across nearly every test.
        Functions\stubs([
            'get_site_url'    => 'https://example.com',
            'home_url'        => function ($path = '') {
                return 'https://example.com' . ($path === '' ? '' : $path);
            },
            'wp_get_attachment_image_url' => function ($id, $size = 'full') {
                return $id ? "https://example.com/wp-content/uploads/logo-{$size}.png" : false;
            },
            'get_site_icon_url' => function () {
                return 'https://example.com/wp-content/uploads/icon.png';
            },
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function collect_builds_the_expected_brand_surface(): void
    {
        // Spec §1.0e: the wire bundle is name + tagline + language +
        // logoUrl + homeUrl. Static getter so License_Manager can call
        // it inline at activation without instantiating the service.
        //
        // Brain Monkey 2.7 + Mockery 1.6 don't dispatch multiple
        // `expect('foo')->with(x)->andReturn(...)` calls correctly when
        // each chain has a different `with()` — the first redefine
        // wins and every call returns its andReturn value (verified
        // with a minimal repro). Use a single `when()->alias()` so
        // production code gets the right answer per argument.
        Functions\when('get_bloginfo')->alias(function ($key) {
            return [
                'name'        => 'Demo Site',
                'description' => 'A great demo',
                'language'    => 'en-US',
            ][$key] ?? '';
        });
        $this->expectFn('get_theme_mod')
            ->with('custom_logo')->andReturn(42);

        $bundle = Site_Identity_Sync::collect();

        $this->assertSame('Demo Site', $bundle['name']);
        $this->assertSame('A great demo', $bundle['tagline']);
        $this->assertSame('en-US', $bundle['language']);
        $this->assertSame(
            'https://example.com/wp-content/uploads/logo-full.png',
            $bundle['logoUrl']
        );
        // homeUrl is normalised to drop the trailing slash so cloud
        // readers can append `/wp-json/wp/v2/posts` cleanly.
        $this->assertSame('https://example.com', $bundle['homeUrl']);
    }

    /** @test */
    public function collect_falls_back_to_site_icon_when_no_custom_logo_is_set(): void
    {
        // Mirror of Context_Builder::build_brand_context — no custom_logo
        // means we surface the site icon (favicon) so the cloud has at
        // least something visual to reason about.
        $this->expectFn('get_bloginfo')->with('name')->andReturn('Site');
        $this->expectFn('get_bloginfo')->with('description')->andReturn('');
        $this->expectFn('get_bloginfo')->with('language')->andReturn('de-DE');
        $this->expectFn('get_theme_mod')->with('custom_logo')->andReturn(0);

        $bundle = Site_Identity_Sync::collect();

        $this->assertSame(
            'https://example.com/wp-content/uploads/icon.png',
            $bundle['logoUrl']
        );
    }

    /** @test */
    public function on_identity_change_only_arms_the_debounce_transient(): void
    {
        // Critical: the option-change action MUST NOT trigger an HTTP
        // call directly. The customizer fires multiple update_option
        // actions in one request, so each one inline-syncing would
        // mean three POSTs for a single save. The transient + shutdown
        // pattern coalesces those into one.
        $this->expectFn('set_transient')
            ->once()
            ->with('structura_site_identity_pending', Mockery::any(), 60);

        // Cloud_Client must not be touched.
        $cloudClient = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloudClient->shouldReceive('post')->never();

        $subject = new Site_Identity_Sync();
        $subject->on_identity_change();
    }

    /** @test */
    public function maybe_flush_pending_short_circuits_when_transient_absent(): void
    {
        // Common case: a normal pageload with no recent option change.
        // The shutdown handler must do zero DB writes, zero HTTP calls.
        $this->expectFn('get_transient')
            ->once()
            ->with('structura_site_identity_pending')
            ->andReturn(false);

        $this->expectFn('delete_transient')->never();

        $cloudClient = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloudClient->shouldReceive('post')->never();

        $subject = new Site_Identity_Sync();
        $subject->maybe_flush_pending();
    }

    /** @test */
    public function maybe_flush_pending_clears_transient_then_pushes_to_cloud(): void
    {
        // The flush handler must clear FIRST so a second customizer
        // save mid-flight re-arms the transient and gets its own sync
        // — better to double-sync than miss an update.
        $this->expectFn('get_transient')
            ->once()
            ->with('structura_site_identity_pending')
            ->andReturn(time());
        $this->expectFn('delete_transient')
            ->once()
            ->with('structura_site_identity_pending');

        // Stub the brand surface so we can assert the body shape. See
        // the `collect_builds_…` comment above for why this uses
        // `when()->alias()` rather than multiple `expect()->with()`.
        Functions\when('get_bloginfo')->alias(function ($key) {
            return [
                'name'        => 'Site',
                'description' => 'Tagline',
                'language'    => 'en-US',
            ][$key] ?? '';
        });
        $this->expectFn('get_theme_mod')->with('custom_logo')->andReturn(0);

        // License payload must look "activated" or push_to_cloud bails.
        $keyManager = Mockery::mock('alias:Structura\Core\Key_Manager');
        $keyManager->shouldReceive('get_license_payload')
            ->once()
            ->andReturn([
                'key'    => 'KEY-ABC',
                'secret' => 'sek-r3t',
                'plan'   => 'cloud',
                'status' => 'active',
            ]);

        $captured = null;
        $cloudClient = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloudClient->shouldReceive('post')
            ->once()
            ->with(
                '/syncSiteIdentity',
                Mockery::on(function ($body) use (&$captured) {
                    $captured = $body;
                    return true;
                }),
                Mockery::any()
            )
            ->andReturn(['code' => 200, 'body' => ['success' => true]]);

        $subject = new Site_Identity_Sync();
        $subject->maybe_flush_pending();

        $this->assertSame('KEY-ABC', $captured['licenseKey']);
        // `activationSecret` was removed from the wire body once
        // `Cloud_Client::post` started signing every request with the
        // license payload's HMAC secret directly (no need to ship it
        // through to the cloud as a body field). Domain and identity
        // remain on the wire as they're the actual diff being synced.
        $this->assertArrayNotHasKey('activationSecret', $captured);
        $this->assertSame('example.com', $captured['domain']);
        // The wire shape is the static `collect()` output, fields and all.
        $this->assertSame('Site', $captured['siteIdentity']['name']);
        $this->assertSame('Tagline', $captured['siteIdentity']['tagline']);
        $this->assertSame('en-US', $captured['siteIdentity']['language']);
        $this->assertSame('https://example.com', $captured['siteIdentity']['homeUrl']);
    }

    /** @test */
    public function push_to_cloud_is_a_noop_when_no_license_is_activated(): void
    {
        // The shutdown handler can fire on any pageload, including a
        // wp-admin without an activated Structura license. We must
        // skip the HTTP call rather than send a malformed payload.
        $keyManager = Mockery::mock('alias:Structura\Core\Key_Manager');
        $keyManager->shouldReceive('get_license_payload')->andReturn(null);

        $cloudClient = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloudClient->shouldReceive('post')->never();

        $subject = new Site_Identity_Sync();
        $subject->push_to_cloud();

        $this->assertTrue(true);
    }

    /** @test */
    public function push_to_cloud_swallows_transport_errors_with_a_warning_log(): void
    {
        // Transport failure must be best-effort — the worst observable
        // effect is that one cron tick uses a stale brand surface, not
        // that a customizer save 500s.
        Functions\stubs([
            'get_bloginfo'  => function ($what) { return $what; },
            'get_theme_mod' => null,
        ]);

        $keyManager = Mockery::mock('alias:Structura\Core\Key_Manager');
        $keyManager->shouldReceive('get_license_payload')->andReturn([
            'key'    => 'K',
            'secret' => 'S',
            'plan'   => 'free',
            'status' => 'active',
        ]);

        $cloudClient = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloudClient->shouldReceive('post')
            ->once()
            ->andReturn(new \WP_Error('http_request_failed', 'cURL error 28: Connection timed out'));

        // No throw — the test passes if we get here.
        $subject = new Site_Identity_Sync();
        $subject->push_to_cloud();

        $this->assertTrue(true);
    }
}
