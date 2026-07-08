<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Site_Reachability;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Site_Reachability — the cloud → plugin handshake probe
 * that powers the "Structura Cloud can't reach this site" banners.
 *
 * What we pin (the behaviour users notice when it drifts):
 *
 *   - A `body.success === false` verdict (the localhost / firewalled
 *     case) caches `ok = false` so the banner fires.
 *   - A `body.success === true` verdict caches `ok = true`.
 *   - An outbound WP_Error (WE can't reach the cloud — a different fault)
 *     leaves the cached verdict UNTOUCHED rather than crying wolf.
 *   - No license → no probe, and any stale verdict is cleared.
 *   - `is_unreachable()` treats an un-probed site as reachable (unknown
 *     ≠ broken) and only returns true on an explicit `ok = false`.
 *
 * @covers \Structura\Core\Site_Reachability
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SiteReachabilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'get_site_url' => 'https://example.com',
            'rest_url'     => function ($path = '') {
                return 'https://example.com/wp-json/' . ltrim((string) $path, '/');
            },
            // `time()` is a native function patchwork can't redefine here,
            // so we let it run for real and only assert the cached
            // `checked_at` is an int (see the probe tests below).
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function probe_caches_unreachable_when_the_cloud_cannot_post_back(): void
    {
        // The localhost / firewalled case: our egress to the cloud works
        // (no WP_Error), but the cloud's POST back to our webhook failed,
        // so the cloud reports success:false.
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'KEY-ABC']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/performPulseCheck', Mockery::type('array'), Mockery::any())
            ->andReturn(['code' => 200, 'body' => ['success' => false, 'message' => 'getaddrinfo ENOTFOUND']]);

        $captured = null;
        $this->expectFn('update_option')
            ->once()
            ->with(
                Site_Reachability::OPTION,
                Mockery::on(function ($value) use (&$captured) {
                    $captured = $value;
                    return true;
                }),
                false
            );

        $state = Site_Reachability::probe_and_store();

        $this->assertFalse($state['ok']);
        $this->assertFalse($captured['ok']);
        $this->assertIsInt($captured['checked_at']);
        $this->assertSame('getaddrinfo ENOTFOUND', $captured['message']);
    }

    /** @test */
    public function probe_caches_reachable_when_the_handshake_succeeds(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'KEY-ABC']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'message' => 'Pulse verified!']]);

        $captured = null;
        $this->expectFn('update_option')
            ->once()
            ->with(
                Site_Reachability::OPTION,
                Mockery::on(function ($value) use (&$captured) {
                    $captured = $value;
                    return true;
                }),
                false
            );

        $state = Site_Reachability::probe_and_store();

        $this->assertTrue($state['ok']);
        $this->assertTrue($captured['ok']);
    }

    /** @test */
    public function probe_leaves_cache_untouched_on_outbound_cloud_failure(): void
    {
        // A WP_Error means OUR request to the cloud failed — that says
        // nothing about whether the cloud can reach us, so we must not
        // flip the banner. No update_option, no delete_option.
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'KEY-ABC']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(new \WP_Error('http_request_failed', 'cURL error 28: timed out'));

        $this->expectFn('update_option')->never();
        $this->expectFn('delete_option')->never();

        $state = Site_Reachability::probe_and_store();

        $this->assertTrue($state['ok']);
        $this->assertSame('cloud_unreachable_outbound', $state['reason']);
    }

    /** @test */
    public function probe_is_a_noop_and_clears_stale_state_without_a_license(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn([]);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->never();

        $this->expectFn('delete_option')
            ->once()
            ->with(Site_Reachability::OPTION);

        $state = Site_Reachability::probe_and_store();

        $this->assertTrue($state['ok']);
        $this->assertSame('no_license', $state['reason']);
    }

    /** @test */
    public function is_unreachable_is_false_when_never_probed(): void
    {
        // Base TestCase stubs get_option to return its default (false),
        // i.e. the option doesn't exist yet. Unknown must not warn.
        $this->assertFalse(Site_Reachability::is_unreachable());
    }

    /** @test */
    public function is_unreachable_reflects_the_cached_verdict(): void
    {
        $this->expectFn('get_option')
            ->with(Site_Reachability::OPTION)
            ->andReturn(['ok' => false, 'checked_at' => 1, 'message' => 'x']);

        $this->assertTrue(Site_Reachability::is_unreachable());
    }

    /** @test */
    public function is_unreachable_is_false_when_cached_ok(): void
    {
        $this->expectFn('get_option')
            ->with(Site_Reachability::OPTION)
            ->andReturn(['ok' => true, 'checked_at' => 1, 'message' => '']);

        $this->assertFalse(Site_Reachability::is_unreachable());
    }
}
