<?php

namespace Structura\Tests\Unit\Channels;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Channels\Channels_Events_Service;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Channels_Events_Service.
 *
 * Mirrors the connections-service test file's shape — this service is a
 * thinner proxy (only list), so assertions focus on:
 *   - Auth envelope shape (license_key + activation_secret + site_url).
 *   - Limit default/clamp happening locally before hitting the cloud (so a
 *     junk value doesn't round-trip).
 *   - Transport / non-2xx / `success: false` all surface as WP_Error.
 *
 * @covers \Structura\Channels\Channels_Events_Service
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ChannelsEventsServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'home_url' => function () { return 'https://example.com'; },
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_returns_wp_error_when_activation_payload_is_missing(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(null);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Channels_Events_Service();

        $result = $service->list_events();

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('channels_no_activation', $result->get_error_code());
    }

    /** @test */
    public function list_events_sends_full_auth_envelope_plus_limit(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = [
            'success' => true,
            'events'  => [
                [
                    'id'        => 'evt-1',
                    'type'      => 'post_published',
                    'postId'    => 42,
                    'postTitle' => 'Hello',
                ],
            ],
        ];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsListEvents'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['limit'] === 50
                    && ($args['timeout'] ?? null) === 15;
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Channels_Events_Service();

        $this->assertSame($cloud_body, $service->list_events(50));
    }

    /** @test */
    public function list_events_defaults_a_nonpositive_limit_locally(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // A zero / negative limit must be normalized to 25 before the cloud
        // call — we'd rather not waste a round-trip on input we know is bad.
        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $payload['limit'] === 25;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'events' => []], 'raw' => null]);

        (new Channels_Events_Service())->list_events(0);
    }

    /** @test */
    public function it_propagates_transport_wp_error_from_cloud_client(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $transport_error = new \WP_Error('http_request_failed', 'connection refused');

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn($transport_error);

        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once();

        $service = new Channels_Events_Service();
        $result  = $service->list_events();

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('http_request_failed', $result->get_error_code());
    }

    // ──────────────────────────────────────────────────────────────────────
    //  VIDEO RETRY — proxies cloud `channelsVideoRetry` for the Activity
    //  page's "Retry render" / "Regenerate" actions (video channel).
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function retry_video_sends_full_auth_envelope_plus_job_id(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = ['success' => true, 'jobId' => 'job-42'];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsVideoRetry'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['job_id'] === 'job-42'
                    && ($args['timeout'] ?? null) === 15;
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Channels_Events_Service();

        $this->assertSame($cloud_body, $service->retry_video('job-42'));
    }

    /** @test */
    public function retry_video_rejects_an_empty_job_id_without_a_cloud_round_trip(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Channels_Events_Service();
        $result  = $service->retry_video('');

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('channels_invalid_input', $result->get_error_code());
    }

    /** @test */
    public function retry_video_surfaces_the_cloud_error_message(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // e.g. the job doc is gone or the quota check failed — the exact
        // cloud reason must reach the UI so the toast is actionable.
        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn([
            'code' => 404,
            'body' => ['success' => false, 'error' => 'Video job not found.'],
            'raw'  => null,
        ]);

        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once();

        $service = new Channels_Events_Service();
        $result  = $service->retry_video('job-gone');

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('channels_cloud_error', $result->get_error_code());
        $this->assertSame('Video job not found.', $result->get_error_message());
    }

    /** @test */
    public function it_returns_wp_error_when_cloud_responds_with_non_success_body(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // A 403 from the cloud (e.g. activation secret rotated) should reach
        // the UI with the cloud's own message so the user sees an actionable
        // reason rather than a generic "request failed."
        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn([
            'code' => 403,
            'body' => ['success' => false, 'error' => 'Security check failed.'],
            'raw'  => null,
        ]);

        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once();

        $service = new Channels_Events_Service();
        $result  = $service->list_events();

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('channels_cloud_error', $result->get_error_code());
        $this->assertSame('Security check failed.', $result->get_error_message());
    }
}
