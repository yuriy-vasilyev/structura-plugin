<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Magic suggest on every plan (2026-10-06, specs/open-providers.md §8).
 *
 * {@see Rest_Api::handle_unified_suggestion()} carries no plan check: an
 * anonymous install (plan `none`, no licence key) and a Free site forward
 * the suggestion to the cloud and get the result back, like paid sites.
 * Pins that no plan gate comes back on the plugin side.
 *
 * @covers \Structura\Api\Rest_Api::handle_unified_suggestion
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SuggestEveryPlanTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * @test
     * @dataProvider own_key_plans
     */
    public function it_forwards_the_suggestion_and_returns_the_result(string $plan, string $license_key): void
    {
        $captured = null;

        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')->andReturn(['license_key' => $license_key])
            ->shouldReceive('get_plan')->andReturn($plan);
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')->andReturn(['license_key' => $license_key]);
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->andReturnNull();
        Mockery::mock('overload:Structura\Scheduler\Context_Builder')
            ->shouldReceive('build_brand_context')
            ->andReturn([
                'identity'          => ['name' => 'Acme', 'tagline' => ''],
                'content_footprint' => ['recent_topics' => [], 'categories' => [], 'tags' => []],
                'language'          => 'en-US',
            ]);
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/executeCloudSuggestion', Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }), Mockery::any())
            ->andReturn(['code' => 200, 'body' => ['result' => ['name' => 'The Smith']], 'raw' => null]);

        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('get_site_url')->justReturn('https://acme.test');
        Functions\when('wp_parse_url')->justReturn('acme.test');
        Functions\when('rest_ensure_response')->returnArg(1);

        $rest     = new Rest_Api();
        $response = $rest->handle_unified_suggestion($this->make_request([
            'mode'     => 'persona',
            'provider' => 'openai',
            'context'  => [],
        ]));

        $this->assertSame(['name' => 'The Smith'], $response['result']);
        $this->assertSame('persona', $captured['mode']);
        // Own-key plans keep the provider the site picked (managed plans are forced to Gemini).
        $this->assertSame('openai', $captured['provider']);
        $this->assertSame($license_key, $captured['licenseKey']);
    }

    /** @return array<string, array{string, string}> */
    public function own_key_plans(): array
    {
        return [
            'anonymous install' => ['none', ''],
            'Free site'         => ['free', 'ST-FREE-KEY'],
        ];
    }

    /**
     * The handler reads the body with array access (`$request['mode']`), so a
     * minimal ArrayAccess stand-in replaces WP_REST_Request.
     *
     * @param array<string, mixed> $params
     */
    private function make_request(array $params): \ArrayAccess
    {
        return new class($params) implements \ArrayAccess {
            /** @var array<string, mixed> */
            private $params;

            /** @param array<string, mixed> $params */
            public function __construct(array $params)
            {
                $this->params = $params;
            }

            #[\ReturnTypeWillChange]
            public function offsetExists($offset): bool
            {
                return array_key_exists($offset, $this->params);
            }

            #[\ReturnTypeWillChange]
            public function offsetGet($offset)
            {
                return $this->params[$offset] ?? null;
            }

            #[\ReturnTypeWillChange]
            public function offsetSet($offset, $value): void
            {
                $this->params[$offset] = $value;
            }

            #[\ReturnTypeWillChange]
            public function offsetUnset($offset): void
            {
                unset($this->params[$offset]);
            }
        };
    }
}
