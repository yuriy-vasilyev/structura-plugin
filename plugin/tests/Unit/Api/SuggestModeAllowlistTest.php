<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The modes {@see Rest_Api::handle_unified_suggestion()} accepts.
 *
 * 2026-11-13: `topic_chips` fed the campaign interview's topic seeds. The
 * interview and its client query were deleted on 2026-09-24 (66dc1bb5), and
 * this route only serves the SPA bundled with the same plugin release, so
 * the mode is refused like any unknown one. The cloud keeps its own
 * `topic_chips` mode for older plugin releases.
 *
 * @covers \Structura\Api\Rest_Api::handle_unified_suggestion
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SuggestModeAllowlistTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_refuses_the_retired_topic_chips_mode_without_calling_the_cloud(): void
    {
        // Everything an accepted mode reaches, so only the allowlist can stop the call.
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
            ->never()
            ->andReturn(['code' => 200, 'body' => ['result' => ['topics' => []]], 'raw' => null]);
        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('get_site_url')->justReturn('https://jaba.test');
        Functions\when('wp_parse_url')->justReturn('jaba.test');
        Functions\when('rest_ensure_response')->returnArg(1);

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Invalid suggestion mode.');

        (new Rest_Api())->handle_unified_suggestion(new \ArrayObject([
            'mode'     => 'topic_chips',
            'provider' => 'gemini',
            'context'  => [],
        ]));
    }
}
