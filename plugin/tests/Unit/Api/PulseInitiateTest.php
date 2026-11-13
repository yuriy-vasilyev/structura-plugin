<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The manual "Run Pulse Check" button (`/pulse/initiate`).
 *
 * 2026-11-13: when the cloud answers without a verdict (its own 401, 403 or
 * 5xx), the probe no longer caches "unreachable". The button must not turn
 * that into a green "handshake verified" either: the check did not run.
 *
 * The real Site_Reachability runs; License_Manager (stored license) and
 * Cloud_Client (network) are the edges.
 *
 * @covers \Structura\Api\Rest_Api::handle_pulse_initiate
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PulseInitiateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            'get_site_url'         => 'https://example.com',
            'rest_url'             => function ($path = '') {
                return 'https://example.com/wp-json/' . ltrim((string) $path, '/');
            },
        ]);

        $lm = Mockery::mock('alias:Structura\Core\License_Manager');
        $lm->shouldReceive('has_workspace')->andReturn(true);
        $lm->shouldReceive('get_license_data')->andReturn(['license_key' => 'KEY-ABC']);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function a_check_the_cloud_could_not_run_is_reported_as_failed(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(['code' => 401, 'body' => ['success' => false, 'error' => 'Unauthorized.'], 'raw' => null]);

        $this->expectFn('update_option')->never();

        $response = (new Rest_Api())->handle_pulse_initiate(null);

        $this->assertSame(['success' => false, 'message' => ''], $response);
    }

    /** @test */
    public function a_cloud_verdict_still_reaches_the_button(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(['code' => 200, 'body' => ['success' => false, 'message' => 'Forbidden'], 'raw' => null]);

        $response = (new Rest_Api())->handle_pulse_initiate(null);

        $this->assertSame(['success' => false, 'message' => 'Forbidden'], $response);
    }
}
