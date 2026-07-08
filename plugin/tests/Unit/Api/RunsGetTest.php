<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Progress\Runs_Service_Interface;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for `Rest_Api::runs_get` — the `/runs/{run_id}` REST handler
 * that the React client polls every 1–5s for progress updates.
 *
 * The test pinned here is deliberately narrow: the **response envelope
 * shape**. The cloud returns `{ success: true, run: RunStatusSerialized }`
 * and the client (`useCampaignRunQuery` + every downstream component) is
 * typed and coded against exactly that shape — it reads `data.run.status`,
 * `data.run.runId`, etc. If this bridge unwraps the envelope, every
 * client-side accessor silently reads `undefined`; the progress strip
 * stays in its "Starting…" placeholder forever even while 200 responses
 * are flowing, and `RunDetailPage` shows an infinite loader because its
 * `!data?.run` gate never flips.
 *
 * That exact regression happened on 2026-04-22 (bare-run unwrap landed in
 * the original runs_get before the client types were fully in place).
 * This test is the tripwire: if a future "cleanup" refactor strips the
 * envelope again, PHPUnit fails here instead of us discovering it only
 * when someone clicks Generate and nothing visibly progresses.
 *
 * @covers \Structura\Api\Rest_Api::runs_get
 */
class RunsGetTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            // Pass the payload through verbatim so assertions see exactly
            // what the handler returns without a fake WP_REST_Response wrapper.
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    /** @test */
    public function it_passes_the_cloud_envelope_through_verbatim_to_the_client(): void
    {
        // Cloud response shape is { success, run: {...} } — the plugin
        // bridge must preserve the envelope unchanged. Every client
        // accessor (`data.run.runId`, `data.run.status`, ...) depends on
        // `run` being nested under `data.run`.
        $cloud_response = [
            'success' => true,
            'run'     => [
                'schemaVersion'   => 1,
                'runId'           => 'run-abc',
                'campaignId'      => 42,
                'campaignName'    => 'Weekly Digest',
                'status'          => 'running',
                'currentStep'     => 'drafting',
                'progressPercent' => 37,
                'headline'        => 'Writing the draft',
                'startedAt'       => '2026-04-22T12:00:00.000Z',
                'updatedAt'       => '2026-04-22T12:00:30.000Z',
                'stepDurationsMs' => [],
            ],
        ];

        $runs_mock = Mockery::mock(Runs_Service_Interface::class);
        $runs_mock->shouldReceive('get_run')
            ->once()
            ->with('run-abc')
            ->andReturn($cloud_response);

        $rest = new Rest_Api();
        $rest->set_runs_service($runs_mock);

        $response = $rest->runs_get($this->make_request('run-abc'));

        $this->assertIsArray($response);

        // The envelope — this is the guardrail. If someone refactors to
        // `rest_ensure_response($result['run'])`, this assertion fails
        // and points at the broken contract before prod traffic hits it.
        $this->assertTrue(
            $response['success'] ?? false,
            'Bridge must preserve the cloud `success` key — client types depend on `data.success`.'
        );
        $this->assertIsArray(
            $response['run'] ?? null,
            'Bridge must preserve the nested `run` field — every client callsite reads through `data.run.*`.'
        );

        // The run payload is passed through byte-for-byte (the bridge is
        // not a translation layer — any per-field remapping belongs in
        // the cloud's `toWireRun` serializer, not here).
        $this->assertSame('run-abc', $response['run']['runId']);
        $this->assertSame('running', $response['run']['status']);
        $this->assertSame(37, $response['run']['progressPercent']);
    }

    /** @test */
    public function it_memoizes_per_request_so_re_render_storms_only_cost_one_cloud_hop(): void
    {
        // The drawer re-renders several times per second in the first
        // milestone transitions; the static memo keeps that from turning
        // into N identical cloud round-trips per page-load.
        $cloud_response = [
            'success' => true,
            'run'     => [
                'runId'  => 'run-memo',
                'status' => 'running',
            ],
        ];

        $runs_mock = Mockery::mock(Runs_Service_Interface::class);
        // The whole point of the test — `get_run` must be called exactly
        // once even though runs_get is called twice for the same runId.
        $runs_mock->shouldReceive('get_run')
            ->once()
            ->with('run-memo')
            ->andReturn($cloud_response);

        $rest = new Rest_Api();
        $rest->set_runs_service($runs_mock);

        $first  = $rest->runs_get($this->make_request('run-memo'));
        $second = $rest->runs_get($this->make_request('run-memo'));

        $this->assertSame($first, $second);
    }

    /** @test */
    public function it_surfaces_a_wp_error_on_missing_run_id(): void
    {
        // No cloud call on the validation path — a malformed poll must
        // short-circuit at the router rather than burning a round-trip.
        $runs_mock = Mockery::mock(Runs_Service_Interface::class);
        $runs_mock->shouldNotReceive('get_run');

        $rest = new Rest_Api();
        $rest->set_runs_service($runs_mock);

        $result = $rest->runs_get($this->make_request(''));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('runs_missing_param', $result->get_error_code());
    }

    /** @test */
    public function it_propagates_cloud_wp_error_without_memoizing(): void
    {
        // Transient cloud failures must NOT poison the memo — the next
        // poll tick (1s later) should retry freshly. If we cache errors
        // the drawer would show a stale 404 for the entire pageload
        // even after the run doc is primed.
        $runs_mock = Mockery::mock(Runs_Service_Interface::class);
        $runs_mock->shouldReceive('get_run')
            // Exactly twice — two polls, two independent cloud calls.
            ->twice()
            ->with('run-flap')
            ->andReturn(new \WP_Error('run_not_found', 'run_not_found', ['status' => 404]));

        $rest = new Rest_Api();
        $rest->set_runs_service($runs_mock);

        $first  = $rest->runs_get($this->make_request('run-flap'));
        $second = $rest->runs_get($this->make_request('run-flap'));

        $this->assertInstanceOf(\WP_Error::class, $first);
        $this->assertInstanceOf(\WP_Error::class, $second);
        $this->assertSame('run_not_found', $first->get_error_code());
    }

    /**
     * Mimics `$request->get_param('run_id')` against the real
     * `WP_REST_Request` signature — just enough to drive runs_get.
     */
    private function make_request(string $run_id): object
    {
        // PHP 7.4-compatible — no constructor property promotion (the
        // CI matrix still tests 7.4 and parses promoted params as a
        // syntax error).
        return new class($run_id) {
            /** @var string */
            private $run_id;

            public function __construct(string $run_id)
            {
                $this->run_id = $run_id;
            }

            public function get_param(string $key)
            {
                return $key === 'run_id' ? $this->run_id : null;
            }
        };
    }
}
