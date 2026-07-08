<?php

namespace Structura\Tests\Unit\Scheduler;

use Brain\Monkey\Functions;
use Structura\Scheduler\Action_Scheduler_Service;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Action_Scheduler_Service — the thin wrapper around AS that
 * Structura schedules and unschedules campaign heartbeats through.
 *
 * The behaviour under test is small and mostly mechanical, but the
 * `int|string $campaign_id` contract is load-bearing for Phase 1.0c:
 * cloud-authoritative campaigns come back from Firestore with nanoid string
 * ids, and in-flight AS records on already-deployed sites still carry int
 * WP post ids. A single accidental `(int)` coercion anywhere in this class
 * would silently zero every nanoid and let one campaign's pulse shadow
 * every other campaign's pulse — exactly the class of bug we already paid
 * for once during Persona_Shape_Transformer.
 *
 * @covers \Structura\Scheduler\Action_Scheduler_Service
 */
class ActionSchedulerServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // AS function stubs — real AS isn't loaded under Brain Monkey. Each
        // test re-stubs whichever ones it asserts on.
        Functions\stubs([
            'as_unschedule_all_actions' => null,
            'as_schedule_cron_action'   => 1,
            'as_get_scheduled_actions'  => [],
        ]);
    }

    /** @test */
    public function sync_pulse_passes_int_campaign_id_through_to_action_scheduler(): void
    {
        // Legacy path: existing migrated sites still hand us int WP post ids.
        // The args dict must carry the int verbatim so subsequent unschedule
        // calls match by AS's strict equality.
        $captured_unschedule_args = [];
        $captured_cron_args       = null;

        $this->expectFn('as_unschedule_all_actions')
            ->twice()
            ->with(\Mockery::type('string'), \Mockery::on(function ($args) use (&$captured_unschedule_args) {
                $captured_unschedule_args[] = $args;
                return true;
            }), \Mockery::any())
            ->andReturn(0);

        $this->expectFn('as_schedule_cron_action')
            ->once()
            ->with(\Mockery::type('integer'), '0 9 * * 1', 'structura_run_campaign_step', \Mockery::on(function ($args) use (&$captured_cron_args) {
                $captured_cron_args = $args;
                return true;
            }), \Mockery::any())
            ->andReturn(42);

        Action_Scheduler_Service::sync_pulse(123, '0 9 * * 1');

        $this->assertSame(['campaign_id' => 123], $captured_unschedule_args[0]);
        $this->assertSame(['campaign_id' => 123], $captured_unschedule_args[1]);
        $this->assertSame(['campaign_id' => 123], $captured_cron_args);
    }

    /** @test */
    public function sync_pulse_passes_nanoid_string_through_unmodified(): void
    {
        // Phase 1.0c path: cloud campaign ids are nanoid strings (e.g.
        // "lZQOnYgB6XZH4lk0J3-rJ"). Casting these to int yields 0, which
        // would let one cloud campaign's pulse shadow every other cloud
        // campaign's pulse. Pin the contract: the string survives intact.
        $captured_cron_args = null;

        $this->expectFn('as_unschedule_all_actions')->twice()->andReturn(0);
        $this->expectFn('as_schedule_cron_action')
            ->once()
            ->with(\Mockery::type('integer'), '*/30 * * * *', 'structura_run_campaign_step', \Mockery::on(function ($args) use (&$captured_cron_args) {
                $captured_cron_args = $args;
                return true;
            }), \Mockery::any())
            ->andReturn(99);

        Action_Scheduler_Service::sync_pulse('lZQOnYgB6XZH4lk0J3-rJ', '*/30 * * * *');

        $this->assertSame(
            ['campaign_id' => 'lZQOnYgB6XZH4lk0J3-rJ'],
            $captured_cron_args,
            'sync_pulse must not coerce string nanoid ids — that would silently zero them.'
        );
    }

    // Note: the `function_exists('as_unschedule_all_actions')` early-return
    // branch in sync_pulse / stop_pulse / is_pulse_active isn't covered here.
    // Brain Monkey's `Functions\stubs` makes function_exists() return true,
    // so simulating AS absence requires runkit or process isolation, neither
    // of which is set up in this suite. The branch is exercised by manual
    // smoke testing on a fresh WP install without WooCommerce loaded.

    /** @test */
    public function stop_pulse_clears_both_recurring_and_jittered_actions(): void
    {
        // Stopping must clear both the cron pulse AND any in-flight one-shot
        // jittered action — otherwise pausing a campaign mid-cycle still
        // fires one final post when the jittered action hits its scheduled
        // time. Pin both unschedule calls.
        $captured_hooks = [];
        $this->expectFn('as_unschedule_all_actions')
            ->twice()
            ->with(\Mockery::on(function ($hook) use (&$captured_hooks) {
                $captured_hooks[] = $hook;
                return true;
            }), \Mockery::any(), \Mockery::any())
            ->andReturn(0);

        Action_Scheduler_Service::stop_pulse(456);

        $this->assertSame(
            ['structura_run_campaign_step', 'structura_run_campaign_step_jittered'],
            $captured_hooks
        );
    }

    /** @test */
    public function stop_pulse_passes_string_id_to_action_scheduler(): void
    {
        // Same string-preservation contract as sync_pulse — verifying the
        // unschedule path explicitly because the equality match in AS is
        // strict, and a missed coercion here would leave nanoid pulses
        // running forever on paused campaigns.
        $captured_args = [];
        $this->expectFn('as_unschedule_all_actions')
            ->twice()
            ->with(\Mockery::any(), \Mockery::on(function ($args) use (&$captured_args) {
                $captured_args[] = $args;
                return true;
            }), \Mockery::any())
            ->andReturn(0);

        Action_Scheduler_Service::stop_pulse('camp-abc-XYZ');

        $this->assertSame(['campaign_id' => 'camp-abc-XYZ'], $captured_args[0]);
        $this->assertSame(['campaign_id' => 'camp-abc-XYZ'], $captured_args[1]);
    }

    /** @test */
    public function is_pulse_active_returns_true_when_pending_actions_exist(): void
    {
        $this->expectFn('as_get_scheduled_actions')
            ->once()
            ->andReturn([(object) ['id' => 1]]);

        $this->assertTrue(Action_Scheduler_Service::is_pulse_active(789));
    }

    /** @test */
    public function is_pulse_active_returns_false_when_no_pending_actions(): void
    {
        $this->expectFn('as_get_scheduled_actions')
            ->once()
            ->andReturn([]);

        $this->assertFalse(Action_Scheduler_Service::is_pulse_active(789));
    }

    /** @test */
    public function is_pulse_active_passes_string_id_to_action_scheduler_query(): void
    {
        // Confirms the AS query carries the nanoid verbatim so the lookup
        // matches what was scheduled. Without this, Cloud_Cadence_Sync's
        // "is this already scheduled?" check (Phase 1.0c Step 3) would
        // always return false for cloud campaigns and we'd schedule duplicates.
        $captured_query = null;
        $this->expectFn('as_get_scheduled_actions')
            ->once()
            ->with(\Mockery::on(function ($query) use (&$captured_query) {
                $captured_query = $query;
                return true;
            }))
            ->andReturn([]);

        Action_Scheduler_Service::is_pulse_active('camp-nano-id-XYZ');

        $this->assertSame(
            ['campaign_id' => 'camp-nano-id-XYZ'],
            $captured_query['args'] ?? null
        );
    }

    /** @test */
    public function stop_all_campaign_pulses_clears_every_campaign_action_with_empty_args(): void
    {
        // Called from `License_Manager::deactivate()` so the site
        // doesn't keep firing campaign work after disconnect — and
        // especially so the disconnect → switch-to-different-license
        // flow doesn't leave License A's queued runs firing against
        // License B's bearer (with cloud 404s as the only symptom).
        //
        // The wildcard semantic comes from passing an empty args
        // array — AS treats that as "match any args", so a single
        // pair of calls covers every campaign id without enumerating
        // them. Both the recurring `_step` hook and the jittered
        // `_step_jittered` hook must be cleared.
        $captured = [];
        $this->expectFn('as_unschedule_all_actions')
            ->twice()
            ->with(
                \Mockery::on(function ($hook) use (&$captured) {
                    $captured[] = ['hook' => $hook];
                    return true;
                }),
                \Mockery::on(function ($args) use (&$captured) {
                    $captured[count($captured) - 1]['args'] = $args;
                    return true;
                }),
                \Mockery::any(),
            )
            ->andReturn(0);

        Action_Scheduler_Service::stop_all_campaign_pulses();

        $this->assertSame('structura_run_campaign_step', $captured[0]['hook']);
        $this->assertSame([], $captured[0]['args'], 'empty args = wildcard match across every campaign id');
        $this->assertSame('structura_run_campaign_step_jittered', $captured[1]['hook']);
        $this->assertSame([], $captured[1]['args']);
    }
}
