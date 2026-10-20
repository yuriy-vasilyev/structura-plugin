<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Durable onboarding-dismissed flag on the wizard REST bridge (2026-07-20).
 *
 * The SPA's onboarding auto-redirect kept resurrecting the wizard because its
 * only suppressor was a localStorage flag keyed by the activation id, which
 * drifts on workspace re-provision. The source of truth is now a wp_option
 * (`structura_onboarding_dismissed`) that the plugin sets:
 *   1. explicitly on wizard Finish/Exit via POST /onboarding/dismiss, and
 *   2. as a self-heal whenever the cloud reports a completed wizard
 *      (`state.completedAt`), so already-completed installs are covered.
 *
 * @covers \Structura\Api\Rest_Api::mark_onboarding_dismissed
 * @covers \Structura\Api\Rest_Api::get_wizard_state
 */
class WizardOnboardingDismissTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $option_writes = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->option_writes = [];

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
        Functions\when('update_option')->alias(function ($key, $value) {
            $this->option_writes[$key] = $value;
            return true;
        });
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function mark_onboarding_dismissed_sets_the_durable_flag(): void
    {
        $rest     = new Rest_Api();
        $response = $rest->mark_onboarding_dismissed($this->make_request());

        $this->assertSame(
            '1',
            $this->option_writes['structura_onboarding_dismissed'] ?? null,
            'Finish/Exit must durably record the dismissal server-side.'
        );
        $this->assertTrue($response['success'] ?? false);
    }

    /** @test */
    public function get_wizard_state_self_heals_the_flag_when_the_cloud_reports_completed(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'live_abc'])
            ->getMock()
            ->shouldReceive('has_workspace')
            ->andReturn(true);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => ['state' => ['completedAt' => '2026-07-20T00:00:00.000Z']],
                'raw'  => null,
            ]);

        (new Rest_Api())->get_wizard_state($this->make_request());

        $this->assertSame(
            '1',
            $this->option_writes['structura_onboarding_dismissed'] ?? null,
            'A completed cloud wizard must durably suppress the auto-redirect.'
        );
    }

    /** @test */
    public function get_wizard_state_leaves_the_flag_unset_when_not_completed(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'live_abc'])
            ->getMock()
            ->shouldReceive('has_workspace')
            ->andReturn(true);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturn([
                'code' => 200,
                'body' => ['state' => ['completedAt' => null], 'justCreated' => false],
                'raw'  => null,
            ]);

        (new Rest_Api())->get_wizard_state($this->make_request());

        $this->assertArrayNotHasKey(
            'structura_onboarding_dismissed',
            $this->option_writes,
            'An in-progress wizard must NOT be sealed as dismissed.'
        );
    }

    /** @test */
    public function get_wizard_state_answers_the_quiet_state_when_the_cloud_sends_no_state(): void
    {
        // An install whose activation no longer exists gets
        // `{"success":false,"error":"Unauthorized."}` back (2026-10-19); the
        // SPA must still receive a state object, never that error body.
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'live_abc'])
            ->getMock()
            ->shouldReceive('has_workspace')
            ->andReturn(true);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturn([
                'code' => 401,
                'body' => ['success' => false, 'error' => 'Unauthorized.'],
                'raw'  => null,
            ]);

        $response = (new Rest_Api())->get_wizard_state($this->make_request());

        $this->assertSame(1, $response['state']['currentStep'] ?? null);
        $this->assertArrayHasKey('completedAt', $response['state']);
        $this->assertNull($response['state']['completedAt']);
        $this->assertFalse($response['justCreated'] ?? true);
        $this->assertArrayNotHasKey('error', $response);
        $this->assertArrayNotHasKey('structura_onboarding_dismissed', $this->option_writes);
    }

    /**
     * Minimal WP_REST_Request stand-in — neither handler reads request
     * params, so an empty object suffices. PHP 7.4-compatible.
     */
    private function make_request(): object
    {
        return new class {
            public function get_json_params()
            {
                return [];
            }

            public function get_param(string $key)
            {
                return null;
            }
        };
    }
}
