<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * @covers \Structura\Api\Rest_Api::handle_unified_suggestion
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class PostStrategySuggestionTest extends TestCase
{
    /** @test */
    public function it_forwards_the_one_off_flag_and_omits_it_for_legacy_campaign_requests(): void
    {
        $captured = [];
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_plan')->andReturn('cloud')
            ->shouldReceive('get_license_data')->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')->andReturn([]);
        Mockery::mock('overload:Structura\Scheduler\Context_Builder')
            ->shouldReceive('build_brand_context')->andReturn(['identity' => ['name' => 'Example']]);
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->with('/executeCloudSuggestion', Mockery::type('array'), Mockery::any())
            ->andReturnUsing(function ($endpoint, $payload) use (&$captured) {
                $captured[] = $payload;
                return ['code' => 200, 'body' => ['result' => ['strategy' => 'A focused brief.']]];
            });

        Functions\when('get_site_url')->justReturn('https://site.test');
        Functions\when('wp_parse_url')->justReturn('site.test');
        Functions\when('rest_ensure_response')->returnArg(1);
        Functions\when('is_wp_error')->justReturn(false);

        $rest = new Rest_Api();
        $result = $rest->handle_unified_suggestion(['mode' => 'campaign', 'singlePost' => true]);
        $rest->handle_unified_suggestion(['mode' => 'campaign']);

        $this->assertSame(true, $captured[0]['singlePost']);
        $this->assertArrayNotHasKey('singlePost', $captured[1]);
        $this->assertSame('A focused brief.', $result['result']['strategy']);
    }
}
