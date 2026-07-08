<?php

namespace Structura\Tests\Unit\Scheduler;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Scheduler\Cloud_Cadence_Sync;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the periodic cloud → AS reconciler (Phase 1.0c §3).
 *
 * The behaviour under test splits into two layers:
 *
 *   1. **Pure logic** — `compute_desired_state()`, `load_state()`,
 *      `save_state()`. Brain Monkey makes these straightforward to pin
 *      because they touch only `get_option` / `update_option`.
 *
 *   2. **Reconcile loop** — `sync()`. We can't invoke `sync_pulse` /
 *      `stop_pulse` on the real Action_Scheduler_Service from a unit test
 *      (they call AS internals), so we mock those statics via Mockery
 *      alias mocking — same pattern as TaskRunnerTest's
 *      Action_Scheduler_Service interactions.
 *
 * @covers \Structura\Scheduler\Cloud_Cadence_Sync
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class CloudCadenceSyncTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Log_Service hits the global $wpdb directly, which is null
        // under the Brain-Monkey unit bootstrap. A permissive alias
        // mock lets every code path that emits an info/warning log
        // proceed without each test having to stub wpdb itself. Tests
        // that care about specific log messages can re-mock locally.
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->withAnyArgs()
            ->zeroOrMoreTimes();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  compute_desired_state — pure reduction of /listCampaigns payload
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function compute_desired_state_returns_active_campaigns_with_cron(): void
    {
        $campaigns = [
            ['campaignId' => 'a', 'cronSchedule' => '0 9 * * 1', 'status' => 'active'],
            ['campaignId' => 'b', 'cronSchedule' => '*/30 * * * *', 'status' => 'active'],
        ];

        $this->assertSame(
            ['a' => '0 9 * * 1', 'b' => '*/30 * * * *'],
            Cloud_Cadence_Sync::compute_desired_state($campaigns)
        );
    }

    /** @test */
    public function compute_desired_state_drops_paused_campaigns(): void
    {
        // Paused campaigns must NOT be in desired state — they get a
        // stop_pulse via the diff in sync(). A regression here would let
        // paused campaigns keep firing forever after pausing in the SPA.
        $campaigns = [
            ['campaignId' => 'a', 'cronSchedule' => '0 9 * * 1', 'status' => 'active'],
            ['campaignId' => 'b', 'cronSchedule' => '0 9 * * 1', 'status' => 'paused'],
        ];

        $this->assertSame(
            ['a' => '0 9 * * 1'],
            Cloud_Cadence_Sync::compute_desired_state($campaigns)
        );
    }

    /** @test */
    public function compute_desired_state_drops_campaigns_without_cron(): void
    {
        // A campaign with empty cron has nothing to fire — treat as paused.
        $campaigns = [
            ['campaignId' => 'a', 'cronSchedule' => '', 'status' => 'active'],
            ['campaignId' => 'b', 'cronSchedule' => '0 12 * * *', 'status' => 'active'],
        ];

        $this->assertSame(
            ['b' => '0 12 * * *'],
            Cloud_Cadence_Sync::compute_desired_state($campaigns)
        );
    }

    /** @test */
    public function compute_desired_state_skips_malformed_entries(): void
    {
        // Defensive: a non-array entry, missing fields, or non-string id
        // must be skipped rather than crashing the reconcile.
        $campaigns = [
            'not-an-array',
            ['campaignId' => 123, 'cronSchedule' => '0 9 * * 1', 'status' => 'active'], // numeric id
            ['cronSchedule' => '0 9 * * 1', 'status' => 'active'], // no id
            ['campaignId' => 'good', 'cronSchedule' => '0 9 * * 1', 'status' => 'active'],
        ];

        $this->assertSame(
            ['good' => '0 9 * * 1'],
            Cloud_Cadence_Sync::compute_desired_state($campaigns)
        );
    }

    /** @test */
    public function compute_desired_state_returns_empty_for_empty_input(): void
    {
        $this->assertSame([], Cloud_Cadence_Sync::compute_desired_state([]));
    }

    // ──────────────────────────────────────────────────────────────────────
    //  load_state / save_state — option-backed last-applied map
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function load_state_returns_empty_array_when_option_missing(): void
    {
        // Fresh install / first run: no state persisted yet. Default must
        // be an empty array, not false (the WP get_option default), so
        // sync() can iterate it without is_array() guards everywhere.
        $this->expectFn('get_option')
            ->once()
            ->with(Cloud_Cadence_Sync::STATE_OPTION, [])
            ->andReturn([]);

        $this->assertSame([], Cloud_Cadence_Sync::load_state());
    }

    /** @test */
    public function load_state_coerces_non_array_option_value_to_empty_array(): void
    {
        // Defensive: someone toggling the option manually could leave a
        // non-array value (string, bool). The reconcile pipeline requires
        // an array — coercing here keeps every downstream caller simple.
        $this->expectFn('get_option')
            ->once()
            ->andReturn('garbage-value');

        $this->assertSame([], Cloud_Cadence_Sync::load_state());
    }

    /** @test */
    public function load_state_returns_persisted_map(): void
    {
        $persisted = ['camp-a' => '0 9 * * 1', 'camp-b' => '*/15 * * * *'];
        $this->expectFn('get_option')->once()->andReturn($persisted);

        $this->assertSame($persisted, Cloud_Cadence_Sync::load_state());
    }

    /** @test */
    public function save_state_writes_with_autoload_false(): void
    {
        // The state map is read by the recurring sync handler only. Marking
        // autoload=false keeps it out of every wp_load_alloptions() call —
        // same approach Compat_Scheduler uses for its detection snapshot.
        $this->expectFn('update_option')
            ->once()
            ->with(Cloud_Cadence_Sync::STATE_OPTION, ['x' => '* * * * *'], false)
            ->andReturn(true);

        Cloud_Cadence_Sync::save_state(['x' => '* * * * *']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  should_sync — retired activation gate
    //
    //  The legacy `structura_campaigns_authoritative_in_cloud` migration
    //  flag was retired in 2026-05; cloud is the sole source of truth
    //  on every install. should_sync() now returns true unconditionally
    //  so freshly-activated sites get their AS pulses installed on the
    //  first sync tick instead of stalling at "Not Scheduled" forever.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function should_sync_returns_true_unconditionally(): void
    {
        // No get_option expectation — should_sync() no longer reads any
        // option. If a future kill-switch is added the test should pin
        // *that* option name explicitly.
        $this->assertTrue(Cloud_Cadence_Sync::should_sync());
    }

    // ──────────────────────────────────────────────────────────────────────
    //  invalidate_cache — used by Rest_Api after a SPA mutation
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function invalidate_cache_deletes_the_transient(): void
    {
        $this->expectFn('delete_transient')
            ->once()
            ->with(Cloud_Cadence_Sync::TRANSIENT)
            ->andReturn(true);

        Cloud_Cadence_Sync::invalidate_cache();
    }

    /** @test */
    public function queue_immediate_sync_no_ops_when_action_scheduler_is_unavailable(): void
    {
        // Defensive guard same shape as Action_Scheduler_Service. We can't
        // simulate Action Scheduler absence under Brain Monkey (the stubs
        // make function_exists() return true), but we can still pin the
        // happy-path enqueue.
        $this->expectFn('as_has_scheduled_action')
            ->once()
            ->andReturn(false);
        $this->expectFn('as_enqueue_async_action')
            ->once()
            ->with(Cloud_Cadence_Sync::HOOK, [], STRUCTURA_AS_GROUP)
            ->andReturn(1);

        Cloud_Cadence_Sync::queue_immediate_sync();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  sync() — the reconcile loop. Uses Mockery alias mocking on the static
    //  Action_Scheduler_Service / Cloud_Client / Key_Manager classes, same
    //  pattern as ChannelsConnectionsServiceTest.
    //
    //  Each test installs a focused get_option stub via `Functions\stubs()`
    //  so the activation gate + state load returns the value the test wants.
    //  Re-stubbing replaces the prior stub from setUp(); count and order of
    //  get_option calls aren't pinned — the test cares about the AS calls
    //  the reconcile loop emits, not the number of option reads it took to
    //  decide them.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function sync_schedules_pulse_for_a_new_active_campaign(): void
    {
        // Empty current state + one active campaign in cloud → exactly one
        // sync_pulse call. State persisted afterward so the next tick
        // sees this campaign as already-scheduled.
        Functions\stubs([
            'get_option' => function ($key, $default = false) {
                if ($key === Cloud_Cadence_Sync::STATE_OPTION) return [];
                return $default;
            },
        ]);
        Functions\stubs([
            'get_transient' => false,
            'set_transient' => true,
            'home_url'      => 'https://example.com',
            'update_option' => true,
        ]);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => [
                    'campaigns' => [
                        ['campaignId' => 'camp-new', 'cronSchedule' => '0 9 * * 1', 'status' => 'active'],
                    ],
                ],
                'raw'  => null,
            ]);

        $as_mock = Mockery::mock('alias:Structura\Scheduler\Action_Scheduler_Service');
        $as_mock->shouldReceive('sync_pulse')
            ->once()
            ->with('camp-new', '0 9 * * 1');
        $as_mock->shouldNotReceive('stop_pulse');

        Cloud_Cadence_Sync::sync();
    }

    /** @test */
    public function sync_stops_pulse_when_campaign_disappears_from_cloud(): void
    {
        // State previously had two campaigns; cloud now returns only one.
        // The missing one must get stop_pulse — otherwise paused/deleted
        // campaigns keep firing forever.
        Functions\stubs([
            'get_option' => function ($key, $default = false) {
                if ($key === Cloud_Cadence_Sync::STATE_OPTION) {
                    return ['camp-gone' => '*/30 * * * *', 'camp-still' => '0 9 * * 1'];
                }
                return $default;
            },
        ]);
        Functions\stubs([
            'get_transient' => false,
            'set_transient' => true,
            'home_url'      => 'https://example.com',
            'update_option' => true,
        ]);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => [
                    'campaigns' => [
                        ['campaignId' => 'camp-still', 'cronSchedule' => '0 9 * * 1', 'status' => 'active'],
                    ],
                ],
                'raw'  => null,
            ]);

        $as_mock = Mockery::mock('alias:Structura\Scheduler\Action_Scheduler_Service');
        // sync_pulse is NOT called for camp-still because the cron matches
        // the previous state (no diff). Only the missing camp-gone gets
        // its pulse stopped.
        $as_mock->shouldNotReceive('sync_pulse');
        $as_mock->shouldReceive('stop_pulse')
            ->once()
            ->with('camp-gone');

        Cloud_Cadence_Sync::sync();
    }

    /** @test */
    public function sync_no_ops_on_AS_when_cloud_is_unreachable(): void
    {
        // A transient cloud outage must not wipe AS records. Returning early
        // when fetch_campaigns_from_cloud returns null is the safety net.
        Functions\stubs([
            'get_option' => function ($key, $default = false) {
                if ($key === Cloud_Cadence_Sync::STATE_OPTION) {
                    return ['camp-existing' => '0 9 * * 1'];
                }
                return $default;
            },
        ]);
        Functions\stubs([
            'get_transient' => false,
            'home_url'      => 'https://example.com',
        ]);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(new \WP_Error('http_request_failed', 'Network down'));

        Mockery::mock('alias:Structura\Scheduler\Action_Scheduler_Service')
            ->shouldNotReceive('sync_pulse')
            ->shouldNotReceive('stop_pulse');

        Cloud_Cadence_Sync::sync();
    }

    /** @test */
    public function sync_reschedules_when_cron_changes_for_an_existing_campaign(): void
    {
        // State has camp-a on '0 9 * * 1'; cloud now reports '*/30 * * * *'.
        // sync_pulse must be called to install the new cadence.
        Functions\stubs([
            'get_option' => function ($key, $default = false) {
                if ($key === Cloud_Cadence_Sync::STATE_OPTION) {
                    return ['camp-a' => '0 9 * * 1'];
                }
                return $default;
            },
        ]);
        Functions\stubs([
            'get_transient' => false,
            'set_transient' => true,
            'home_url'      => 'https://example.com',
            'update_option' => true,
        ]);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturn([
                'code' => 200,
                'body' => [
                    'campaigns' => [
                        ['campaignId' => 'camp-a', 'cronSchedule' => '*/30 * * * *', 'status' => 'active'],
                    ],
                ],
                'raw'  => null,
            ]);

        $as_mock = Mockery::mock('alias:Structura\Scheduler\Action_Scheduler_Service');
        $as_mock->shouldReceive('sync_pulse')
            ->once()
            ->with('camp-a', '*/30 * * * *');
        $as_mock->shouldNotReceive('stop_pulse');

        Cloud_Cadence_Sync::sync();
    }
}
