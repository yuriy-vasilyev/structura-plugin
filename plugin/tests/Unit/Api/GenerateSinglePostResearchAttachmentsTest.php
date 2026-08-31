<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the research-attachments wire contract in
 * {@see Rest_Api::generate_single_post()}.
 *
 * The "Generate a Post" page can attach uploaded research documents; their
 * refs must land on the inline ephemeral campaign in camelCase
 * (`campaign.researchAttachments`) — the shape the cloud's synthesis worker
 * reads. Pins:
 *   - `research_attachments` → `campaign.researchAttachments` [{id, name}]
 *   - malformed entries dropped, list capped at 5 (cloud-normalizer mirror)
 *   - absent → key not set (back-compat; run grounds on the objective alone)
 *
 * @covers \Structura\Api\Rest_Api::generate_single_post
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class GenerateSinglePostResearchAttachmentsTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Drive the handler to the transient-cache step and return the campaign
     * array it cached. Mirrors GenerateSinglePostSeoTargetingTest.
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

    /** @test */
    public function it_maps_attachment_refs_onto_the_inline_campaign(): void
    {
        $campaign = $this->run_and_capture_campaign([
            'topic'                => 'A practical guide to headless WordPress',
            'text_provider'        => 'gemini',
            'persona_id'           => 'p1',
            'research_attachments' => [
                ['id' => 'abc123def456', 'name' => 'market-research-q3.pdf'],
                ['id' => 'fed654cba321', 'name' => 'interview-notes.docx'],
            ],
        ]);

        $this->assertSame(
            [
                ['id' => 'abc123def456', 'name' => 'market-research-q3.pdf'],
                ['id' => 'fed654cba321', 'name' => 'interview-notes.docx'],
            ],
            $campaign['researchAttachments'] ?? null
        );
    }

    /** @test */
    public function it_drops_malformed_refs_and_caps_the_list_at_five(): void
    {
        $refs = [];
        for ($i = 0; $i < 7; $i++) {
            $refs[] = ['id' => "id{$i}", 'name' => "f{$i}.pdf"];
        }
        $refs[] = ['name' => 'no-id.pdf'];
        $refs[] = 'not-an-array';

        $campaign = $this->run_and_capture_campaign([
            'topic'                => 'A practical guide to headless WordPress',
            'text_provider'        => 'gemini',
            'persona_id'           => 'p1',
            'research_attachments' => $refs,
        ]);

        $this->assertCount(5, $campaign['researchAttachments']);
        $this->assertSame('id0', $campaign['researchAttachments'][0]['id']);
        $this->assertSame('id4', $campaign['researchAttachments'][4]['id']);
    }

    /** @test */
    public function it_omits_the_key_when_no_attachments_are_supplied(): void
    {
        $campaign = $this->run_and_capture_campaign([
            'topic'         => 'A practical guide to headless WordPress',
            'text_provider' => 'gemini',
            'persona_id'    => 'p1',
        ]);

        $this->assertArrayNotHasKey('researchAttachments', $campaign);
    }

    /**
     * Minimal WP_REST_Request stand-in — mirrors the sibling
     * GenerateSinglePostSeoTargetingTest helper.
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
