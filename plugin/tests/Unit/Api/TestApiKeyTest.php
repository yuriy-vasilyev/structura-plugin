<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The key wizard's live test before a key is saved
 * (specs/provider-key-test.md §3).
 *
 * Until 2026-11-18 the plugin never tested a pasted key: it saved it,
 * toasted "Key authenticated and encrypted" and its Connection step only
 * checked that a binding existed, so a key with no credit failed at the
 * first generation. Cloud_Client is the network edge; Provider_Registry
 * runs for real.
 *
 * @covers \Structura\Api\Rest_Api::test_api_key
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class TestApiKeyTest extends TestCase
{
    private const NO_CREDIT = 'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';

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
     * Expect one cloud call to `/testProviderCredential`, capture its payload.
     *
     * @param array<string, mixed>|\WP_Error $response Cloud_Client::post's return.
     * @param array<string, mixed>|null      $captured Filled by reference.
     */
    private function expect_cloud_test($response, ?array &$captured): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/testProviderCredential', Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }), Mockery::any())
            ->andReturn($response);
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
     * @param array<string, mixed> $params
     */
    private function make_request(array $params): object
    {
        return new class($params) {
            /** @var array<string, mixed> */
            private $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return mixed */
            public function get_param(string $key)
            {
                return $this->params[$key] ?? null;
            }
        };
    }

    /** @test */
    public function it_forwards_the_pasted_key_and_returns_the_providers_own_message(): void
    {
        $captured = null;
        $this->expect_cloud_test([
            'code' => 200,
            'body' => [
                'success' => true,
                'result'  => [
                    'ok'              => false,
                    'latencyMs'       => 2133,
                    'errorCode'       => 'rate_limit',
                    'errorMessage'    => '429 ' . self::NO_CREDIT,
                    'providerMessage' => self::NO_CREDIT,
                ],
            ],
            'raw'  => null,
        ], $captured);

        $result = (new Rest_Api())->test_api_key(
            $this->make_request(['provider' => 'openai', 'key' => ' sk-proj-no-credit '])
        );

        $this->assertSame('openai', $captured['provider']);
        $this->assertSame('sk-proj-no-credit', $captured['apiKey']);
        $this->assertSame([
            'ok'              => false,
            'latencyMs'       => 2133,
            'errorCode'       => 'rate_limit',
            'providerMessage' => self::NO_CREDIT,
        ], $result);
    }

    /** @test */
    public function it_returns_a_passed_test(): void
    {
        $captured = null;
        $this->expect_cloud_test([
            'code' => 200,
            'body' => ['success' => true, 'result' => ['ok' => true, 'latencyMs' => 412]],
            'raw'  => null,
        ], $captured);

        $result = (new Rest_Api())->test_api_key(
            $this->make_request(['provider' => 'anthropic', 'key' => 'sk-ant-valid-key'])
        );

        $this->assertSame(['ok' => true, 'latencyMs' => 412], $result);
    }

    /** @test */
    public function it_refuses_an_unknown_provider_without_a_cloud_call(): void
    {
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->test_api_key(
            $this->make_request(['provider' => 'mistral', 'key' => 'sk-proj-key'])
        );

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('provider_not_available', $result->get_error_code());
    }

    /** @test */
    public function it_refuses_an_empty_key_without_a_cloud_call(): void
    {
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->test_api_key(
            $this->make_request(['provider' => 'openai', 'key' => '   '])
        );

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    /** @test */
    public function it_reports_a_refused_cloud_call_as_an_error_not_a_test_result(): void
    {
        $captured = null;
        $this->expect_cloud_test([
            'code' => 400,
            'body' => ['success' => false, 'error' => 'API key looks invalid.'],
            'raw'  => null,
        ], $captured);

        $result = (new Rest_Api())->test_api_key(
            $this->make_request(['provider' => 'openai', 'key' => 'sk-1'])
        );

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('API key looks invalid.', $result->get_error_message());
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    /** @test */
    public function it_reports_an_unreachable_cloud_as_a_502(): void
    {
        $captured = null;
        $this->expect_cloud_test(new \WP_Error('http_request_failed', 'cURL error 28'), $captured);

        $result = (new Rest_Api())->test_api_key(
            $this->make_request(['provider' => 'openai', 'key' => 'sk-proj-key'])
        );

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame(502, $result->get_error_data()['status']);
    }
}
