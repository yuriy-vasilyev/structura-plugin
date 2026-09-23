<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Wire contract of {@see Rest_Api::draft_campaign_setup()} — the wp-admin
 * proxy in front of the cloud's `executeDraftCampaignSetup` (spec
 * campaign-language-and-smart-setup.md §4.4). Pins that the stage and an
 * explicit campaign language reach the cloud, that "default" is NOT sent
 * (the cloud resolves the site language itself), and that the draft comes
 * back verbatim.
 *
 * @covers \Structura\Api\Rest_Api::draft_campaign_setup
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class DraftCampaignSetupTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @return array{payload: array<string, mixed>|null, result: mixed} */
    private function run_proxy(array $body, array $cloud = ['code' => 200, 'body' => ['success' => true, 'draft' => ['name' => 'Blog']]]): array
    {
        $captured = null;
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')->andReturn(['secret' => 's3']);
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->with('/executeDraftCampaignSetup', Mockery::on(function ($p) use (&$captured) {
                $captured = $p;
                return true;
            }), Mockery::any())
            ->andReturn($cloud + ['raw' => null]);

        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('home_url')->justReturn('https://site.test');
        Functions\when('wp_parse_url')->justReturn('site.test');
        Functions\when('rest_ensure_response')->returnArg(1);
        Functions\when('is_wp_error')->alias(fn($v) => $v instanceof \WP_Error);

        $rest   = new Rest_Api();
        $result = $rest->draft_campaign_setup($this->make_request($body));

        return ['payload' => $captured, 'result' => $result];
    }

    /** @test */
    public function it_forwards_stage_and_an_explicit_language_and_returns_the_draft(): void
    {
        $out = $this->run_proxy(['language' => 'de_AT', 'stage' => 'ai']);

        $this->assertSame('ai', $out['payload']['stage']);
        $this->assertSame('de_AT', $out['payload']['language']);
        $this->assertSame('ST-TEST-KEY', $out['payload']['license_key']);
        $this->assertSame(['name' => 'Blog'], $out['result']['draft']);
    }

    /** @test */
    public function it_omits_the_site_default_sentinel_and_clamps_the_stage(): void
    {
        $out = $this->run_proxy(['language' => 'default', 'stage' => 'bogus']);

        $this->assertArrayNotHasKey('language', $out['payload']);
        $this->assertSame('deterministic', $out['payload']['stage']);
    }

    /** @test */
    public function it_surfaces_a_cloud_failure_as_a_wp_error(): void
    {
        $out = $this->run_proxy([], ['code' => 500, 'body' => ['success' => false, 'error' => 'boom']]);

        $this->assertInstanceOf(\WP_Error::class, $out['result']);
        $this->assertSame('draft_failed', $out['result']->get_error_code());
    }

    /** @param array<string, mixed> $params */
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
