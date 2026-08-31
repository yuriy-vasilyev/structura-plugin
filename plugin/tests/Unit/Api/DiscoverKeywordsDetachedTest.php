<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Wire contract of {@see Rest_Api::discover_keywords_detached()} — the
 * wp-admin proxy in front of the cloud's `executeKeywordDiscovery`.
 *
 * Live QA of the ranked keyword bank (2026-08-28): every real discovery run
 * showed the "Live data" badge and the "Quick wins · KD ≤ 40" caption but NOT
 * ONE row carried volume / KD / intent / "+N". The cloud returned them — the
 * proxy forwarded only `keywords` + `meta` and dropped the per-keyword
 * `metrics` map on the floor, so the SPA's metrics merge no-op'd. This pins
 * that `metrics` (and the `meta` the caption reads) reach the SPA verbatim.
 *
 * @covers \Structura\Api\Rest_Api::discover_keywords_detached
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class DiscoverKeywordsDetachedTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_forwards_the_per_keyword_metrics_and_discovery_meta_from_the_cloud(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->andReturnNull();

        $cloud_body = [
            'success'  => true,
            'keywords' => [
                ['keyword' => 'espresso grind size chart', 'source' => 'suggestion', 'usageCount' => 0],
                ['keyword' => 'best espresso machine', 'source' => 'gap', 'usageCount' => 0],
            ],
            'metrics'  => [
                'espresso grind size chart' => [
                    'source'       => 'suggestion',
                    'volumeNumber' => 2900,
                    'difficulty'   => 28,
                    'intent'       => 'informational',
                    'variantCount' => 3,
                ],
                'best espresso machine' => [
                    'source'       => 'gap',
                    'volumeNumber' => 14500,
                    'difficulty'   => 78,
                    'intent'       => 'commercial',
                    'variantCount' => 1,
                ],
            ],
            'longTailPool' => [['keyword' => 'espresso grind size chart for moka pot', 'volumeNumber' => 90]],
            'meta'     => [
                'queriesRun'    => 3,
                'rawCandidates' => 120,
                'afterCuration' => 2,
                'durationMs'    => 4200,
                'path'          => 'provider',
                'resolvedMode'  => 'balanced',
                'kdCeiling'     => 65,
            ],
        ];

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->with('/executeKeywordDiscovery', Mockery::any(), Mockery::any())
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('get_bloginfo')->justReturn('Espresso at Home');
        Functions\when('home_url')->justReturn('https://espresso.test');
        Functions\when('wp_parse_url')->justReturn('espresso.test');
        Functions\when('rest_ensure_response')->returnArg(1);

        $rest   = new Rest_Api();
        $result = $rest->discover_keywords_detached($this->make_request([
            'keyphrase'     => 'home espresso guides',
            'campaign_name' => 'Espresso at Home',
            'language'      => 'en',
            'text_provider' => 'gemini',
        ]));

        $this->assertIsArray($result);
        $this->assertTrue($result['success'] ?? false);
        $this->assertSame($cloud_body['keywords'], $result['keywords']);
        // The whole point: the per-keyword metrics the ranked rows render.
        $this->assertSame($cloud_body['metrics'], $result['metrics'] ?? null);
        // And the resolved mode / ceiling the caption reads, untouched.
        $this->assertSame('balanced', $result['meta']['resolvedMode'] ?? null);
        $this->assertSame(65, $result['meta']['kdCeiling'] ?? null);
        $this->assertSame('provider', $result['meta']['path'] ?? null);
    }

    /** @test */
    public function it_omits_metrics_when_the_cloud_sent_none_legacy_path(): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')
            ->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->andReturnNull();
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->andReturn([
                'code' => 200,
                'body' => [
                    'success'  => true,
                    'keywords' => [['keyword' => 'x', 'source' => 'ai_generated', 'volume' => 'high', 'usageCount' => 0]],
                    'meta'     => ['path' => 'legacy', 'durationMs' => 10],
                ],
                'raw'  => null,
            ]);
        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('get_bloginfo')->justReturn('Site');
        Functions\when('home_url')->justReturn('https://site.test');
        Functions\when('wp_parse_url')->justReturn('site.test');
        Functions\when('rest_ensure_response')->returnArg(1);

        $rest   = new Rest_Api();
        $result = $rest->discover_keywords_detached($this->make_request([
            'keyphrase'     => 'x',
            'language'      => 'en',
            'text_provider' => 'gemini',
        ]));

        $this->assertTrue($result['success']);
        // Legacy runs carry no metrics map — the key is absent, never null/[].
        $this->assertArrayNotHasKey('metrics', $result);
        $this->assertSame('legacy', $result['meta']['path']);
    }

    /**
     * Minimal `WP_REST_Request` stand-in exposing `get_json_params()`.
     *
     * @param array<string, mixed> $params
     */
    private function make_request(array $params): object
    {
        return new class($params) {
            /** @var array<string, mixed> */
            private $params;

            /** @param array<string, mixed> $params */
            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }
}
