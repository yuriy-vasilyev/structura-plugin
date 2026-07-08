<?php

namespace Structura\Tests\Unit\Api;

use ArrayAccess;
use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for `Rest_Api::run_task` — the `/jobs/run` REST handler
 * that powers the wp-admin "Generate Now" button.
 *
 * This is the single point where the plugin mints the progress-stream
 * `campaign_run_id`. The wire contract this file pins:
 *
 *   1. The REST response carries `campaign_run_id` at the top level, so
 *      the React client can key its poll loop on it before Action
 *      Scheduler has even executed the async hook. Spec:
 *      `specs/progress-stream.md` §11 Q1(a).
 *
 *   2. The same runId is passed to `as_enqueue_async_action` as the
 *      **second positional arg** (keys `campaign_id`, `campaign_run_id`
 *      in that order — Action Scheduler spreads values positionally to
 *      the hook callback, so key order matters).
 *
 *   3. A missing `campaign_id` returns a `WP_Error` BEFORE we mint a
 *      runId or touch Action Scheduler — validation must short-circuit
 *      so an invalid request doesn't leave orphan runIds floating.
 *
 *   4. The runId mint is gated only on `none` (anonymous, unlicensed)
 *      tier. Post cloud-only-generation Phase 3 every licensed tier —
 *      Free included — flows through `delegate_to_cloud`, and the cloud
 *      primes a Firestore progress doc via `primeProgressDoc` before
 *      returning. So Free deserves the runId too; only anonymous
 *      installs (no license_key → 403 at cloud auth → no doc ever
 *      written) still get the silent toast-only path. The pre-Phase-3
 *      gate that suppressed Free was the cause of the "Run now" button
 *      lighting up the inline progress strip only after a full page
 *      reload — `setActiveRun` keys on this field, and its absence is
 *      what wedged the surface shut on Free.
 *
 * @covers \Structura\Api\Rest_Api::run_task
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class RunTaskTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // These two are referenced by `run_task` but aren't stubbed in
        // the shared TestCase because the rest of the suite doesn't
        // exercise this code path.
        Functions\stubs([
            // Return a short, predictable value — tests assert identity, not format.
            'wp_generate_uuid4'   => function () { return 'run-uuid-fixture'; },
            // Pass the payload through verbatim so we can inspect it.
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_returns_wp_error_when_campaign_id_is_missing(): void
    {
        // `as_enqueue_async_action` must NOT be called on the validation
        // failure path — otherwise we'd burn a runId (and a row in the
        // AS table) on a request we're about to reject.
        $this->expectFn('as_enqueue_async_action')->never();
        $this->expectFn('wp_generate_uuid4')->never();

        $rest = new Rest_Api();
        $result = $rest->run_task($this->make_request(0));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('missing_id', $result->get_error_code());
    }

    /** @test */
    public function it_returns_campaign_run_id_and_forwards_it_to_action_scheduler_on_paid_tier(): void
    {
        $this->mock_license_tier('byok');

        // Capture the actual args handed to Action Scheduler so we can
        // assert both the *value* of the runId and the *key order*
        // (which controls positional spread into the hook callback).
        $captured_args = null;
        $this->expectFn('as_enqueue_async_action')
            ->once()
            ->with(
                'structura_run_campaign_step_jittered',
                Mockery::on(function ($args) use (&$captured_args) {
                    $captured_args = $args;
                    return true;
                }),
                STRUCTURA_AS_GROUP
            );

        $rest = new Rest_Api();
        $response = $rest->run_task($this->make_request(42));

        // 1. Response carries the runId for the client's poll loop.
        $this->assertIsArray($response);
        $this->assertTrue($response['success']);
        $this->assertSame('run-uuid-fixture', $response['campaign_run_id']);

        // 2. AS received both campaign_id and campaign_run_id.
        $this->assertSame(42, $captured_args['campaign_id']);
        $this->assertSame('run-uuid-fixture', $captured_args['campaign_run_id']);

        // 3. Key order matters — AS spreads values positionally to the
        //    hook callback signature `(int $campaign_id, string $campaign_run_id = '')`.
        //    If the next refactor reorders these, the runId silently ends
        //    up as the campaign_id and the drawer breaks in prod.
        $this->assertSame(
            ['campaign_id', 'campaign_run_id'],
            array_keys($captured_args)
        );
    }

    /** @test */
    public function it_returns_campaign_run_id_on_free_tier_too(): void
    {
        // Cloud-only-generation Phase 3: Free flows through
        // `delegate_to_cloud` and the cloud writes a progress doc, so the
        // SPA's poll target IS valid for Free. The runId now mounts the
        // inline progress strip immediately, the same way BYOK does.
        $this->mock_license_tier('free');

        $captured_args = null;
        $this->expectFn('as_enqueue_async_action')
            ->once()
            ->with(
                'structura_run_campaign_step_jittered',
                Mockery::on(function ($args) use (&$captured_args) {
                    $captured_args = $args;
                    return true;
                }),
                STRUCTURA_AS_GROUP
            );

        $rest = new Rest_Api();
        $response = $rest->run_task($this->make_request(42));

        $this->assertIsArray($response);
        $this->assertTrue($response['success']);
        $this->assertSame('run-uuid-fixture', $response['campaign_run_id']);

        // AS receives the same runId, in the same key order as BYOK.
        $this->assertSame(42, $captured_args['campaign_id']);
        $this->assertSame('run-uuid-fixture', $captured_args['campaign_run_id']);
        $this->assertSame(
            ['campaign_id', 'campaign_run_id'],
            array_keys($captured_args)
        );
    }

    /** @test */
    public function it_omits_campaign_run_id_from_response_on_none_tier(): void
    {
        // Anonymous (unlicensed) installs still get the silent toast-only
        // path: no license_key means `Cloud_Client::post` 403s before
        // `primeProgressDoc` ever runs, so handing the client a runId
        // would just re-introduce the `run_not_found` poll storm.
        $this->mock_license_tier('none');

        $this->expectFn('wp_generate_uuid4')->never();
        $this->expectFn('as_enqueue_async_action')->once();

        $rest = new Rest_Api();
        $response = $rest->run_task($this->make_request(42));

        $this->assertTrue($response['success']);
        $this->assertArrayNotHasKey('campaign_run_id', $response);
    }

    /**
     * Alias-mock `License_Manager::get_license_data()` to return a fixed
     * plan string. Mockery's alias mode replaces the class for the rest
     * of the process, which is fine here: no other test in this file
     * uses the real `License_Manager`.
     *
     * The shape returned matches `License_Manager::get_license_data()` in
     * `plugin/includes/Core/License_Manager.php` — `plan` is the only
     * field `run_task` reads, but we include the sibling keys so a
     * future refactor reading another key (e.g. `is_pro`) still sees a
     * plausibly-shaped return.
     */
    private function mock_license_tier(string $plan): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn([
                'is_pro'      => in_array($plan, ['byok', 'cloud', 'cloud_pro'], true),
                'is_licensed' => $plan !== 'none',
                'plan'        => $plan,
                'license_key' => $plan === 'none' ? '' : 'fixture-key',
                'upgrade_url' => 'https://app.structurawp.com/billing',
            ]);
    }

    /**
     * WP_REST_Request implements ArrayAccess — this stub mimics just
     * enough to let `$request['campaign_id']` work in the handler.
     */
    private function make_request(int $campaign_id): ArrayAccess
    {
        // PHP 7.4-compatible — no constructor property promotion and
        // no `mixed` return type (both 8.0+). The CI matrix still
        // tests 7.4; the `#[\ReturnTypeWillChange]` attribute silences
        // the LSP warning on `offsetGet` since `ArrayAccess::offsetGet`
        // has changed signature across PHP versions.
        return new class($campaign_id) implements ArrayAccess {
            /** @var int */
            private $campaign_id;

            public function __construct(int $campaign_id)
            {
                $this->campaign_id = $campaign_id;
            }

            public function offsetExists($key): bool
            {
                return $key === 'campaign_id';
            }

            #[\ReturnTypeWillChange]
            public function offsetGet($key)
            {
                return $key === 'campaign_id' ? $this->campaign_id : null;
            }

            public function offsetSet($key, $value): void {}
            public function offsetUnset($key): void {}
        };
    }
}
