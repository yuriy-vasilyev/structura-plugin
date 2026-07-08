<?php

namespace Structura\Tests\Unit\Progress;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Progress\Runs_Service;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Runs_Service (progress-stream WP→Cloud proxy).
 *
 * The shape mirrors ChannelsEventsServiceTest — same auth envelope, same
 * transport contract, same log-on-error path. The progress-specific
 * surface to pin is:
 *
 *   - `run_id` is trimmed + required before any cloud call is made (so we
 *     don't waste a round-trip on garbage input).
 *   - Cloud 404 responses preserve the underlying error code (today only
 *     `run_not_found`) on the returned WP_Error so the REST handler can
 *     branch on them.
 *   - 404 responses are NOT logged as errors — they're steady-state
 *     outcomes (TTL, cross-activation polls).
 *
 * @covers \Structura\Progress\Runs_Service
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class RunsServiceTest extends TestCase
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
    public function it_returns_wp_error_when_run_id_is_empty(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->never();

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Runs_Service();

        $result = $service->get_run('   '); // trimmed to empty

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('runs_missing_param', $result->get_error_code());
    }

    /** @test */
    public function it_returns_wp_error_when_activation_payload_is_missing(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(null);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Runs_Service();
        $result  = $service->get_run('run-uuid-1');

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('runs_no_activation', $result->get_error_code());
    }

    /** @test */
    public function get_run_proceeds_when_license_key_is_empty_for_anonymous_install(): void
    {
        // Phase 1.8 PR8 regression guard. Anonymous shadow workspaces
        // (the install completed `bootstrapAnonymousInstall` but has
        // no licenseKey) must be able to poll their own runs. The
        // pre-PR8 envelope check rejected on `license_key === ''`,
        // which surfaced as the SPA's "Run not found" placeholder
        // flickering on a successfully-completed run because every
        // poll 403'd at the plugin proxy before reaching the cloud.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([
                // No `key` — this install never ran the license claim
                // flow. `secret` and `api_token` are present from the
                // anonymous bootstrap response.
                'secret'        => 'sek_anon',
                'api_token'     => 'tok_anon',
                'activation_id' => 'act-uuid-9',
            ]);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                // The envelope still ships `license_key` (empty string)
                // for shape stability — the cloud's bearer middleware
                // ignores it and reads identity from the Authorization
                // header that Cloud_Client::post auto-injects.
                return $endpoint === '/getCampaignRun'
                    && $payload['license_key'] === ''
                    && $payload['activation_secret'] === 'sek_anon'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['run_id'] === 'run-uuid-anon';
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'run' => ['runId' => 'run-uuid-anon']],
                'raw'  => null,
            ]);

        $service = new Runs_Service();
        $result  = $service->get_run('run-uuid-anon');

        $this->assertSame(['success' => true, 'run' => ['runId' => 'run-uuid-anon']], $result);
    }

    /** @test */
    public function get_run_sends_full_auth_envelope_plus_run_id(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = [
            'success' => true,
            'run'     => [
                'schemaVersion'   => 1,
                'runId'           => 'run-uuid-1',
                'status'          => 'running',
                'currentStep'     => 'drafting',
                'progressPercent' => 55,
                'startedAt'       => '2026-04-22T10:00:00.000Z',
                'updatedAt'       => '2026-04-22T10:01:00.000Z',
            ],
        ];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/getCampaignRun'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['run_id'] === 'run-uuid-1'
                    && ($args['timeout'] ?? null) === 15;
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Runs_Service();

        $this->assertSame($cloud_body, $service->get_run('  run-uuid-1  '));
    }

    /** @test */
    public function it_preserves_cloud_404_error_code_for_run_not_found(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // A 404 from the cloud must NOT get logged as an error — it's a
        // steady-state "doc TTL'd or never existed" response. The test
        // asserts Log_Service::add is never called for this case.
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldNotReceive('add');

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn([
            'code' => 404,
            'body' => ['success' => false, 'error' => 'run_not_found'],
            'raw'  => null,
        ]);

        $service = new Runs_Service();
        $result  = $service->get_run('run-uuid-ghost');

        $this->assertInstanceOf(\WP_Error::class, $result);
        // Cloud code is forwarded verbatim so the REST handler can branch
        // on `run_not_found` without parsing a message.
        $this->assertSame('run_not_found', $result->get_error_code());
        $data = $result->get_error_data();
        $this->assertSame(404, $data['status'] ?? null);
    }

    /** @test */
    public function it_logs_and_returns_wp_error_on_non_404_cloud_rejection(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // 403 (security check failed, activation secret rotated) IS a
        // hard failure worth logging — something is actually wrong.
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once();

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn([
            'code' => 403,
            'body' => ['success' => false, 'error' => 'Security check failed.'],
            'raw'  => null,
        ]);

        $service = new Runs_Service();
        $result  = $service->get_run('run-uuid-1');

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('runs_cloud_error', $result->get_error_code());
        $this->assertSame('Security check failed.', $result->get_error_message());
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

        // Transport failures are info-level (polling every 2s can generate
        // a lot of transient network noise), not error — that's the whole
        // point of the info severity choice in the production class.
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once()
            ->withArgs(function ($level) { return $level === 'info'; });

        $service = new Runs_Service();
        $result  = $service->get_run('run-uuid-1');

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('http_request_failed', $result->get_error_code());
    }

    // ──────────────────────────────────────────────────────────────────
    //  list_runs_for_campaign — powers the Campaign detail "Runs" tab.
    //  Shares the auth envelope + transport with get_run, so tests here
    //  focus on the bits that are *specific* to this method: the
    //  campaign_id validation, the limit clamp, and that the endpoint
    //  the payload lands on is `/listRunsForCampaign` (not `/listRuns`,
    //  which is the Needs-Attention widget's narrower endpoint).
    // ──────────────────────────────────────────────────────────────────

    /** @test */
    public function list_runs_for_campaign_rejects_zero_campaign_id_before_any_cloud_call(): void
    {
        // A 0 campaign id is always a caller bug (WordPress post ids are
        // always positive). Reject before building the auth envelope or
        // touching the network — matches the defensive shape of get_run.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->never();
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Runs_Service();
        $result  = $service->list_runs_for_campaign(0);

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('runs_missing_param', $result->get_error_code());
        $this->assertSame(400, $result->get_error_data()['status'] ?? null);
    }

    /** @test */
    public function list_runs_for_campaign_rejects_negative_campaign_id(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->never();
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Runs_Service();
        $result  = $service->list_runs_for_campaign(-5);

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('runs_missing_param', $result->get_error_code());
    }

    /** @test */
    public function list_runs_for_campaign_posts_to_list_endpoint_with_envelope_and_payload(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = [
            'success' => true,
            'runs'    => [
                [
                    'schemaVersion' => 1,
                    'runId'         => 'run-past',
                    'campaignId'    => 42,
                    'status'        => 'succeeded',
                    'startedAt'     => '2026-04-21T09:00:00.000Z',
                    'updatedAt'     => '2026-04-21T09:02:00.000Z',
                    'endedAt'       => '2026-04-21T09:02:00.000Z',
                ],
            ],
        ];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                // Endpoint MUST be the campaign-scoped one — not the
                // Needs-Attention widget's `/listRuns`, which has a
                // different filter contract server-side.
                return $endpoint === '/listRunsForCampaign'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['campaign_id'] === 42
                    && $payload['limit'] === 20
                    && ($args['timeout'] ?? null) === 15;
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Runs_Service();
        $result  = $service->list_runs_for_campaign(42);

        $this->assertSame($cloud_body, $result);
    }

    /** @test */
    public function list_runs_for_campaign_clamps_oversized_limit_to_50(): void
    {
        // Client-side clamp keeps the wire payload tidy; the cloud
        // enforces 1..50 independently. A caller asking for 999 rows
        // should land at 50 in the payload, not trigger a cloud 400.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/listRunsForCampaign'
                    && $payload['limit'] === 50;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'runs' => []],
                'raw'  => null,
            ]);

        $service = new Runs_Service();
        $service->list_runs_for_campaign(42, 999);
    }

    /** @test */
    public function list_runs_for_campaign_clamps_zero_or_negative_limit_to_1(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                // 0 (or negative) must not reach the cloud as-is —
                // Firestore's `limit(0)` returns nothing so the tab
                // would show an empty state even with runs present.
                return $payload['limit'] === 1;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'runs' => []],
                'raw'  => null,
            ]);

        $service = new Runs_Service();
        $service->list_runs_for_campaign(42, 0);
    }

    // ──────────────────────────────────────────────────────────────────
    //  list_active_runs — powers the SPA refresh-recovery path. Pins:
    //
    //  1. The endpoint is `/listActiveRuns` (not `/listRuns`, which is
    //     the Needs-Attention contract — wrong endpoint would return
    //     a mix of unrelated problem-status rows).
    //  2. The auth envelope travels intact (license_key +
    //     activation_secret + site_url from Key_Manager).
    //  3. Limit defaults to 10 and is clamped to 1..10 client-side.
    //  4. No per-campaign parameter — the whole point of this endpoint
    //     is "in-flight across every campaign for this site".
    //
    // ──────────────────────────────────────────────────────────────────

    /** @test */
    public function list_active_runs_posts_to_active_endpoint_with_envelope(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = [
            'success' => true,
            'runs'    => [
                [
                    'schemaVersion' => 1,
                    'runId'         => 'run-live',
                    'campaignId'    => 42,
                    'status'        => 'running',
                    'startedAt'     => '2026-04-23T11:00:00.000Z',
                    'updatedAt'     => '2026-04-23T11:00:30.000Z',
                ],
            ],
        ];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                // Endpoint MUST be the dedicated active-runs one. A
                // silent drift to `/listRuns` would return stale
                // failed/ack rows and break the SPA's rehydration —
                // this assertion is the tripwire.
                return $endpoint === '/listActiveRuns'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    && $payload['limit'] === 10
                    && ! array_key_exists('campaign_id', $payload)
                    && ($args['timeout'] ?? null) === 15;
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Runs_Service();
        $result  = $service->list_active_runs();

        $this->assertSame($cloud_body, $result);
    }

    /** @test */
    public function list_active_runs_clamps_oversized_limit_to_10(): void
    {
        // Ceiling differs from list_runs_for_campaign (50) — no UI
        // surface needs more than 10 in-flight rows.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/listActiveRuns'
                    && $payload['limit'] === 10;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'runs' => []],
                'raw'  => null,
            ]);

        $service = new Runs_Service();
        $service->list_active_runs(999);
    }

    /** @test */
    public function list_active_runs_clamps_zero_or_negative_limit_to_1(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $payload['limit'] === 1;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'runs' => []],
                'raw'  => null,
            ]);

        $service = new Runs_Service();
        $service->list_active_runs(0);
    }
}
