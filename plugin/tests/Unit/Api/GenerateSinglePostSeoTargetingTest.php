<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the single-post SEO Targeting wire contract in
 * {@see Rest_Api::generate_single_post()}.
 *
 * The "Generate a Post" page can attach a picked focus keyphrase + vetted
 * authority domains. The single post runs as an ephemeral campaign shipped
 * inline under `payload.campaign`, so these must land ON the campaign array
 * (the meta-keyed injection in Task_Runner is keyed on a real post id and
 * no-ops for the id=0 ephemeral run). This pins that mapping:
 *   - `focus_keyphrase` → `campaign.pickedKeyword.keyword`
 *   - `authority_domains` → `campaign.authorityDomains`
 *   - absent → neither key is set (cloud derives the keyword from the
 *     objective, exactly as before — back-compat).
 *
 * @covers \Structura\Api\Rest_Api::generate_single_post
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class GenerateSinglePostSeoTargetingTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Drive the handler to the transient-cache step and return the campaign
     * array it cached, so assertions can inspect the wire shape.
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

        // A successful run returns the success array, not a WP_Error.
        $this->assertIsArray($result);
        $this->assertTrue($result['success'] ?? false);

        return $captured['payload']['campaign'] ?? [];
    }

    /** @test */
    public function it_maps_focus_keyphrase_and_authority_onto_the_campaign(): void
    {
        $campaign = $this->run_and_capture_campaign([
            'topic'             => 'A practical guide to headless WordPress',
            'text_provider'     => 'gemini',
            'persona_id'        => 'p1',
            'focus_keyphrase'   => 'headless cms for wordpress',
            'authority_domains' => ['developer.mozilla.org', 'web.dev'],
        ]);

        $this->assertSame('headless cms for wordpress', $campaign['pickedKeyword']['keyword'] ?? null);
        $this->assertSame('manual', $campaign['pickedKeyword']['source'] ?? null);
        $this->assertSame(['developer.mozilla.org', 'web.dev'], $campaign['authorityDomains'] ?? null);
    }

    /** @test */
    public function it_omits_grounding_when_no_keyphrase_or_authority_is_supplied(): void
    {
        $campaign = $this->run_and_capture_campaign([
            'topic'         => 'A practical guide to headless WordPress',
            'text_provider' => 'gemini',
            'persona_id'    => 'p1',
        ]);

        // No picked keyword / authority → cloud derives from the objective.
        $this->assertArrayNotHasKey('pickedKeyword', $campaign);
        $this->assertArrayNotHasKey('authorityDomains', $campaign);
    }

    /** @test */
    public function it_maps_a_valid_model_tier_onto_the_inline_campaign(): void
    {
        // The single post-gen picker sends text_tier/image_tier; they must ride
        // on the ephemeral campaign's intelligence block so the cloud resolves
        // the concrete model at gen time (preferring the tier over *_model).
        $campaign = $this->run_and_capture_campaign([
            'topic'         => 'A practical guide to headless WordPress',
            'text_provider' => 'gemini',
            'persona_id'    => 'p1',
            'text_tier'     => 'top',
            'image_tier'    => 'mid',
        ]);

        $this->assertSame('top', $campaign['intelligence']['textTier'] ?? null);
        $this->assertSame('mid', $campaign['intelligence']['imageTier'] ?? null);
    }

    /** @test */
    public function it_leaves_the_model_tier_null_when_none_is_picked(): void
    {
        // No tier picked → null on the inline campaign, so the cloud falls back
        // to the concrete textModel/imageModel exactly as before the picker.
        $campaign = $this->run_and_capture_campaign([
            'topic'         => 'A practical guide to headless WordPress',
            'text_provider' => 'gemini',
            'persona_id'    => 'p1',
        ]);

        $this->assertArrayHasKey('textTier', $campaign['intelligence']);
        $this->assertNull($campaign['intelligence']['textTier']);
        $this->assertArrayHasKey('imageTier', $campaign['intelligence']);
        $this->assertNull($campaign['intelligence']['imageTier']);
    }

    /**
     * Minimal `WP_REST_Request` stand-in exposing `get_json_params()`.
     * PHP 7.4-compatible (the CI matrix still parses 7.4).
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
