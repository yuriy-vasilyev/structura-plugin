<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The provider wizard's "Use recommended model" switch (2026-10-06,
 * specs/open-providers.md). Beside the per-provider model id the wizard
 * stores, it may store the model TIER (`text_tier` / `image_tier`), the
 * same pair campaigns carry (`textTier` + `textModel`). A stored tier lets
 * the site default follow the catalog when the tier's model moves; an
 * empty tier means the site picked a concrete model and keeps it.
 *
 * @covers \Structura\Api\Rest_Api::update_settings
 * @covers \Structura\Api\Rest_Api::build_settings_payload
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ProviderModelTierSettingsTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $options = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->options = [];

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            'sanitize_text_field'  => function ($v) { return is_string($v) ? trim($v) : ''; },
            'sanitize_key'         => function ($v) { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string)$v)); },
            'get_current_user_id'  => 1,
            'get_user_meta'        => '',
            // A warm model cache, so no cloud call happens.
            'get_transient'        => [
                'openai'    => ['defaults' => ['text' => 'gpt-5.6-sol', 'image' => 'gpt-image-1-mini']],
                'gemini'    => ['defaults' => ['text' => 'gemini-3.8-flash', 'image' => 'gemini-3.1-flash-image']],
                'anthropic' => ['defaults' => ['text' => 'claude-sonnet-5-5']],
            ],
        ]);
        Functions\when('update_option')->alias(function ($key, $value) {
            $this->options[$key] = $value;
            return true;
        });
        Functions\when('get_option')->alias(function ($key, $default = false) {
            return array_key_exists($key, $this->options) ? $this->options[$key] : $default;
        });

        $license = Mockery::mock('alias:Structura\Core\License_Manager');
        $license->shouldReceive('get_plan')->andReturn('free');
        $license->shouldReceive('get_license_data')->andReturn(['plan' => 'free']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('get_provider_bindings')->andReturn([]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function a_recommended_tier_round_trips_beside_the_mirrored_model(): void
    {
        (new Rest_Api())->update_settings($this->request([
            'ai' => [
                'anthropic' => ['text_model' => 'claude-sonnet-5-5', 'text_tier' => 'mid'],
                'gemini'    => ['image_model' => 'gemini-3.1-flash-image', 'image_tier' => 'mid'],
            ],
        ]));

        $this->assertSame('mid', $this->options['structura_text_tier_anthropic']);
        $this->assertSame('mid', $this->options['structura_image_tier_gemini']);

        $payload = Rest_Api::build_settings_payload([]);
        $this->assertSame('mid', $payload['ai']['providers']['anthropic']['text_tier']);
        $this->assertSame('claude-sonnet-5-5', $payload['ai']['providers']['anthropic']['text_model']);
        $this->assertSame('mid', $payload['ai']['providers']['gemini']['image_tier']);
    }

    /** @test */
    public function a_picked_model_clears_the_tier(): void
    {
        $this->options['structura_text_tier_openai'] = 'mid';

        (new Rest_Api())->update_settings($this->request([
            'ai' => ['openai' => ['text_model' => 'gpt-6-astra', 'text_tier' => '']],
        ]));

        $this->assertSame('', $this->options['structura_text_tier_openai']);
        $payload = Rest_Api::build_settings_payload([]);
        $this->assertSame('', $payload['ai']['providers']['openai']['text_tier']);
        $this->assertSame('gpt-6-astra', $payload['ai']['providers']['openai']['text_model']);
    }

    /** @test */
    public function a_tier_outside_top_and_mid_is_stored_empty(): void
    {
        (new Rest_Api())->update_settings($this->request([
            'ai' => ['openai' => ['text_tier' => 'cheap<script>', 'image_tier' => 'TOP']],
        ]));

        $this->assertSame('', $this->options['structura_text_tier_openai']);
        $this->assertSame('top', $this->options['structura_image_tier_openai']);
    }

    /** @test */
    public function a_site_that_never_used_the_switch_reads_no_tier(): void
    {
        $payload = Rest_Api::build_settings_payload([]);

        $this->assertSame('', $payload['ai']['providers']['gemini']['text_tier']);
        $this->assertSame('', $payload['ai']['providers']['gemini']['image_tier']);
        // Every provider is listed on Free since 2026-10-06.
        $this->assertSame(['openai', 'gemini', 'anthropic'], array_keys($payload['ai']['providers']));
    }

    private function request(array $params): object
    {
        return new class($params) {
            private array $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }
}
