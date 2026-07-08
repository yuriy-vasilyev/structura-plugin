<?php

namespace Structura\Tests\Unit\Scheduler;

use Mockery;
use Structura\Scheduler\Delivery_Poller;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the polling-delivery fallback scheduler (`Delivery_Poller`).
 *
 * The full pull→apply→ack path is integration-shaped (it constructs a real
 * Task_Runner and inserts a WP post), so — matching TaskRunnerTest's stance —
 * we pin the tractable seams here:
 *
 *   1. `ensure_scheduled()` installs the recurring poll exactly once.
 *   2. `queue_immediate_poll()` enqueues the one-shot async action.
 *   3. `poll()` bails BEFORE touching the cloud when the site isn't activated.
 *   4. `poll()` makes exactly one cloud call and stops when nothing is pending
 *      (no `getDeliverable` fan-out).
 *
 * Cloud_Client / Key_Manager are alias-mocked (same pattern as
 * CloudCadenceSyncTest). The apply+ack body is exercised by the cloud-side
 * deliverables tests + the plugin integration suite.
 *
 * @covers \Structura\Scheduler\Delivery_Poller
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class DeliveryPollerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Log_Service hits $wpdb directly, which is null under the Brain
        // Monkey bootstrap. A permissive alias keeps log-emitting paths happy.
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

    /** @test */
    public function ensure_scheduled_installs_the_recurring_poll_when_absent(): void
    {
        $this->expectFn('as_has_scheduled_action')
            ->once()
            ->andReturn(false);
        $this->expectFn('as_schedule_recurring_action')
            ->once()
            ->with(
                Mockery::type('int'),
                Delivery_Poller::RECURRING_INTERVAL,
                Delivery_Poller::HOOK,
                [],
                STRUCTURA_AS_GROUP
            )
            ->andReturn(1);

        Delivery_Poller::ensure_scheduled();
    }

    /** @test */
    public function ensure_scheduled_is_a_no_op_when_already_scheduled(): void
    {
        $this->expectFn('as_has_scheduled_action')
            ->once()
            ->andReturn(true);
        // Must NOT re-schedule.
        $this->expectFn('as_schedule_recurring_action')->never();

        Delivery_Poller::ensure_scheduled();
    }

    /** @test */
    public function queue_immediate_poll_enqueues_the_async_action(): void
    {
        $this->expectFn('as_enqueue_async_action')
            ->once()
            ->with(Delivery_Poller::HOOK, [], STRUCTURA_AS_GROUP)
            ->andReturn(1);

        Delivery_Poller::queue_immediate_poll();
    }

    /** @test */
    public function poll_bails_before_touching_the_cloud_when_not_activated(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([]); // no key → not activated

        // The cloud must never be called for an unactivated site.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        Delivery_Poller::poll();
    }

    /** @test */
    public function poll_makes_one_cloud_call_and_stops_when_nothing_is_pending(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // Exactly one call (listPendingDeliveries). An empty list must NOT
        // trigger a getDeliverable fan-out — the `->once()` cap fails the
        // test if a second call is made.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'deliveries' => []],
                'raw'  => null,
            ]);

        Delivery_Poller::poll();
    }
}
