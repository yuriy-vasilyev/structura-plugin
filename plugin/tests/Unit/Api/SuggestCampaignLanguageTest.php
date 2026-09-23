<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Wire contract of {@see Rest_Api::handle_unified_suggestion()} for the
 * campaign content language.
 *
 * Regression (2026-09-22): the proxy built `site_identity.language` from the
 * WP site language and forwarded nothing about the campaign, so the cloud
 * appended "The output language must be: de-AT" to an ENGLISH campaign's
 * strategy prompt on a German site. The campaign language now rides along as
 * a top-level `language`; "default" (= site language) and garbage are not
 * forwarded so older cloud builds keep seeing the legacy payload.
 *
 * @covers \Structura\Api\Rest_Api::handle_unified_suggestion
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SuggestCampaignLanguageTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @return array<string, mixed>|null the payload Cloud_Client::post received */
    private function run_suggest(array $request_body): ?array
    {
        $captured = null;

        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')->andReturn(['license_key' => 'ST-TEST-KEY'])
            ->shouldReceive('get_plan')->andReturn('byok');
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->andReturnNull();
        Mockery::mock('overload:Structura\Scheduler\Context_Builder')
            ->shouldReceive('build_brand_context')
            ->andReturn([
                'identity'          => ['name' => 'Jaba Messer', 'tagline' => ''],
                'content_footprint' => ['recent_topics' => [], 'categories' => [], 'tags' => []],
                'language'          => 'de-AT',
            ]);
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->with('/executeCloudSuggestion', Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }), Mockery::any())
            ->andReturn(['code' => 200, 'body' => ['name' => 'X', 'strategy' => 'Y'], 'raw' => null]);

        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('get_site_url')->justReturn('https://jaba.test');
        Functions\when('wp_parse_url')->justReturn('jaba.test');
        Functions\when('rest_ensure_response')->returnArg(1);

        $rest = new Rest_Api();
        $rest->handle_unified_suggestion($this->make_request($request_body));

        return $captured;
    }

    /** @test */
    public function it_forwards_the_campaign_language_beside_the_site_language(): void
    {
        $payload = $this->run_suggest([
            'mode'     => 'campaign',
            'provider' => 'gemini',
            'context'  => [],
            'language' => 'en',
        ]);

        $this->assertSame('en', $payload['language'] ?? null);
        // The site language is untouched — the cloud decides precedence.
        $this->assertSame('de-AT', $payload['site_identity']['language']);
    }

    /** @test */
    public function it_keeps_regional_variants_verbatim(): void
    {
        $payload = $this->run_suggest([
            'mode'     => 'topic_chips',
            'provider' => 'gemini',
            'context'  => [],
            'language' => 'de_CH',
        ]);

        $this->assertSame('de_CH', $payload['language'] ?? null);
    }

    /**
     * @test
     * @dataProvider not_forwarded
     */
    public function it_omits_the_key_for_the_site_default_sentinel_and_garbage(string $language): void
    {
        $payload = $this->run_suggest([
            'mode'     => 'campaign',
            'provider' => 'gemini',
            'context'  => [],
            'language' => $language,
        ]);

        $this->assertArrayNotHasKey('language', $payload);
    }

    /** @return array<string, array{string}> */
    public function not_forwarded(): array
    {
        return [
            'site default sentinel' => ['default'],
            'empty'                 => [''],
            'not a locale'          => ['<script>alert(1)</script>'],
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
