<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The setup wizard on an anonymous install (2026-10-06).
 *
 * Bug: wp-test.xerx.io (plan `none`, plugin 2.28.0) finished the wizard and
 * the dashboard still said "6 steps left". Anonymous installs hold an
 * activation bearer (`api_token`) but no `license_key`, and every wizard
 * proxy refused them with `no_license` before reaching the cloud, whose
 * wizard endpoints accept any activation bearer. `get_wizard_state`
 * answered with a synthetic fresh state, so the completion never landed.
 *
 * The real License_Manager runs against a staged license payload
 * (Key_Manager is the storage edge); Cloud_Client is the network edge.
 *
 * @covers \Structura\Api\Rest_Api::save_wizard_step
 * @covers \Structura\Api\Rest_Api::get_wizard_state
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class WizardAnonymousBearerTest extends TestCase
{
    /** Anonymous shadow workspace: bearer bound, no license key. */
    private const ANONYMOUS_PAYLOAD = [
        'api_token'     => 'tok_anon',
        'activation_id' => 'act_anon',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Stage the stored license payload read by the real License_Manager.
     *
     * @param array<string, mixed>|null $payload
     */
    private function stage_license_payload(?array $payload): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn($payload);
    }

    /**
     * Expect exactly one cloud call to `$route` and capture its payload.
     *
     * @param array<string, mixed> $body     Cloud response body.
     * @param array<string, mixed> $captured Filled by reference.
     */
    private function expect_cloud_call(string $route, array $body, ?array &$captured): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with($route, Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }), Mockery::any())
            ->andReturn(['code' => 200, 'body' => $body, 'raw' => null]);
    }

    private function expect_no_cloud_call(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->never();
    }

    /**
     * Minimal `WP_REST_Request` stand-in (PHP 7.4-compatible).
     *
     * @param array<string, mixed> $params JSON body.
     */
    private function make_request(array $params = []): object
    {
        return new class($params) {
            /** @var array<string, mixed> */
            private $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->params;
            }

            /** @return mixed */
            public function get_param(string $key)
            {
                return $this->params[$key] ?? null;
            }
        };
    }

    /** @test */
    public function an_anonymous_install_saves_a_wizard_step_through_its_bearer(): void
    {
        $this->stage_license_payload(self::ANONYMOUS_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/saveWizardStep',
            ['success' => true, 'state' => ['currentStep' => 2, 'completedSteps' => [1]]],
            $captured
        );

        $result = (new Rest_Api())->save_wizard_step($this->make_request(['step' => 1]));

        $this->assertNotInstanceOf(\WP_Error::class, $result);
        $this->assertSame(1, $captured['step']);
        $this->assertSame([1], $result['state']['completedSteps']);
    }

    /**
     * One case per wizard proxy whose cloud endpoint uses
     * `requireActivationBearer`.
     *
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>}>
     */
    public function connection_gated_wizard_proxies(): array
    {
        return [
            'skip step'            => ['skip_wizard_step', '/skipWizardStep', ['step' => 3]],
            'reset'                => ['reset_wizard_state', '/resetWizardState', []],
            'test AI'              => ['test_wizard_ai_connection', '/testWizardAiConnection', ['provider' => 'openai', 'model' => 'gpt-test']],
            'notify support'       => ['notify_wizard_support', '/notifyWizardSupport', ['provider' => 'openai']],
            'read positioning'     => ['get_wizard_positioning', '/getWizardPositioning', []],
            'save positioning'     => ['save_wizard_positioning', '/saveWizardPositioning', ['what' => 'Knives', 'who' => 'Cooks', 'problem' => 'Dull blades']],
            'suggest positioning'  => ['suggest_wizard_positioning', '/suggestWizardPositioning', []],
            'suggest keywords'     => ['suggest_wizard_keywords', '/suggestWizardKeywords', []],
            'suggest competitors'  => ['suggest_wizard_competitors', '/suggestWizardCompetitors', []],
        ];
    }

    /**
     * @test
     * @dataProvider connection_gated_wizard_proxies
     *
     * @param array<string, mixed> $params
     */
    public function an_anonymous_install_reaches_every_bearer_authenticated_wizard_endpoint(string $method, string $route, array $params): void
    {
        $this->stage_license_payload(self::ANONYMOUS_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call($route, ['success' => true], $captured);

        $result = (new Rest_Api())->{$method}($this->make_request($params));

        $this->assertNotInstanceOf(\WP_Error::class, $result, $method);
        $this->assertTrue($result['success']);
    }

    /** @test */
    public function an_install_without_a_cloud_connection_is_refused_before_the_cloud(): void
    {
        $this->stage_license_payload(null);
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->save_wizard_step($this->make_request(['step' => 1]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('no_workspace', $result->get_error_code());
        $this->assertSame(403, $result->get_error_data()['status']);
    }

    /** @test */
    public function a_licence_only_endpoint_still_refuses_an_anonymous_install(): void
    {
        // The cloud's updateSiteSeoSettings uses requireLicensedActivationBearer.
        $this->stage_license_payload(self::ANONYMOUS_PAYLOAD);
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->update_site_seo_settings(
            $this->make_request(['competitorUrls' => ['https://rival.test']])
        );

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('no_license', $result->get_error_code());
        $this->assertSame(403, $result->get_error_data()['status']);
    }

    /** @test */
    public function an_anonymous_install_reads_the_real_wizard_state_from_the_cloud(): void
    {
        $this->stage_license_payload(self::ANONYMOUS_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/getWizardState', [
            'state'       => [
                'currentStep'    => 6,
                'completedSteps' => [1, 2, 3, 4, 5, 6],
                'skippedSteps'   => [],
                'completedAt'    => '2026-10-06T09:00:00.000Z',
            ],
            'justCreated' => false,
        ], $captured);
        $writes = [];
        Functions\when('update_option')->alias(function ($key, $value) use (&$writes) {
            $writes[$key] = $value;
            return true;
        });

        $result = (new Rest_Api())->get_wizard_state($this->make_request());

        $this->assertSame('2026-10-06T09:00:00.000Z', $result['state']['completedAt']);
        $this->assertSame([1, 2, 3, 4, 5, 6], $result['state']['completedSteps']);
        $this->assertSame('1', $writes['structura_onboarding_dismissed'] ?? null);
    }

    /** @test */
    public function an_install_without_a_cloud_connection_gets_the_quiet_fresh_state(): void
    {
        $this->stage_license_payload(null);
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->get_wizard_state($this->make_request());

        $this->assertSame(1, $result['state']['currentStep']);
        $this->assertNull($result['state']['completedAt']);
        $this->assertFalse($result['justCreated']);
    }
}
