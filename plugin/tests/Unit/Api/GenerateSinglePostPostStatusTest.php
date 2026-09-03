<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Regression tests for the `post_status` wire mapping in
 * {@see Rest_Api::generate_single_post()}.
 *
 * wp.org first-impression QA, 2026-09-02: the SPA's Post Status picker
 * arrives as `post_status`, but the ephemeral campaign array never carried
 * `structure.postStatus`. Task_Runner's `?? 'draft'` fallback then saved
 * EVERY one-off post as a draft regardless of the user's choice, and the
 * run receipt (which reads the cloud-side inputSnapshot) mislabelled
 * drafts "Post published". Same bug the portal twin fixed on 2026-07-20
 * (portal-run.ts). These pin the mapping:
 *   - `post_status` publish|draft|pending → `campaign.structure.postStatus`
 *   - absent or invalid → 'draft' (the safe Task_Runner default)
 *
 * @covers \Structura\Api\Rest_Api::generate_single_post
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class GenerateSinglePostPostStatusTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Drive the handler to the transient-cache step and return the campaign
     * array it cached, so assertions can inspect the wire shape. Mirrors
     * {@see GenerateSinglePostSeoTargetingTest::run_and_capture_campaign()}.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function run_and_capture_campaign(array $params): array
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->with('/listPersonas', [], Mockery::any())
            ->andReturn([
                'code' => 200,
                'body' => ['personas' => [['personaId' => 'p1', 'name' => 'House voice']]],
                'raw'  => null,
            ]);

        Mockery::mock('alias:Structura\Scheduler\Campaign_Validator')
            ->shouldReceive('normalize_persona_id_public')
            ->andReturn('p1');

        Functions\when('wp_generate_uuid4')->justReturn('00000000-0000-0000-0000-000000000000');
        Functions\when('as_enqueue_async_action')->justReturn(123);
        Functions\when('rest_ensure_response')->returnArg(1);

        $captured = [];
        Functions\when('set_transient')->alias(
            static function ($key, $value) use (&$captured) {
                $captured['payload'] = $value;
                return true;
            }
        );

        $rest   = new Rest_Api();
        $result = $rest->generate_single_post($this->make_request($params));

        $this->assertIsArray($result);
        $this->assertTrue($result['success'] ?? false);

        return $captured['payload']['campaign'] ?? [];
    }

    /**
     * Minimal WP_REST_Request stand-in (mirrors the sibling tests).
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

    /** @test */
    public function it_forwards_the_chosen_publish_status_onto_the_structure_cluster(): void
    {
        $campaign = $this->run_and_capture_campaign([
            'topic'         => 'A practical guide to coffee roasting at home',
            'text_provider' => 'openai',
            'persona_id'    => 'p1',
            'post_status'   => 'publish',
        ]);

        $this->assertSame('publish', $campaign['structure']['postStatus'] ?? null);
    }

    /** @test */
    public function it_forwards_draft_and_pending_verbatim(): void
    {
        foreach (['draft', 'pending'] as $status) {
            $campaign = $this->run_and_capture_campaign([
                'topic'         => 'Water temperature and brew extraction',
                'text_provider' => 'openai',
                'persona_id'    => 'p1',
                'post_status'   => $status,
            ]);

            $this->assertSame($status, $campaign['structure']['postStatus'] ?? null);
        }
    }

    /** @test */
    public function it_defaults_to_draft_when_the_status_is_absent_or_invalid(): void
    {
        foreach ([[], ['post_status' => 'private'], ['post_status' => '']] as $extra) {
            $campaign = $this->run_and_capture_campaign(array_merge([
                'topic'         => 'Single-origin beans vs blends',
                'text_provider' => 'openai',
                'persona_id'    => 'p1',
            ], $extra));

            $this->assertSame('draft', $campaign['structure']['postStatus'] ?? null);
        }
    }
}
